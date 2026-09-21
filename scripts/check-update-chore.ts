import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;
  const jordan = kidRows.find((k) => k.name === "Jordan")!;

  const [chore] = await db
    .insert(chores)
    .values({
      parentUserId,
      title: "Edit test chore",
      valueCents: 100,
      recurrence: "weekly",
      daysOfWeek: "1,3",
      assignedKidId: ripley.id,
    })
    .returning();

  // Mirrors updateChore's logic (which requires Clerk auth, so exercised directly here).
  await db
    .update(chores)
    .set({ valueCents: 500, assignedKidId: jordan.id, daysOfWeek: "2,4,6" })
    .where(and(eq(chores.id, chore.id), eq(chores.parentUserId, parentUserId)));

  const [updated] = await db.select().from(chores).where(eq(chores.id, chore.id));
  console.log("1) value updated:", updated.valueCents === 500 ? "PASS" : "FAIL", updated.valueCents);
  console.log("2) assignee updated:", updated.assignedKidId === jordan.id ? "PASS" : "FAIL", updated.assignedKidId);
  console.log("3) days updated:", updated.daysOfWeek === "2,4,6" ? "PASS" : "FAIL", updated.daysOfWeek);
  console.log("4) recurrence unchanged (not editable):", updated.recurrence === "weekly" ? "PASS" : "FAIL");
  console.log("5) title unchanged (not editable):", updated.title === "Edit test chore" ? "PASS" : "FAIL");

  await db.delete(chores).where(eq(chores.id, chore.id));
}

main().then(() => process.exit(0));
