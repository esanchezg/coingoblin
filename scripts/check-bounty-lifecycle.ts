import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { chores, completions, kids } from "../db/schema";
import { occurrenceDateFor } from "../lib/chore-schedule";
import { getBountiesForParent, getKidCompletions } from "../lib/queries";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const [bounty] = await db
    .select()
    .from(chores)
    .where(and(eq(chores.parentUserId, parentUserId), eq(chores.isBounty, true)));
  const kidRows = await db.select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const ripley = kidRows.find((k) => k.name === "Ripley")!;

  // Kid claims it (mirrors completeChore's insert)
  await db
    .insert(completions)
    .values({ choreId: bounty.id, kidId: ripley.id, occurrenceDate: occurrenceDateFor(bounty, "UTC") })
    .onConflictDoUpdate({
      target: [completions.choreId, completions.occurrenceDate],
      setWhere: sql`${completions.status} = 'rejected'`,
      set: { kidId: ripley.id, status: "pending", completedAt: new Date(), reviewedAt: null },
    });

  let bounties = await getBountiesForParent(parentUserId);
  const claimed = bounties.find((b) => b.bounty.id === bounty.id);
  console.log(
    "1) bounty shows as claimed/pending after kid claims:",
    claimed?.claim?.status === "pending" && claimed.claim.earnerName === "Ripley" ? "PASS" : "FAIL",
  );

  // Parent approves it (mirrors approveCompletion)
  await db
    .update(completions)
    .set({ status: "approved", reviewedAt: new Date() })
    .where(and(eq(completions.choreId, bounty.id), eq(completions.kidId, ripley.id)));

  bounties = await getBountiesForParent(parentUserId);
  const done = bounties.find((b) => b.bounty.id === bounty.id);
  console.log(
    "2) bounty moves to completed after approval:",
    done?.claim?.status === "approved" ? "PASS" : "FAIL",
  );

  const kidCompletions = await getKidCompletions(ripley.id);
  const bountyCompletion = kidCompletions.find((c) => c.choreTitle === "Clean the garage");
  console.log(
    "3) kid's completion history flags it as a bounty:",
    bountyCompletion?.isBounty === true && bountyCompletion.status === "approved" ? "PASS" : "FAIL",
  );
}

main().then(() => process.exit(0));
