// One-time operational fix, applied 2026-09-16. Safe (idempotent) to re-run.
//
// Before per-household timezones existed, occurrenceDateFor() stamped completions
// with the server's UTC date. Sam submitted three daily chores at 19:32 on Tue
// 2026-09-15 America/Denver (= 01:32 UTC Wed 2026-09-16), so they landed in
// Wednesday's bucket and blocked all of Wednesday locally. This re-dates those
// three rows to their true local occurrence date and records the household's zone.
//
// Run: npx dotenv -e .env.local -- npx tsx scripts/fix-household-timezone-backfill.ts
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, households, kids } from "../db/schema";

const PARENT_USER_ID = "user_3JInkNASQFUezik0kIA9FqEFdFJ";
const TIMEZONE = "America/Denver";
const WRONG_DATE = "2026-09-16";
const RIGHT_DATE = "2026-09-15";

// Captured from production 2026-09-16. Title + kid + timestamp are re-asserted
// below before anything is written, so a wrong id aborts instead of corrupting.
const STUCK = [
  { id: "dd1e22c0-830e-419f-a704-682252e5ea93", title: "Get mail or packages", kid: "Sam" },
  { id: "97397515-91db-48e7-8dfd-3fc199d5469c", title: "Feed the dogs", kid: "Sam" },
  { id: "bee3744a-3b1b-4448-9eef-16cd3045cbf7", title: "Set the table (water, plates & utensils)", kid: "Sam" },
];

// The true local submission window: 2026-09-16 01:32:00Z .. 01:33:00Z.
const WINDOW_START = Date.UTC(2026, 8, 16, 1, 32, 0);
const WINDOW_END = Date.UTC(2026, 8, 16, 1, 33, 0);

async function main() {
  const db = getDb();

  // 1) Household timezone.
  const [before] = await db
    .select()
    .from(households)
    .where(eq(households.parentUserId, PARENT_USER_ID));
  if (!before) throw new Error(`No household for ${PARENT_USER_ID}`);
  console.log(`household ${before.familyCode}: timezone was ${before.timezone ?? "NULL"}`);
  if (before.timezone !== TIMEZONE) {
    await db.update(households).set({ timezone: TIMEZONE }).where(eq(households.parentUserId, PARENT_USER_ID));
    console.log(`  -> set to ${TIMEZONE}`);
  } else {
    console.log("  -> already correct, no write");
  }

  // 2) Re-date the three stuck completions, one guarded statement each
  //    (neon-http has no transactions, so every write must stand alone).
  for (const target of STUCK) {
    const [row] = await db
      .select({
        id: completions.id,
        occurrenceDate: completions.occurrenceDate,
        status: completions.status,
        completedAt: completions.completedAt,
        title: chores.title,
        kid: kids.name,
        choreId: completions.choreId,
      })
      .from(completions)
      .innerJoin(chores, eq(completions.choreId, chores.id))
      .innerJoin(kids, eq(completions.kidId, kids.id))
      .where(eq(completions.id, target.id));

    if (!row) {
      console.log(`SKIP ${target.title}: completion ${target.id} not found`);
      continue;
    }
    if (row.occurrenceDate === RIGHT_DATE) {
      console.log(`SKIP ${target.title}: already ${RIGHT_DATE}`);
      continue;
    }

    // Every identifying fact must match, or we abort rather than guess.
    const ms = row.completedAt.getTime();
    if (
      row.title !== target.title ||
      row.kid !== target.kid ||
      row.occurrenceDate !== WRONG_DATE ||
      ms < WINDOW_START ||
      ms > WINDOW_END
    ) {
      throw new Error(
        `ABORT: ${target.id} does not match expectations ` +
          `(got kid=${row.kid} title=${row.title} date=${row.occurrenceDate} at=${row.completedAt.toISOString()})`,
      );
    }

    // The (chore_id, occurrence_date) unique index would reject a collision — check first.
    const [clash] = await db
      .select({ id: completions.id })
      .from(completions)
      .where(and(eq(completions.choreId, row.choreId), eq(completions.occurrenceDate, RIGHT_DATE)));
    if (clash) throw new Error(`ABORT: ${row.title} already has a ${RIGHT_DATE} completion (${clash.id})`);

    await db
      .update(completions)
      .set({ occurrenceDate: RIGHT_DATE })
      // Re-asserting the old date makes a concurrent re-run a no-op.
      .where(and(eq(completions.id, target.id), eq(completions.occurrenceDate, WRONG_DATE)));
    console.log(`FIXED ${row.kid} / ${row.title}: ${WRONG_DATE} -> ${RIGHT_DATE}`);
  }
}

main().then(() => process.exit(0));
