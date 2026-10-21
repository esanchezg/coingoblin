"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { chores, completions, householdInvites, households, kids, payouts } from "@/db/schema";
import { currentParent, findMembership } from "@/lib/current-parent";
import { getOrCreateParentEarner } from "@/lib/parent-earner";
import { findOpenInvite } from "@/lib/queries";
import { hashToken, newToken } from "@/lib/tokens";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

async function requireParent() {
  const parent = await currentParent();
  if (!parent) throw new Error("Not authenticated");
  return parent;
}

// Makes a one-time invite link and shows it on the Kids page. The token is only ever in the
// URL handed to the inviter; the database keeps its hash.
export async function createInvite() {
  const parent = await requireParent();
  const token = newToken();
  await getDb().insert(householdInvites).values({
    parentUserId: parent.householdId,
    tokenHash: hashToken(token),
    createdByUserId: parent.userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  redirect(`/dashboard/kids?invite=${token}`);
}

// A household the user created but never used (opening the dashboard creates one), which
// can be dropped so they can join another. Anything real in it — kids, chores, other parents,
// or their own earnings — keeps it.
async function isUnusedOwnHousehold(userId: string) {
  const db = getDb();
  const members = await db
    .select({ id: kids.id, isParent: kids.isParent, clerkUserId: kids.clerkUserId })
    .from(kids)
    .where(eq(kids.parentUserId, userId));
  const others = members.filter((m) => !m.isParent || (m.clerkUserId !== null && m.clerkUserId !== userId));
  if (others.length > 0) return false;
  const [chore] = await db.select({ id: chores.id }).from(chores).where(eq(chores.parentUserId, userId)).limit(1);
  if (chore) return false;
  const ids = members.map((m) => m.id);
  if (ids.length === 0) return true;
  const [done] = await db.select({ id: completions.id }).from(completions).where(inArray(completions.kidId, ids)).limit(1);
  const [paid] = await db.select({ id: payouts.id }).from(payouts).where(inArray(payouts.kidId, ids)).limit(1);
  return !done && !paid;
}

async function dropOwnHousehold(userId: string) {
  const db = getDb();
  await db.delete(kids).where(eq(kids.parentUserId, userId));
  await db.delete(householdInvites).where(eq(householdInvites.parentUserId, userId));
  await db.delete(households).where(eq(households.parentUserId, userId));
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const back = (error: string) => redirect(`/invite/${token}?error=${encodeURIComponent(error)}`);

  const { userId } = await auth();
  if (!userId) back("Please sign in first.");
  const invite = await findOpenInvite(token);
  if (!invite) back("This invite link is invalid, expired or already used.");

  const membership = await findMembership(userId!);
  if (membership?.householdId === invite!.householdId) redirect("/dashboard");
  if (membership) {
    const ownsUnused = membership.householdId === userId && (await isUnusedOwnHousehold(userId!));
    if (!ownsUnused) back("This account already belongs to a family. Ask for its access to be turned off first.");
  }

  const db = getDb();
  // Claim the invite atomically so a link can only ever be used once.
  const [claimed] = await db
    .update(householdInvites)
    .set({ usedAt: new Date(), usedByUserId: userId })
    .where(and(eq(householdInvites.id, invite!.id), isNull(householdInvites.usedAt)))
    .returning({ id: householdInvites.id });
  if (!claimed) back("This invite link is invalid, expired or already used.");

  try {
    if (membership) await dropOwnHousehold(userId!);
    await getOrCreateParentEarner(invite!.householdId, userId!, name);
  } catch (e) {
    await db
      .update(householdInvites)
      .set({ usedAt: null, usedByUserId: null })
      .where(eq(householdInvites.id, invite!.id));
    throw e;
  }
  redirect("/dashboard");
}

// Turns another parent's access off or back on. The household's creator can't be turned off:
// their Clerk id is the household's id.
export async function setParentAccess(formData: FormData) {
  const parent = await requireParent();
  const earnerId = String(formData.get("earnerId") ?? "");
  const disabled = formData.get("disabled") === "1";
  if (earnerId === parent.earnerId) throw new Error("You can't turn off your own access");

  const db = getDb();
  const [target] = await db
    .update(kids)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(
      and(
        eq(kids.id, earnerId),
        eq(kids.parentUserId, parent.householdId),
        eq(kids.isParent, true),
        ne(kids.clerkUserId, parent.householdId),
      ),
    )
    .returning({ clerkUserId: kids.clerkUserId });
  if (!target) throw new Error("Not found");

  // Their unused invite links stop working too.
  if (disabled && target.clerkUserId) {
    await db
      .delete(householdInvites)
      .where(
        and(
          eq(householdInvites.parentUserId, parent.householdId),
          eq(householdInvites.createdByUserId, target.clerkUserId),
          isNull(householdInvites.usedAt),
        ),
      );
  }
  revalidatePath("/dashboard/kids");
}
