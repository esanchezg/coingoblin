import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const [chore] = await db.select().from(chores).where(eq(chores.parentUserId, parentUserId)).limit(1);
  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const [kidA, kidB] = kidRows.filter((k) => !k.isParent);
  if (!chore || !kidA || !kidB) throw new Error("Run seed-test-data.ts first (need 2 kids).");

  const occurrenceDate = "check-upsert-occurrence";

  async function upsert(kidId: string) {
    await db
      .insert(completions)
      .values({ choreId: chore.id, kidId, occurrenceDate })
      .onConflictDoUpdate({
        target: [completions.choreId, completions.occurrenceDate],
        setWhere: sql`${completions.status} = 'rejected'`,
        set: { kidId, status: "pending", completedAt: new Date(), reviewedAt: null },
      });
  }

  async function current() {
    const [row] = await db
      .select()
      .from(completions)
      .where(eq(completions.choreId, chore.id));
    return row;
  }

  // clean slate for this synthetic occurrence
  await db.delete(completions).where(eq(completions.occurrenceDate, occurrenceDate));

  await upsert(kidA.id);
  let row = await current();
  console.log("1) insert:", row?.kidId === kidA.id && row?.status === "pending" ? "PASS" : "FAIL", row);

  await db.update(completions).set({ status: "rejected" }).where(eq(completions.id, row!.id));
  await upsert(kidB.id);
  row = await current();
  console.log(
    "2) re-attempt after rejection by a different kid:",
    row?.kidId === kidB.id && row?.status === "pending" ? "PASS" : "FAIL",
    row,
  );

  const beforeThirdAttempt = row;
  await upsert(kidA.id); // now pending — this must silently no-op, not throw
  row = await current();
  console.log(
    "3) double-tap while pending (no throw, unchanged):",
    row?.kidId === beforeThirdAttempt!.kidId && row?.status === "pending" ? "PASS" : "FAIL",
    row,
  );

  await db.delete(completions).where(eq(completions.occurrenceDate, occurrenceDate));
}

main().then(() => process.exit(0));
