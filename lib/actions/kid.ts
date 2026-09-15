"use server";

import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { chores, completions, kids } from "@/db/schema";
import { isScheduledToday, occurrenceDateFor } from "@/lib/chore-schedule";
import { clearKidSession, createKidSession, getKidSession } from "@/lib/kid-session";
import { getHouseholdByFamilyCode, getKidsForParent } from "@/lib/queries";

export async function lookupHouseholdByCode(familyCode: string) {
  const household = await getHouseholdByFamilyCode(familyCode);
  if (!household) return { ok: false as const, error: "That family code wasn't found." };

  const kidRows = await getKidsForParent(household.parentUserId);
  return {
    ok: true as const,
    parentUserId: household.parentUserId,
    kids: kidRows.map((k) => ({ id: k.id, name: k.name, color: k.color })),
  };
}

export async function verifyKidPinAndLogin(kidId: string, parentUserId: string, pin: string) {
  const db = getDb();
  const [kid] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.id, kidId), eq(kids.parentUserId, parentUserId)))
    .limit(1);
  if (!kid || kid.isParent) return { ok: false as const, error: "Profile not found." };

  const valid = await bcrypt.compare(pin, kid.pinHash);
  if (!valid) return { ok: false as const, error: "Wrong PIN, try again." };

  await createKidSession(kid.id, parentUserId);
  redirect("/kid");
}

export async function kidLogout() {
  await clearKidSession();
  redirect("/kid-login");
}

export async function completeChore(choreId: string) {
  const session = await getKidSession();
  if (!session) throw new Error("Not logged in");

  const db = getDb();
  const [chore] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.id, choreId), eq(chores.parentUserId, session.parentUserId), eq(chores.active, true)))
    .limit(1);
  if (!chore) throw new Error("Chore not found");
  if (chore.assignedKidId && chore.assignedKidId !== session.kid.id) {
    throw new Error("This chore isn't assigned to you");
  }
  if (!isScheduledToday(chore)) throw new Error("Not scheduled today");

  await db
    .insert(completions)
    .values({
      choreId: chore.id,
      kidId: session.kid.id,
      occurrenceDate: occurrenceDateFor(chore),
    })
    .onConflictDoUpdate({
      target: [completions.choreId, completions.occurrenceDate],
      // A conflict on a pending/approved row silently no-ops (double-tap or lost
      // race with a sibling) instead of throwing. Only a previously rejected
      // attempt gets overwritten with this fresh one.
      setWhere: sql`${completions.status} = 'rejected'`,
      set: {
        kidId: session.kid.id,
        status: "pending",
        completedAt: new Date(),
        reviewedAt: null,
      },
    });

  revalidatePath("/kid");
}
