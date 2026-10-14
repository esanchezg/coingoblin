import type { AuthInfo } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { households } from "@/db/schema";

// Turns a verified OAuth token into the parent it was issued to. The parent id is the Clerk user
// id on the token; the household must already exist (the dashboard has been opened at least once).
export async function resolveParent(authInfo: AuthInfo | undefined): Promise<string | null> {
  const userId = typeof authInfo?.extra?.userId === "string" ? authInfo.extra.userId : null;
  if (!userId) return null;
  const [row] = await getDb()
    .select({ parentUserId: households.parentUserId })
    .from(households)
    .where(eq(households.parentUserId, userId))
    .limit(1);
  return row?.parentUserId ?? null;
}
