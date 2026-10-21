import type { AuthInfo } from "@modelcontextprotocol/server";
import { findHouseholdForUser } from "@/lib/current-parent";

// Turns a verified OAuth token into the parent it was issued to and their household. The user id
// is the Clerk user id on the token; the household must already exist (the dashboard has been opened
// at least once).
export async function resolveParent(
  authInfo: AuthInfo | undefined,
): Promise<{ householdId: string; userId: string } | null> {
  const userId = typeof authInfo?.extra?.userId === "string" ? authInfo.extra.userId : null;
  if (!userId) return null;
  const householdId = await findHouseholdForUser(userId);
  return householdId ? { householdId, userId } : null;
}
