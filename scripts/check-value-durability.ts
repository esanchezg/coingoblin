import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";
import { getEarnersWithBalances } from "../lib/queries";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const [ripley] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.parentUserId, parentUserId), eq(kids.name, "Ripley")));

  // A fresh one-time chore, just for this test.
  const [chore] = await db
    .insert(chores)
    .values({ parentUserId, title: "Durability test chore", valueCents: 250, recurrence: "once" })
    .returning();

  // Kid completes it (mirrors completeChore's insert, now including valueCents).
  await db.insert(completions).values({
    choreId: chore.id,
    kidId: ripley.id,
    occurrenceDate: "0001-01-01",
    status: "approved",
    reviewedAt: new Date(),
    valueCents: chore.valueCents,
  });

  const before = await getEarnersWithBalances(parentUserId);
  const ripleyBefore = before.find((e) => e.id === ripley.id)?.balanceCents ?? 0;
  console.log("1) balance after completion+approval includes $2.50:", ripleyBefore >= 250 ? "PASS" : "FAIL", ripleyBefore);

  // Edit the chore's value (simulating the new "Edit" feature) — should NOT
  // retroactively change what's already been earned.
  await db.update(chores).set({ valueCents: 999 }).where(eq(chores.id, chore.id));
  const afterEdit = await getEarnersWithBalances(parentUserId);
  const ripleyAfterEdit = afterEdit.find((e) => e.id === ripley.id)?.balanceCents ?? 0;
  console.log(
    "2) editing the chore's value does NOT change the already-earned balance:",
    ripleyAfterEdit === ripleyBefore ? "PASS" : "FAIL",
    { before: ripleyBefore, afterEdit: ripleyAfterEdit },
  );

  // Delete the chore entirely (the exact bug scenario) — balance must be unaffected.
  await db.delete(chores).where(eq(chores.id, chore.id));
  const afterDelete = await getEarnersWithBalances(parentUserId);
  const ripleyAfterDelete = afterDelete.find((e) => e.id === ripley.id)?.balanceCents ?? 0;
  console.log(
    "3) deleting the chore does NOT change the already-earned balance (the bug):",
    ripleyAfterDelete === ripleyBefore ? "PASS" : "FAIL",
    { before: ripleyBefore, afterDelete: ripleyAfterDelete },
  );

  // Cleanup
  await db.delete(completions).where(eq(completions.choreId, chore.id));
}

main().then(() => process.exit(0));
