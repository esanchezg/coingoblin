"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setHouseholdTimezoneIfUnset } from "@/lib/actions/parent";

// Renders nothing. Reports the browser's IANA zone once so chore "days" line up
// with the family's actual calendar instead of the server's UTC clock.
let reported = false;

export default function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    if (reported) return;
    reported = true;

    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!timezone) return;

    setHouseholdTimezoneIfUnset(timezone)
      .then((result) => {
        // First detection changes what "today" means for every chore on the
        // page — refresh so the parent isn't left looking at stale UTC data.
        if (result?.updated) router.refresh();
      })
      .catch(() => {});
  }, [router]);

  return null;
}
