"use server";

import { auth } from "@clerk/nextjs/server";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { chores, completions, kids, payouts } from "@/db/schema";
import { dollarsToCents } from "@/lib/money";
import { getOrCreateHousehold } from "@/lib/queries";

async function requireParentUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  await getOrCreateHousehold(userId);
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
  await db.delete(kids).where(and(eq(kids.id, kidId), eq(kids.parentUserId, parentUserId)));
  revalidatePath("/dashboard/kids");
}

export async function createChore(formData: FormData) {
  const parentUserId = await requireParentUserId();
  const title = String(formData.get("title") ?? "").trim();
  const valueCents = dollarsToCents(String(formData.get("value") ?? "0"));
  const recurrence = String(formData.get("recurrence") ?? "once") as "once" | "daily" | "weekly";
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
