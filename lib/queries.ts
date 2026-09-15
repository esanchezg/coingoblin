import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { chores, completions, households, kids, payouts } from "@/db/schema";
import { isScheduledToday, occurrenceDateFor } from "@/lib/chore-schedule";

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

  const claims = await getClaimsForChores(bountyRows);
  return bountyRows.map((bounty) => ({ bounty, claim: claims.get(bounty.id) ?? null }));
}

async function balancesForKids(kidIds: string[]) {
  const db = getDb();
  const balances = new Map<string, number>();
  for (const id of kidIds) balances.set(id, 0);
  if (kidIds.length === 0) return balances;

  const approved = await db
    .select({
      kidId: completions.kidId,
      valueCents: chores.valueCents,
    })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
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
      valueCents: chores.valueCents,
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

// For each chore's CURRENT occurrence, who (if anyone) has a non-rejected completion.
export async function getClaimsForChores(
  choreRows: { id: string; recurrence: "once" | "daily" | "weekly" }[],
): Promise<Map<string, ChoreClaim>> {
  const map = new Map<string, ChoreClaim>();
  if (choreRows.length === 0) return map;

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
      inArray(
        completions.choreId,
        choreRows.map((c) => c.id),
      ),
    );

  const byOccurrence = new Map(
    rows
      .filter((r) => r.status !== "rejected")
      .map((r) => [`${r.choreId}:${r.occurrenceDate}`, r] as const),
  );

  for (const chore of choreRows) {
    const hit = byOccurrence.get(`${chore.id}:${occurrenceDateFor(chore)}`);
    if (hit) {
      map.set(chore.id, {
        completionId: hit.completionId,
        earnerId: hit.earnerId,
        earnerName: hit.earnerName,
        earnerColor: hit.earnerColor,
        earnerIsParent: hit.earnerIsParent,
        status: hit.status as "pending" | "approved",
      });
    }
  }

  return map;
}

async function availableForKid(kidId: string, parentUserId: string, isBounty: boolean) {
  const db = getDb();
  const candidates = await db
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

  const scheduled = candidates.filter((chore) => isScheduledToday(chore));
  if (scheduled.length === 0) return [];

  const claims = await getClaimsForChores(scheduled);
  return scheduled.filter((chore) => !claims.has(chore.id));
}

export async function getAvailableChoresForKid(kidId: string, parentUserId: string) {
  return availableForKid(kidId, parentUserId, false);
}

export async function getAvailableBountiesForKid(kidId: string, parentUserId: string) {
  return availableForKid(kidId, parentUserId, true);
}

export async function getKidCompletions(kidId: string) {
  const db = getDb();
  return db
    .select({
      id: completions.id,
      status: completions.status,
      completedAt: completions.completedAt,
      choreTitle: chores.title,
      valueCents: chores.valueCents,
      isBounty: chores.isBounty,
    })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .where(eq(completions.kidId, kidId))
    .orderBy(desc(completions.completedAt))
    .limit(20);
}
