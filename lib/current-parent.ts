import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { households, kids } from "@/db/schema";
import { currentMcpParent } from "@/lib/mcp-context";
import { getOrCreateParentEarner } from "@/lib/parent-earner";
import { getOrCreateHousehold } from "@/lib/queries";

// householdId is the household's parentUserId (its creator's Clerk id); userId is whoever
// is signed in, which differs from it for every parent but the creator.
export type CurrentParent = { householdId: string; userId: string; earnerId: string };

// The household a Clerk user belongs to (null if none yet), and whether their access is off.
export async function findMembership(userId: string): Promise<{ householdId: string; disabled: boolean } | null> {
  const db = getDb();
  const [member] = await db
    .select({ householdId: kids.parentUserId, disabledAt: kids.disabledAt })
    .from(kids)
    .where(eq(kids.clerkUserId, userId))
    .limit(1);
  if (member) return { householdId: member.householdId, disabled: member.disabledAt !== null };
  // A creator whose earner row hasn't been claimed yet (see getOrCreateParentEarner).
  const [owned] = await db
    .select({ householdId: households.parentUserId })
    .from(households)
    .where(eq(households.parentUserId, userId))
    .limit(1);
  return owned ? { householdId: owned.householdId, disabled: false } : null;
}

// The household a Clerk user can act in, or null if they have none or their access is off.
export async function findHouseholdForUser(userId: string): Promise<string | null> {
  const membership = await findMembership(userId);
  return membership && !membership.disabled ? membership.householdId : null;
}

// The signed-in parent (Clerk session, or the MCP caller pinned in lib/mcp-context.ts).
// A parent with no household yet gets a new one of their own; one whose access was
// turned off gets null. Cached so a layout and page share one lookup per request.
export const currentParent = cache(async (): Promise<CurrentParent | null> => {
  const userId = currentMcpParent()?.userId ?? (await auth()).userId;
  if (!userId) return null;
  const membership = await findMembership(userId);
  if (membership?.disabled) return null;
  const householdId = membership?.householdId ?? (await getOrCreateHousehold(userId)).parentUserId;
  const earner = await getOrCreateParentEarner(householdId, userId);
  return { householdId, userId, earnerId: earner.id };
});
