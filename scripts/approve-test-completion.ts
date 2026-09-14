import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { completions } from "../db/schema";

async function main() {
  const db = getDb();
  const pending = await db
    .select()
    .from(completions)
    .where(eq(completions.status, "pending"));
  console.log("Pending before:", pending);

  for (const row of pending) {
    await db
      .update(completions)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(eq(completions.id, row.id));
  }
  console.log("Approved", pending.length, "completion(s)");
}

main().then(() => process.exit(0));
