import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { kids } from "../db/schema";
import {
  getAvailableBountiesForKid,
  getAvailableChoresForKid,
  getBountiesForParent,
  getChoresForParent,
} from "../lib/queries";
import { scheduleLabel } from "../lib/chore-schedule";

async function main() {
  const parentUserId = "test_parent_local";
  const kidRows = await getDb().select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;

  const regularChores = await getChoresForParent(parentUserId);
  console.log(
    "1) getChoresForParent excludes bounty:",
    regularChores.every((c) => c.title !== "Clean the garage") ? "PASS" : "FAIL",
    regularChores.map((c) => c.title),
  );

  const availableChores = await getAvailableChoresForKid(ripley.id, parentUserId);
  console.log(
    "2) getAvailableChoresForKid excludes bounty:",
    availableChores.every((c) => c.title !== "Clean the garage") ? "PASS" : "FAIL",
    availableChores.map((c) => c.title),
  );

  const availableBounties = await getAvailableBountiesForKid(ripley.id, parentUserId);
  console.log(
    "3) getAvailableBountiesForKid finds the open bounty:",
    availableBounties.some((c) => c.title === "Clean the garage") ? "PASS" : "FAIL",
    availableBounties.map((c) => c.title),
  );

  const bounties = await getBountiesForParent(parentUserId);
  console.log(
    "4) getBountiesForParent returns it as open (no claim):",
    bounties.some((b) => b.bounty.title === "Clean the garage" && b.claim === null) ? "PASS" : "FAIL",
  );

  const labels = availableChores.map((c) => `${c.title}: ${scheduleLabel(c)}`);
  console.log("5) schedule labels for today's chores:", labels);
  const dailyOk = labels.some((l) => l.startsWith("Feed the dog: Every day"));
  console.log("   'Feed the dog' labeled 'Every day':", dailyOk ? "PASS" : "FAIL");
}

main().then(() => process.exit(0));
