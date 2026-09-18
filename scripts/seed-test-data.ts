import bcrypt from "bcryptjs";
import { getDb } from "../db";
import { chores, households, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";
  const familyCode = "TEST01";

  await db.insert(households).values({ parentUserId, familyCode }).onConflictDoNothing();

  const pinHash = await bcrypt.hash("1234", 10);
  const [ripley] = await db
    .insert(kids)
    .values({ parentUserId, name: "Ripley", pinHash, color: "#22c55e" })
    .returning();
  const [jordan] = await db
    .insert(kids)
    .values({ parentUserId, name: "Jordan", pinHash, color: "#ec4899" })
    .returning();
  const [parent] = await db
    .insert(kids)
    .values({ parentUserId, name: "TestParent", pinHash: "no-login", color: "#475569", isParent: true })
    .returning();

  await db.insert(chores).values([
    {
      parentUserId,
      title: "Feed the dog",
      valueCents: 150,
      recurrence: "daily",
      assignedKidId: null,
    },
    {
      parentUserId,
      title: "Take out trash",
      valueCents: 200,
      recurrence: "weekly",
      daysOfWeek: String(new Date().getDay()),
      assignedKidId: jordan.id,
    },
    {
      // Pinned to Monday so there's a real earlier-in-week catch-up slot to test,
      // unless today itself is Monday (then the week has genuinely just started).
      parentUserId,
      title: "Water the plants",
      valueCents: 100,
      recurrence: "weekly",
      daysOfWeek: "1",
      assignedKidId: null,
    },
    {
      parentUserId,
      title: "Clean your room",
      valueCents: 300,
      recurrence: "once",
      assignedKidId: ripley.id,
    },
    {
      parentUserId,
      title: "Clean the garage",
      valueCents: 1500,
      recurrence: "once",
      isBounty: true,
      assignedKidId: null,
    },
  ]);

  console.log("Seeded:", {
    parentUserId,
    familyCode,
    ripleyId: ripley.id,
    jordanId: jordan.id,
    parentEarnerId: parent.id,
  });
}

main().then(() => process.exit(0));
