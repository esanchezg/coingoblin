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

export async function getKidsForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select()
    .from(kids)
    .where(eq(kids.parentUserId, parentUserId))
    .orderBy(kids.createdAt);
}

export async function getKidById(kidId: string) {
  const db = getDb();
  const [kid] = await db.select().from(kids).where(eq(kids.id, kidId)).limit(1);
  return kid ?? null;
}

export async function getChoresForParent(parentUserId: string) {
  const db = getDb();
  return db
    .select()
    .from(chores)
    .where(eq(chores.parentUserId, parentUserId))
    .orderBy(desc(chores.createdAt));
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

export async function getKidsWithBalances(parentUserId: string) {
  const kidRows = await getKidsForParent(parentUserId);
  const balances = await balancesForKids(kidRows.map((k) => k.id));
  return kidRows
    .map((kid) => ({ ...kid, balanceCents: balances.get(kid.id) ?? 0 }))
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

export async function getKidBalance(kidId: string) {
  const balances = await balancesForKids([kidId]);
  return balances.get(kidId) ?? 0;
}

export async function getPendingCompletions(parentUserId: string) {
  const db = getDb();
  return db
    .select({
      id: completions.id,
      completedAt: completions.completedAt,
      choreTitle: chores.title,
      valueCents: chores.valueCents,
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

export async function getAvailableChoresForKid(kidId: string, parentUserId: string) {
  const db = getDb();
  const allChores = await db
    .select()
    .from(chores)
    .where(
      and(
        eq(chores.parentUserId, parentUserId),
        eq(chores.active, true),
        or(isNull(chores.assignedKidId), eq(chores.assignedKidId, kidId)),
      ),
    );

  const todays = allChores.filter((chore) => isScheduledToday(chore));
  if (todays.length === 0) return [];

  const takenRows = await db
    .select({ choreId: completions.choreId, occurrenceDate: completions.occurrenceDate, status: completions.status })
    .from(completions)
    .where(
      inArray(
        completions.choreId,
        todays.map((c) => c.id),
      ),
    );

  const taken = new Set(
    takenRows
      .filter((r) => r.status !== "rejected")
      .map((r) => `${r.choreId}:${r.occurrenceDate}`),
  );

  return todays.filter((chore) => !taken.has(`${chore.id}:${occurrenceDateFor(chore)}`));
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
    })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .where(eq(completions.kidId, kidId))
    .orderBy(desc(completions.completedAt))
    .limit(20);
}
