import bcrypt from "bcryptjs";
import { getDb } from "../db";
import { chores, households, kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";
  const familyCode = "TEST01";

  await db.insert(households).values({ parentUserId, familyCode }).onConflictDoNothing();

  const pinHash = await bcrypt.hash("1234", 10);
  const [kid] = await db
    .insert(kids)
    .values({ parentUserId, name: "Ripley", pinHash, color: "#22c55e" })
    .returning();

  await db.insert(chores).values({
    parentUserId,
    title: "Feed the dog",
    valueCents: 150,
    recurrence: "daily",
    assignedKidId: null,
  });

  console.log("Seeded:", { parentUserId, familyCode, kidId: kid.id });
}

main().then(() => process.exit(0));
