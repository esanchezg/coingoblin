import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";
import { claimableOccurrenceDates } from "../lib/chore-schedule";
import {
  getAvailableBountiesForKid,
  getAvailableChoresForKid,
  getChoreOccurrencesForParent,
  getTakenChoresForKid,
} from "../lib/queries";
async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;
  const jordan = kidRows.find((k) => k.name === "Jordan")!;

  const [feedTheDog] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.parentUserId, parentUserId), eq(chores.title, "Feed the dog")));

  const expectedDates = claimableOccurrenceDates(feedTheDog, "UTC");

  // 1) Core assertion: a daily chore missed earlier this week shows up as
  //    separate claimable slots for every scheduled date so far, not just today.
  const ripleyAvailable = await getAvailableChoresForKid(ripley.id, parentUserId);
  const feedSlots = ripleyAvailable.filter((s) => s.chore.id === feedTheDog.id).map((s) => s.occurrenceDate);
  console.log(
    "1) available slots for 'Feed the dog' match claimableOccurrenceDates:",
    feedSlots.length === expectedDates.length && expectedDates.every((d) => feedSlots.includes(d))
      ? "PASS"
      : "FAIL",
    { expected: expectedDates, got: feedSlots },
  );

  // 2) Claim only the oldest (Monday's) slot; confirm the others stay open.
  const mondayDate = expectedDates[0];
  await db.insert(completions).values({
    choreId: feedTheDog.id,
    kidId: ripley.id,
    occurrenceDate: mondayDate,
    status: "approved",
    reviewedAt: new Date(),
  });

  const afterClaim = await getAvailableChoresForKid(ripley.id, parentUserId);
  const feedSlotsAfter = afterClaim.filter((s) => s.chore.id === feedTheDog.id).map((s) => s.occurrenceDate);
  const expectedRemaining = expectedDates.slice(1);
  console.log(
    "2) claiming the oldest slot leaves the rest open:",
    feedSlotsAfter.length === expectedRemaining.length &&
      expectedRemaining.every((d) => feedSlotsAfter.includes(d)) &&
      !feedSlotsAfter.includes(mondayDate)
      ? "PASS"
      : "FAIL",
    { expectedRemaining, got: feedSlotsAfter },
  );

  // 3) The sibling sees the claimed day as taken, with the right day label.
  const jordanTaken = await getTakenChoresForKid(jordan.id, parentUserId);
  const hit = jordanTaken.find((t) => t.chore.id === feedTheDog.id && t.occurrenceDate === mondayDate);
  console.log(
    "3) sibling sees the claimed day as taken by Ripley:",
    hit?.claim.earnerName === "Ripley" ? "PASS" : "FAIL",
  );

  // 4) A completion from the PREVIOUS week must be invisible everywhere.
  const priorWeekDate = "2020-01-06"; // an arbitrary Monday, long expired
  await db.insert(completions).values({
    choreId: feedTheDog.id,
    kidId: ripley.id,
    occurrenceDate: priorWeekDate,
    status: "approved",
    reviewedAt: new Date(),
  });
  const afterPriorWeek = await getAvailableChoresForKid(ripley.id, parentUserId);
  const priorWeekLeaked = afterPriorWeek.some(
    (s) => s.chore.id === feedTheDog.id && s.occurrenceDate === priorWeekDate,
  );
  const priorWeekTaken = (await getTakenChoresForKid(jordan.id, parentUserId)).some(
    (t) => t.occurrenceDate === priorWeekDate,
  );
  console.log(
    "4) a prior-week completion is invisible to available/taken:",
    !priorWeekLeaked && !priorWeekTaken ? "PASS" : "FAIL",
  );

  // 5) Bounties are unaffected — still a bare Chore[].
  const bounties = await getAvailableBountiesForKid(ripley.id, parentUserId);
  console.log(
    "5) getAvailableBountiesForKid still returns bare chores:",
    bounties.some((c) => c.title === "Clean the garage" && typeof c.title === "string") ? "PASS" : "FAIL",
  );

  // 6) Parent view: Monday claimed, others open, and a paused chore contributes nothing.
  const parentOccurrences = await getChoreOccurrencesForParent(parentUserId);
  const parentFeedSlots = parentOccurrences.filter((s) => s.chore.id === feedTheDog.id);
  const mondaySlot = parentFeedSlots.find((s) => s.occurrenceDate === mondayDate);
  const othersOpen = parentFeedSlots.filter((s) => s.occurrenceDate !== mondayDate).every((s) => s.claim === null);
  console.log(
    "6) parent view shows Monday claimed and the rest open:",
    mondaySlot?.claim?.earnerName === "Ripley" && othersOpen ? "PASS" : "FAIL",
  );

  await setChoreActiveDirect(feedTheDog.id, parentUserId, false);
  const pausedOccurrences = await getChoreOccurrencesForParent(parentUserId);
  const pausedContributesNothing = !pausedOccurrences.some((s) => s.chore.id === feedTheDog.id);
  console.log("   paused chore contributes zero slots:", pausedContributesNothing ? "PASS" : "FAIL");
  await setChoreActiveDirect(feedTheDog.id, parentUserId, true);

  // Cleanup
  await db.delete(completions).where(eq(completions.choreId, feedTheDog.id));
}

// setChoreActive is a "use server" action requiring Clerk auth; exercise the
// underlying update directly for this script instead.
async function setChoreActiveDirect(choreId: string, parentUserId: string, active: boolean) {
  const db = getDb();
  await db
    .update(chores)
    .set({ active })
    .where(and(eq(chores.id, choreId), eq(chores.parentUserId, parentUserId)));
}

main().then(() => process.exit(0));
