import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;
  const jordan = kidRows.find((k) => k.name === "Jordan")!;

  // Start as a daily chore, then edit title/value/assignee/recurrence/days all at once.
  const [chore] = await db
    .insert(chores)
    .values({
      parentUserId,
      title: "Original title",
      valueCents: 100,
      recurrence: "daily",
      assignedKidId: ripley.id,
    })
    .returning();

  // Mirrors updateChore's logic (which requires Clerk auth, so exercised directly here).
  const recurrence = "weekly" as const;
  await db
    .update(chores)
    .set({
      title: "New title",
      valueCents: 500,
      assignedKidId: jordan.id,
      recurrence,
      daysOfWeek: recurrence === "weekly" ? "2,4,6" : null,
    })
    .where(and(eq(chores.id, chore.id), eq(chores.parentUserId, parentUserId)));

  const [updated] = await db.select().from(chores).where(eq(chores.id, chore.id));
  console.log("1) title updated:", updated.title === "New title" ? "PASS" : "FAIL", updated.title);
  console.log("2) value updated:", updated.valueCents === 500 ? "PASS" : "FAIL", updated.valueCents);
  console.log("3) assignee updated:", updated.assignedKidId === jordan.id ? "PASS" : "FAIL");
  console.log("4) recurrence changed daily -> weekly:", updated.recurrence === "weekly" ? "PASS" : "FAIL");
  console.log("5) days set for new weekly recurrence:", updated.daysOfWeek === "2,4,6" ? "PASS" : "FAIL", updated.daysOfWeek);

  // Now switch back to daily — daysOfWeek must be cleared (not left stale).
  await db
    .update(chores)
    .set({ recurrence: "daily", daysOfWeek: null })
    .where(and(eq(chores.id, chore.id), eq(chores.parentUserId, parentUserId)));
  const [reverted] = await db.select().from(chores).where(eq(chores.id, chore.id));
  console.log(
    "6) switching back to daily clears daysOfWeek:",
    reverted.recurrence === "daily" && reverted.daysOfWeek === null ? "PASS" : "FAIL",
    reverted.daysOfWeek,
  );

  await db.delete(chores).where(eq(chores.id, chore.id));
}

main().then(() => process.exit(0));
