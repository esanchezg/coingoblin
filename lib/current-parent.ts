import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households, kids } from "@/db/schema";
import { currentMcpParent } from "@/lib/mcp-context";
import { getOrCreateParentEarner } from "@/lib/parent-earner";
import { getOrCreateHousehold } from "@/lib/queries";

// householdId is the household's parentUserId (its creator's Clerk id); userId is whoever
// is signed in, which differs from it for every parent but the creator.
export type CurrentParent = { householdId: string; userId: string; earnerId: string };

// The household a Clerk user belongs to, or null if they have none yet.
export async function findHouseholdForUser(userId: string): Promise<string | null> {
  const db = getDb();
  const [member] = await db
    .select({ householdId: kids.parentUserId })
    .from(kids)
    .where(eq(kids.clerkUserId, userId))
    .limit(1);
  if (member) return member.householdId;
  // A creator whose earner row hasn't been claimed yet (see getOrCreateParentEarner).
  const [owned] = await db
    .select({ householdId: households.parentUserId })
    .from(households)
    .where(eq(households.parentUserId, userId))
    .limit(1);
  return owned?.householdId ?? null;
}

// The signed-in parent (Clerk session, or the MCP caller pinned in lib/mcp-context.ts).
// A parent with no household yet gets a new one of their own.
export async function currentParent(): Promise<CurrentParent | null> {
  const userId = currentMcpParent()?.userId ?? (await auth()).userId;
  if (!userId) return null;
  const householdId =
    (await findHouseholdForUser(userId)) ?? (await getOrCreateHousehold(userId)).parentUserId;
  const earner = await getOrCreateParentEarner(householdId, userId);
  return { householdId, userId, earnerId: earner.id };
}
