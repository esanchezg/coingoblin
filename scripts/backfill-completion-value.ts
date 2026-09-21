// One-time backfill, applied 2026-09-20. Safe (idempotent) to re-run.
//
// completions.valueCents was just added — existing rows all default to 0. This
// backfills every completion whose chore still exists from that chore's current
// value (the same number the app was already using to compute balances before
// this change, so this is a no-op for correctness — it just moves the value onto
// the completion row so it survives the chore being edited or deleted later).
//
// It also corrects the two specific orphaned completions found for Evan (chores
// that were deleted after being approved, whose value was lost — see the
// investigation this script's sibling ran). Per explicit instruction from the
// parent: don't try to reconstruct exact historical values, just make Evan's
// balance net to $0 (he's already been paid in full for both).
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/backfill-completion-value.ts
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { completions } from "../db/schema";

const EVAN_SEP19_COMPLETION_ID = "a11a4c6a-08a8-489a-80d0-f645d8421ebc"; // approved 2026-09-19
const EVAN_SEP16_COMPLETION_ID = "87dc729b-1cf1-4d5e-b9d4-fea7a380dce5"; // approved 2026-09-16

async function main() {
  const db = getDb();

  // 1) Backfill every completion whose chore still exists.
  const result = await db.execute(sql`
    UPDATE completions
    SET value_cents = chores.value_cents
    FROM chores
    WHERE completions.chore_id = chores.id
  `);
  console.log(`Backfilled value_cents for ${result.rowCount ?? "?"} completion(s) with an existing chore.`);

  // 2) Correct Evan's two orphaned completions (chore no longer exists) to net to $0.
  for (const { id, cents, label } of [
    { id: EVAN_SEP19_COMPLETION_ID, cents: 100, label: "Sep 19 orphan -> $1.00" },
    { id: EVAN_SEP16_COMPLETION_ID, cents: 0, label: "Sep 16 orphan -> $0.00" },
  ]) {
    const [before] = await db.select().from(completions).where(eq(completions.id, id));
    if (!before) {
      console.log(`SKIP ${label}: completion ${id} not found`);
      continue;
    }
    await db.update(completions).set({ valueCents: cents }).where(eq(completions.id, id));
    console.log(`${label} (was ${before.valueCents})`);
  }
}

main().then(() => process.exit(0));
