"use server";

import { auth } from "@clerk/nextjs/server";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { chores, completions, kids, payouts } from "@/db/schema";
import { dollarsToCents } from "@/lib/money";
import { occurrenceDateFor } from "@/lib/chore-schedule";
import { getOrCreateParentEarner } from "@/lib/parent-earner";
import {
  getChoresForParent,
  getEarnersWithBalances,
  getKidsForParent,
  getOrCreateHousehold,
} from "@/lib/queries";

async function requireParentUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  await getOrCreateHousehold(userId);
  await getOrCreateParentEarner(userId);
  return userId;
}

export async function createKid(formData: FormData) {
  const parentUserId = await requireParentUserId();
  const name = String(formData.get("name") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();
  const color = String(formData.get("color") ?? "#6366f1");

  if (!name) throw new Error("Name is required");
  if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4-6 digits");

  const pinHash = await bcrypt.hash(pin, 10);
  const db = getDb();
  await db.insert(kids).values({ parentUserId, name, pinHash, color });
  revalidatePath("/dashboard/kids");
}

export async function deleteKid(kidId: string) {
  const parentUserId = await requireParentUserId();
  const db = getDb();
  await db
    .delete(kids)
    .where(and(eq(kids.id, kidId), eq(kids.parentUserId, parentUserId), eq(kids.isParent, false)));
  revalidatePath("/dashboard/kids");
}

export async function createChore(formData: FormData) {
  const parentUserId = await requireParentUserId();
  const title = String(formData.get("title") ?? "").trim();
  const valueCents = dollarsToCents(String(formData.get("value") ?? "0"));
  const isBounty = formData.get("isBounty") === "1";
  // Bounties don't repeat — force "once" regardless of what the form submitted.
  const recurrence = isBounty
    ? "once"
    : (String(formData.get("recurrence") ?? "once") as "once" | "daily" | "weekly");
  const assignedKidIdRaw = String(formData.get("assignedKidId") ?? "any");
  const assignedKidId = assignedKidIdRaw === "any" ? null : assignedKidIdRaw;
  const daysOfWeek = formData.getAll("daysOfWeek").map(String).join(",") || null;

  if (!title) throw new Error("Title is required");
  if (valueCents <= 0) throw new Error("Value must be greater than 0");

  const db = getDb();
  await db.insert(chores).values({
    parentUserId,
    title,
    valueCents,
    recurrence,
    daysOfWeek: recurrence === "weekly" ? daysOfWeek : null,
    assignedKidId,
    isBounty,
  });
  revalidatePath("/dashboard/chores");
}

export async function setChoreActive(choreId: string, active: boolean) {
  const parentUserId = await requireParentUserId();
  const db = getDb();
  await db
    .update(chores)
    .set({ active })
    .where(and(eq(chores.id, choreId), eq(chores.parentUserId, parentUserId)));
  revalidatePath("/dashboard/chores");
}

export async function deleteChore(choreId: string) {
  const parentUserId = await requireParentUserId();
  const db = getDb();
  await db.delete(chores).where(and(eq(chores.id, choreId), eq(chores.parentUserId, parentUserId)));
  revalidatePath("/dashboard/chores");
}

export async function approveCompletion(completionId: string) {
  const parentUserId = await requireParentUserId();
  const db = getDb();
  const [row] = await db
    .select({ id: completions.id, choreParent: chores.parentUserId })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .where(eq(completions.id, completionId))
    .limit(1);
  if (!row || row.choreParent !== parentUserId) throw new Error("Not found");

  await db
    .update(completions)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(eq(completions.id, completionId));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
}

export async function rejectCompletion(completionId: string) {
  const parentUserId = await requireParentUserId();
  const db = getDb();
  const [row] = await db
    .select({ id: completions.id, choreParent: chores.parentUserId })
    .from(completions)
    .innerJoin(chores, eq(completions.choreId, chores.id))
    .where(eq(completions.id, completionId))
    .limit(1);
  if (!row || row.choreParent !== parentUserId) throw new Error("Not found");

  await db
    .update(completions)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(completions.id, completionId));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
}

export async function markPaid(formData: FormData) {
  const parentUserId = await requireParentUserId();
  const kidId = String(formData.get("kidId") ?? "");
  const amountCents = dollarsToCents(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (amountCents <= 0) throw new Error("Amount must be greater than 0");

  const db = getDb();
  const [kid] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.id, kidId), eq(kids.parentUserId, parentUserId)))
    .limit(1);
  if (!kid) throw new Error("Not found");

  await db.insert(payouts).values({ kidId, amountCents, note });
  revalidatePath("/dashboard/payouts");
  revalidatePath("/dashboard");
}

// Lets a parent directly record any active, non-bounty chore as done by any
// earner (a kid, or themselves) — auto-approved since the parent is asserting
// it firsthand. Deliberately does NOT check chore.assignedKidId: letting the
// parent log a chore as done by someone other than its assignee (e.g.
// themselves, covering for a kid) is the entire point of this feature.
export async function logCompletionFor(formData: FormData) {
  const parentUserId = await requireParentUserId();
  const choreId = String(formData.get("choreId") ?? "");
  const earnerId = String(formData.get("earnerId") ?? "");

  const db = getDb();
  const [chore] = await db
    .select()
    .from(chores)
    .where(
      and(
        eq(chores.id, choreId),
        eq(chores.parentUserId, parentUserId),
        eq(chores.active, true),
        eq(chores.isBounty, false),
      ),
    )
    .limit(1);
  if (!chore) throw new Error("Not found");

  const [earner] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.id, earnerId), eq(kids.parentUserId, parentUserId)))
    .limit(1);
  if (!earner) throw new Error("Not found");

  await db
    .insert(completions)
    .values({
      choreId: chore.id,
      kidId: earner.id,
      occurrenceDate: occurrenceDateFor(chore),
      status: "approved",
      reviewedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [completions.choreId, completions.occurrenceDate],
      setWhere: sql`${completions.status} = 'rejected'`,
      set: {
        kidId: earner.id,
        status: "approved",
        completedAt: new Date(),
        reviewedAt: new Date(),
      },
    });

  revalidatePath("/dashboard/chores");
  revalidatePath("/dashboard");
}

export async function exportChores() {
  const parentUserId = await requireParentUserId();
  const [choreRows, kidRows] = await Promise.all([
    getChoresForParent(parentUserId),
    getKidsForParent(parentUserId),
  ]);
  const kidNameById = new Map(kidRows.map((k) => [k.id, k.name]));

  return {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    chores: choreRows.map((chore) => ({
      title: chore.title,
      valueCents: chore.valueCents,
      recurrence: chore.recurrence,
      daysOfWeek: chore.daysOfWeek,
      assignedKidName: chore.assignedKidId ? kidNameById.get(chore.assignedKidId) ?? null : null,
      active: chore.active,
    })),
  };
}

export async function exportBalances() {
  const parentUserId = await requireParentUserId();
  const earners = await getEarnersWithBalances(parentUserId);
  return {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    balances: earners
      .filter((e) => !e.isParent)
      .map((e) => ({ name: e.name, balanceCents: e.balanceCents })),
  };
}

type ImportChoreEntry = {
  title: string;
  valueCents: number;
  recurrence: "once" | "daily" | "weekly";
  daysOfWeek: string | null;
  assignedKidName: string | null;
  active: boolean;
};

function validateImportPayload(raw: unknown): { chores: ImportChoreEntry[] } | { error: string } {
  if (typeof raw !== "object" || raw === null) return { error: "That file isn't a valid export." };
  const data = raw as Record<string, unknown>;
  if (data.version !== undefined && data.version !== 1) {
    return { error: "This file was made by a newer version of the app." };
  }
  if (!Array.isArray(data.chores)) return { error: "That file isn't a valid chore export." };
  if (data.chores.length > 200) return { error: "That file has too many chores (max 200)." };

  const chores: ImportChoreEntry[] = [];
  for (let i = 0; i < data.chores.length; i++) {
    const entry = data.chores[i] as Record<string, unknown>;
    if (typeof entry !== "object" || entry === null) {
      return { error: `Entry ${i + 1} isn't a valid chore.` };
    }
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title || title.length > 200) {
      return { error: `Entry ${i + 1} has a missing or too-long title.` };
    }
    const valueCents = entry.valueCents;
    if (typeof valueCents !== "number" || !Number.isInteger(valueCents) || valueCents <= 0) {
      return { error: `Entry ${i + 1} ("${title}") has an invalid value.` };
    }
    const recurrence = entry.recurrence;
    if (recurrence !== "once" && recurrence !== "daily" && recurrence !== "weekly") {
      return { error: `Entry ${i + 1} ("${title}") has an invalid recurrence.` };
    }
    const daysOfWeek = entry.daysOfWeek;
    if (daysOfWeek !== null && daysOfWeek !== undefined) {
      if (
        typeof daysOfWeek !== "string" ||
        !daysOfWeek.split(",").filter(Boolean).every((d) => /^[0-6]$/.test(d))
      ) {
        return { error: `Entry ${i + 1} ("${title}") has an invalid schedule.` };
      }
    }
    const assignedKidName = entry.assignedKidName;
    if (assignedKidName !== null && assignedKidName !== undefined && typeof assignedKidName !== "string") {
      return { error: `Entry ${i + 1} ("${title}") has an invalid assignee.` };
    }
    chores.push({
      title,
      valueCents,
      recurrence,
      daysOfWeek: (daysOfWeek as string | null) ?? null,
      assignedKidName: (assignedKidName as string | null) ?? null,
      active: entry.active !== false,
    });
  }

  return { chores };
}

export async function importChores(json: string) {
  const parentUserId = await requireParentUserId();

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false as const, error: "That file isn't valid JSON." };
  }

  const validated = validateImportPayload(parsed);
  if ("error" in validated) return { ok: false as const, error: validated.error };

  const kidRows = await getKidsForParent(parentUserId);
  const kidIdByLowerName = new Map(kidRows.map((k) => [k.name.trim().toLowerCase(), k.id]));

  const unmatchedNames: string[] = [];
  const rows = validated.chores.map((entry) => {
    let assignedKidId: string | null = null;
    if (entry.assignedKidName) {
      const match = kidIdByLowerName.get(entry.assignedKidName.trim().toLowerCase());
      if (match) {
        assignedKidId = match;
      } else {
        unmatchedNames.push(entry.assignedKidName);
      }
    }
    return {
      parentUserId,
      title: entry.title,
      valueCents: entry.valueCents,
      recurrence: entry.recurrence,
      daysOfWeek: entry.recurrence === "weekly" ? entry.daysOfWeek : null,
      assignedKidId,
      active: entry.active,
      isBounty: false,
    };
  });

  const db = getDb();
  // Bounties are deliberately excluded from this delete — import only replaces
  // recurring/one-time chore *configuration*, never bounty history.
  await db.delete(chores).where(and(eq(chores.parentUserId, parentUserId), eq(chores.isBounty, false)));
  if (rows.length > 0) {
    await db.insert(chores).values(rows);
  }

  revalidatePath("/dashboard/chores");
  return { ok: true as const, imported: rows.length, unmatchedNames };
}
