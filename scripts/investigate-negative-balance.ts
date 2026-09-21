import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, households, kids, payouts } from "../db/schema";
import { getEarnersWithBalances } from "../lib/queries";

async function main() {
  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.parentUserId, "user_3JInkNASQFUezik0kIA9FqEFdFJ"));
  if (!household) {
    console.log("Real household not found under expected id — listing all households:");
    console.log(await db.select().from(households));
    return;
  }
  const parentUserId = household.parentUserId;

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  console.log("Kids:", kidRows.map((k) => ({ id: k.id, name: k.name, isParent: k.isParent })));

  const balances = await getEarnersWithBalances(parentUserId);
  console.log("\nCurrent balances (via app's own query):", balances.map((b) => ({ name: b.name, balanceCents: b.balanceCents })));

  const existingChores = await db.select().from(chores).where(eq(chores.parentUserId, parentUserId));
  const existingChoreIds = existingChores.map((c) => c.id);
  console.log(`\n${existingChores.length} chore rows currently exist.`);

  const kidIds = kidRows.map((k) => k.id);
  const allCompletions = await db.select().from(completions).where(inArray(completions.kidId, kidIds));
  console.log(`\n${allCompletions.length} total completion rows for this household's earners.`);

  const orphaned = existingChoreIds.length
    ? allCompletions.filter((c) => !existingChoreIds.includes(c.choreId))
    : allCompletions;
  console.log(`\n${orphaned.length} ORPHANED completion(s) (choreId no longer exists in chores table):`);
  for (const o of orphaned) {
    const kid = kidRows.find((k) => k.id === o.kidId);
    console.log({
      completionId: o.id,
      choreId: o.choreId,
      kid: kid?.name,
      occurrenceDate: o.occurrenceDate,
      status: o.status,
      completedAt: o.completedAt,
      reviewedAt: o.reviewedAt,
    });
  }

  const allPayouts = await db.select().from(payouts).where(inArray(payouts.kidId, kidIds));
  console.log(`\n${allPayouts.length} payout row(s):`);
  for (const p of allPayouts) {
    const kid = kidRows.find((k) => k.id === p.kidId);
    console.log({
      payoutId: p.id,
      kid: kid?.name,
      amountCents: p.amountCents,
      note: p.note,
      createdAt: p.createdAt,
    });
  }
}

main().then(() => process.exit(0));
