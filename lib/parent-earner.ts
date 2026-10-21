import { currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { kids } from "@/db/schema";

// Not a real bcrypt hash (wrong length), so bcryptjs.compare() always returns
// false against it — this row is unauthenticatable by construction.
const PARENT_NO_LOGIN_HASH = "no-login";
const PARENT_COLOR = "#475569";

async function findByClerkUser(userId: string) {
  const [row] = await getDb().select().from(kids).where(eq(kids.clerkUserId, userId)).limit(1);
  return row ?? null;
}

// One earner row per parent (Clerk user) in the household. `name` defaults to their Clerk first name.
export async function getOrCreateParentEarner(parentUserId: string, userId: string, name?: string) {
  const db = getDb();
  const existing = await findByClerkUser(userId);
  if (existing) return existing;

  // The owner's row predates per-parent ids, so it's claimed on first sight.
  if (userId === parentUserId) {
    const [claimed] = await db
      .update(kids)
      .set({ clerkUserId: userId })
      .where(and(eq(kids.parentUserId, parentUserId), eq(kids.isParent, true), isNull(kids.clerkUserId)))
      .returning();
    if (claimed) return claimed;
  }

  const displayName = name?.trim() || (await currentUser())?.firstName?.trim() || "Parent";

  try {
    const [created] = await db
      .insert(kids)
      .values({ parentUserId, name: displayName, pinHash: PARENT_NO_LOGIN_HASH, color: PARENT_COLOR, isParent: true, clerkUserId: userId })
      .returning();
    return created;
  } catch {
    const row = await findByClerkUser(userId);
    if (row) return row;
    throw new Error("Could not create parent earner");
  }
}
