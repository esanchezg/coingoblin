import { redirect } from "next/navigation";
import { getKidSession, getRememberedKidDevice } from "@/lib/kid-session";
import { lookupHouseholdByCode } from "@/lib/actions/kid";
import KidLoginForm from "./login-form";

export default async function KidLoginPage() {
  const session = await getKidSession();
  if (session) redirect("/kid");

  // Skip the family code step on a device that has logged in before. A stale
  // code (household gone) just falls back to the normal flow.
  const device = await getRememberedKidDevice();
  const household = device ? await lookupHouseholdByCode(device.familyCode) : null;
  const remembered =
    device && household?.ok && household.kids.length > 0
      ? {
          code: device.familyCode,
          parentUserId: household.parentUserId,
          kids: household.kids,
          kidId: device.kidId,
        }
      : null;

  return <KidLoginForm remembered={remembered} />;
}
