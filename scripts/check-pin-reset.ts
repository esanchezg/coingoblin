import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { kids } from "../db/schema";

async function main() {
  const db = getDb();
  const parentUserId = "test_parent_local";

  const [ripley] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.parentUserId, parentUserId), eq(kids.name, "Ripley")));

  const oldPinValid = await bcrypt.compare("1234", ripley.pinHash);
  console.log("1) old PIN (1234) currently valid:", oldPinValid ? "PASS" : "FAIL");

  // Mirrors resetKidPin's logic (which requires Clerk auth, so we exercise the DB write directly)
  const newPinHash = await bcrypt.hash("9876", 10);
  await db
    .update(kids)
    .set({ pinHash: newPinHash })
    .where(and(eq(kids.id, ripley.id), eq(kids.parentUserId, parentUserId), eq(kids.isParent, false)));

  const [updated] = await db.select().from(kids).where(eq(kids.id, ripley.id));
  const oldPinNowInvalid = !(await bcrypt.compare("1234", updated.pinHash));
  const newPinValid = await bcrypt.compare("9876", updated.pinHash);
  console.log("2) old PIN rejected after reset:", oldPinNowInvalid ? "PASS" : "FAIL");
  console.log("3) new PIN accepted after reset:", newPinValid ? "PASS" : "FAIL");

  // Guard: resetting the parent pseudo-earner's row should never be possible via this path
  const [parentEarner] = await db
    .select()
    .from(kids)
    .where(and(eq(kids.parentUserId, parentUserId), eq(kids.isParent, true)));
  const beforeHash = parentEarner.pinHash;
  await db
    .update(kids)
    .set({ pinHash: "should-not-apply" })
    .where(and(eq(kids.id, parentEarner.id), eq(kids.parentUserId, parentUserId), eq(kids.isParent, false)));
  const [afterAttempt] = await db.select().from(kids).where(eq(kids.id, parentEarner.id));
  console.log(
    "4) parent pseudo-earner's PIN untouched by isParent=false guard:",
    afterAttempt.pinHash === beforeHash ? "PASS" : "FAIL",
  );
}

main().then(() => process.exit(0));
