import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, households, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const choreRows = await db.select().from(chores).where(eq(chores.parentUserId, parentUserId));

  for (const chore of choreRows) {
    await db.delete(completions).where(eq(completions.choreId, chore.id));
  }
  for (const kid of kidRows) {
    await db.delete(kids).where(eq(kids.id, kid.id));
  }
  await db.delete(chores).where(eq(chores.parentUserId, parentUserId));
  await db.delete(households).where(eq(households.parentUserId, parentUserId));

  console.log("Cleaned up test data");
}

main().then(() => process.exit(0));
