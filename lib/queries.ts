import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { chores, completions, households, kids, payouts } from "@/db/schema";
import { DEFAULT_TIMEZONE, claimableOccurrenceDates } from "@/lib/chore-schedule";

function randomFamilyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function getOrCreateHousehold(parentUserId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(households)
    .where(eq(households.parentUserId, parentUserId))
    .limit(1);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [created] = await db
        .insert(households)
        .values({ parentUserId, familyCode: randomFamilyCode() })
        .returning();
      return created;
    } catch {
      // family code collision, retry with a new code
    }
  }
  throw new Error("Could not create household");
}

// Resolves the household's IANA zone for date/weekday math. Never throws and
// never blocks: an undetected household reads as UTC, matching pre-timezone
// behavior until the parent's browser reports its real zone.
export async function getHouseholdTimezone(parentUserId: string): Promise<string> {
  const household = await getOrCreateHousehold(parentUserId);
  return household.timezone ?? DEFAULT_TIMEZONE;
}

export async function getHouseholdByFamilyCode(familyCode: string) {
  const db = getDb();
  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.familyCode, familyCode.toUpperCase().trim()))
    .limit(1);
  return household ?? null;
}

// Real kid profiles only — excludes the parent pseudo-earner row.
export async function getKidsForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select()
    .from(kids)
    .where(and(eq(kids.parentUserId, parentUserId), eq(kids.isParent, false)))
    .orderBy(kids.createdAt);
}

// Every earner in the household, including the parent pseudo-row. Deliberately
// excludes pinHash — this data reaches the kid-facing leaderboard.
export async function getEarnersForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select({ id: kids.id, name: kids.name, color: kids.color, isParent: kids.isParent })
    .from(kids)
    .where(eq(kids.parentUserId, parentUserId))
    .orderBy(kids.createdAt);
}

// Non-bounty chores only — this backs the recurring-chores list on the dashboard.
export async function getChoresForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select()
    .from(chores)
    .where(and(eq(chores.parentUserId, parentUserId), eq(chores.isBounty, false)))
    .orderBy(desc(chores.createdAt));
}

export async function getBountiesForParent(parentUserId: string) {
  const db = getDb();
  const bountyRows = await db
    .select()
    .from(chores)
    .where(and(eq(chores.parentUserId, parentUserId), eq(chores.isBounty, true)))
    .orderBy(desc(chores.createdAt));

  const timezone = await getHouseholdTimezone(parentUserId);
  const slots = expandOccurrences(bountyRows, timezone);
  const claims = await getClaimsForOccurrences(
    slots.map(({ chore, occurrenceDate }) => ({ choreId: chore.id, occurrenceDate })),
  );
  return bountyRows.map((bounty) => {
    const claim =
      claimableOccurrenceDates(bounty, timezone)
        .map((d) => claims.get(occurrenceKey(bounty.id, d)))
        .find(Boolean) ?? null;
    return { bounty, claim };
  });
}

async function balancesForKids(kidIds: string[]) {
  const db = getDb();
  const balances = new Map<string, number>();
  for (const id of kidIds) balances.set(id, 0);
  if (kidIds.length === 0) return balances;

  // Value is read directly off the completion (locked in at the moment it was
  // done), not the chore — so a chore being edited or even deleted afterward can
  // never change what's already been earned.
  const approved = await db
    .select({
      kidId: completions.kidId,
      valueCents: completions.valueCents,
    })
    .from(completions)
    .where(and(inArray(completions.kidId, kidIds), eq(completions.status, "approved")));

  for (const row of approved) {
    balances.set(row.kidId, (balances.get(row.kidId) ?? 0) + row.valueCents);
  }

  const paid = await db
    .select({ kidId: payouts.kidId, amountCents: payouts.amountCents })
    .from(payouts)
    .where(inArray(payouts.kidId, kidIds));

  for (const row of paid) {
    balances.set(row.kidId, (balances.get(row.kidId) ?? 0) - row.amountCents);
  }

  return balances;
}

export async function getEarnersWithBalances(parentUserId: string) {
  const earnerRows = await getEarnersForParent(parentUserId);
  const balances = await balancesForKids(earnerRows.map((k) => k.id));
  return earnerRows
    .map((earner) => ({ ...earner, balanceCents: balances.get(earner.id) ?? 0 }))
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

export async function getPendingCompletions(parentUserId: string) {
  const db = getDb();
  return db
    .select({
      id: completions.id,
      completedAt: completions.completedAt,
      choreTitle: chores.title,
      valueCents: completions.valueCents,
      isBounty: chores.isBounty,
      kidName: kids.name,
      kidColor: kids.color,
    })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .innerJoin(kids, eq(completions.kidId, kids.id))
    .where(and(eq(chores.parentUserId, parentUserId), eq(completions.status, "pending")))
    .orderBy(completions.completedAt);
}

export async function getPayoutHistory(parentUserId: string) {
  const db = getDb();
  const parentKids = await getKidsForParent(parentUserId);
  const kidIds = parentKids.map((k) => k.id);
  if (kidIds.length === 0) return [];
  return db
    .select({
      id: payouts.id,
      amountCents: payouts.amountCents,
      note: payouts.note,
      createdAt: payouts.createdAt,
      kidName: kids.name,
    })
    .from(payouts)
    .innerJoin(kids, eq(payouts.kidId, kids.id))
    .where(inArray(payouts.kidId, kidIds))
    .orderBy(desc(payouts.createdAt));
}

export type ChoreClaim = {
  completionId: string;
  earnerId: string;
  earnerName: string;
  earnerColor: string;
  earnerIsParent: boolean;
  status: "pending" | "approved";
};

export function occurrenceKey(choreId: string, occurrenceDate: string): string {
  return `${choreId}:${occurrenceDate}`;
}

// Who (if anyone) holds a non-rejected completion for each requested (chore, date)
// slot. Keyed by occurrenceKey(). Dates are computed by the caller (via
// claimableOccurrenceDates) and never trusted from a client.
export async function getClaimsForOccurrences(
  slots: { choreId: string; occurrenceDate: string }[],
): Promise<Map<string, ChoreClaim>> {
  const map = new Map<string, ChoreClaim>();
  if (slots.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      choreId: completions.choreId,
      occurrenceDate: completions.occurrenceDate,
      status: completions.status,
      completionId: completions.id,
      earnerId: kids.id,
      earnerName: kids.name,
      earnerColor: kids.color,
      earnerIsParent: kids.isParent,
    })
    .from(completions)
    .innerJoin(kids, eq(completions.kidId, kids.id))
    .where(
      and(
        inArray(
          completions.choreId,
          [...new Set(slots.map((s) => s.choreId))],
        ),
        inArray(
          completions.occurrenceDate,
          [...new Set(slots.map((s) => s.occurrenceDate))],
        ),
      ),
    );

  const wanted = new Set(slots.map((s) => occurrenceKey(s.choreId, s.occurrenceDate)));
  for (const r of rows) {
    if (r.status === "rejected") continue;
    const key = occurrenceKey(r.choreId, r.occurrenceDate);
    if (!wanted.has(key)) continue; // cross-product row from the two inArrays
    map.set(key, {
      completionId: r.completionId,
      earnerId: r.earnerId,
      earnerName: r.earnerName,
      earnerColor: r.earnerColor,
      earnerIsParent: r.earnerIsParent,
      status: r.status as "pending" | "approved",
    });
  }
  return map;
}

// Expands chores into every slot they currently have open-or-claimable this week.
// Bounties and one-time chores expand to exactly one sentinel slot, so nothing
// downstream needs an isBounty branch.
function expandOccurrences<T extends { id: string; recurrence: "once" | "daily" | "weekly"; daysOfWeek: string | null }>(
  choreRows: T[],
  timezone: string,
  now: Date = new Date(),
): { chore: T; occurrenceDate: string }[] {
  return choreRows.flatMap((chore) =>
    claimableOccurrenceDates(chore, timezone, now).map((occurrenceDate) => ({ chore, occurrenceDate })),
  );
}

// Chores/bounties a kid could plausibly do: active, right isBounty flag, and
// either open to anyone or assigned specifically to them. Scheduling (which days
// are actually claimable) is decided later by claimableOccurrenceDates, not here —
// filtering it here would wrongly exclude a chore missed earlier in the week.
async function candidateChoresForKid(kidId: string, parentUserId: string, isBounty: boolean) {
  const db = getDb();
  return db
    .select()
    .from(chores)
    .where(
      and(
        eq(chores.parentUserId, parentUserId),
        eq(chores.active, true),
        eq(chores.isBounty, isBounty),
        or(isNull(chores.assignedKidId), eq(chores.assignedKidId, kidId)),
      ),
    );
}

async function openSlotsForKid(kidId: string, parentUserId: string, isBounty: boolean) {
  const timezone = await getHouseholdTimezone(parentUserId);
  const candidates = await candidateChoresForKid(kidId, parentUserId, isBounty);
  const slots = expandOccurrences(candidates, timezone);
  if (slots.length === 0) return [];

  const claims = await getClaimsForOccurrences(
    slots.map(({ chore, occurrenceDate }) => ({ choreId: chore.id, occurrenceDate })),
  );
  return slots.filter(({ chore, occurrenceDate }) => !claims.has(occurrenceKey(chore.id, occurrenceDate)));
}

// One entry per open slot — a chore missed Mon and Wed appears twice, each
// independently claimable and independently paid.
export async function getAvailableChoresForKid(kidId: string, parentUserId: string) {
  return openSlotsForKid(kidId, parentUserId, false);
}

// Bounties only ever have one slot (the sentinel), so the occurrence plumbing is
// flattened away here and callers keep the plain chore list they already had.
export async function getAvailableBountiesForKid(kidId: string, parentUserId: string) {
  const slots = await openSlotsForKid(kidId, parentUserId, true);
  return slots.map(({ chore }) => chore);
}

// Chores this kid could have done this week but someone else (a sibling, or the
// parent) already claimed — surfaced so kids can see when they got beaten to it.
export async function getTakenChoresForKid(kidId: string, parentUserId: string) {
  const timezone = await getHouseholdTimezone(parentUserId);
  const candidates = await candidateChoresForKid(kidId, parentUserId, false);
  const slots = expandOccurrences(candidates, timezone);
  if (slots.length === 0) return [];

  const claims = await getClaimsForOccurrences(
    slots.map(({ chore, occurrenceDate }) => ({ choreId: chore.id, occurrenceDate })),
  );
  const taken: { chore: (typeof candidates)[number]; occurrenceDate: string; claim: ChoreClaim }[] = [];
  for (const { chore, occurrenceDate } of slots) {
    const claim = claims.get(occurrenceKey(chore.id, occurrenceDate));
    if (claim && claim.earnerId !== kidId) taken.push({ chore, occurrenceDate, claim });
  }
  return taken.sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate));
}

// Every open-or-claimed slot this week for the household's active recurring/
// one-time chores, for the parent dashboard's per-day status list. Paused chores
// contribute nothing — there's nothing claimable while a chore is paused.
export async function getChoreOccurrencesForParent(parentUserId: string) {
  const timezone = await getHouseholdTimezone(parentUserId);
  const choreRows = (await getChoresForParent(parentUserId)).filter((c) => c.active);
  const slots = expandOccurrences(choreRows, timezone);
  if (slots.length === 0) return [];

  const claims = await getClaimsForOccurrences(
    slots.map(({ chore, occurrenceDate }) => ({ choreId: chore.id, occurrenceDate })),
  );
  return slots.map(({ chore, occurrenceDate }) => ({
    chore,
    occurrenceDate,
    claim: claims.get(occurrenceKey(chore.id, occurrenceDate)) ?? null,
  }));
}

export async function getKidCompletions(kidId: string) {
  const db = getDb();
  return db
    .select({
      id: completions.id,
      status: completions.status,
      completedAt: completions.completedAt,
      choreTitle: chores.title,
      valueCents: completions.valueCents,
      isBounty: chores.isBounty,
    })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .where(eq(completions.kidId, kidId))
    .orderBy(desc(completions.completedAt))
    .limit(20);
}
