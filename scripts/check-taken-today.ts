import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";
import { occurrenceDateFor } from "../lib/chore-schedule";
import { getAvailableChoresForKid, getTakenChoresForKid } from "../lib/queries";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;
  const jordan = kidRows.find((k) => k.name === "Jordan")!;
  const parent = kidRows.find((k) => k.isParent)!;

  const [feedTheDog] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.parentUserId, parentUserId), eq(chores.title, "Feed the dog")));

  // Parent logs "Feed the dog" as done by themselves (mirrors logCompletionFor)
  await db.insert(completions).values({
    choreId: feedTheDog.id,
    kidId: parent.id,
    occurrenceDate: occurrenceDateFor(feedTheDog, "UTC"),
    status: "approved",
    reviewedAt: new Date(),
  });

  const ripleyAvailable = await getAvailableChoresForKid(ripley.id, parentUserId);
  console.log(
    "1) 'Feed the dog' no longer available to Ripley:",
    ripleyAvailable.every(({ chore }) => chore.title !== "Feed the dog") ? "PASS" : "FAIL",
  );

  const ripleyTaken = await getTakenChoresForKid(ripley.id, parentUserId);
  const hit = ripleyTaken.find((t) => t.chore.title === "Feed the dog");
  console.log(
    "2) Ripley sees it as 'done by TestParent (Parent)':",
    hit?.claim.earnerName === "TestParent" && hit.claim.earnerIsParent && hit.claim.status === "approved"
      ? "PASS"
      : "FAIL",
    hit,
  );

  const jordanTaken = await getTakenChoresForKid(jordan.id, parentUserId);
  const hitJordan = jordanTaken.find((t) => t.chore.title === "Feed the dog");
  console.log(
    "3) Jordan (sibling) also sees it as taken:",
    hitJordan?.claim.earnerName === "TestParent" ? "PASS" : "FAIL",
  );

  await db.delete(completions).where(eq(completions.choreId, feedTheDog.id));
}

main().then(() => process.exit(0));
