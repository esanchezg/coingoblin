import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { kids } from "@/db/schema";

// Not a real bcrypt hash (wrong length), so bcryptjs.compare() always returns
// false against it — this row is unauthenticatable by construction.
const PARENT_NO_LOGIN_HASH = "no-login";
const PARENT_COLOR = "#475569";

export async function getOrCreateParentEarner(parentUserId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.parentUserId, parentUserId), eq(kids.isParent, true)))
    .limit(1);
  if (existing) return existing;

  const user = await currentUser();
  const name = user?.firstName?.trim() || "Parent";

  try {
    const [created] = await db
      .insert(kids)
      .values({ parentUserId, name, pinHash: PARENT_NO_LOGIN_HASH, color: PARENT_COLOR, isParent: true })
      .returning();
    return created;
  } catch {
    const [row] = await db
      .select()
      .from(kids)
      .where(and(eq(kids.parentUserId, parentUserId), eq(kids.isParent, true)))
      .limit(1);
    if (row) return row;
    throw new Error("Could not create parent earner");
  }
}
