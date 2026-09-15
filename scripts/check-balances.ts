import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";
import { getEarnersWithBalances } from "../lib/queries";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const [chore] = await db.select().from(chores).where(eq(chores.parentUserId, parentUserId)).limit(1);

  const earnersBefore = await getEarnersWithBalances(parentUserId);
  const parentRow = earnersBefore.find((e) => e.isParent);
  console.log("1) parent row present on leaderboard:", parentRow ? "PASS" : "FAIL", parentRow);
  console.log(
    "2) no pinHash key on any earner:",
    earnersBefore.every((e) => !("pinHash" in e)) ? "PASS" : "FAIL",
  );

  const balanceBefore = parentRow?.balanceCents ?? 0;

  // Simulate a parent-logged completion (what logCompletionFor does, minus the auth wrapper)
  const parentKidRow = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const parent = parentKidRow.find((k) => k.isParent)!;
  await db.insert(completions).values({
    choreId: chore.id,
    kidId: parent.id,
    occurrenceDate: "check-balances-occurrence",
    status: "approved",
    reviewedAt: new Date(),
  });

  const earnersAfter = await getEarnersWithBalances(parentUserId);
  const parentAfter = earnersAfter.find((e) => e.isParent);
  console.log(
    "3) parent balance increased after approved completion:",
    (parentAfter?.balanceCents ?? 0) > balanceBefore ? "PASS" : "FAIL",
    { before: balanceBefore, after: parentAfter?.balanceCents },
  );

  await db.delete(completions).where(eq(completions.occurrenceDate, "check-balances-occurrence"));
}

main().then(() => process.exit(0));
