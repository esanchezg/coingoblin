import { isScheduledToday, occurrenceDateFor, todayIso, weekdayInZone } from "../lib/chore-schedule";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failures++;
}

const daily = { recurrence: "daily" as const };
const tue = { recurrence: "weekly" as const, daysOfWeek: "2" }; // Tue only
const wed = { recurrence: "weekly" as const, daysOfWeek: "3" }; // Wed only

// The exact instant Sam submitted: Tue 19:32 Denver / Wed 10:32 Tokyo / Wed 01:32 UTC.
const t = new Date("2026-09-16T01:32:43Z");

check("denver date is Tue (the negative-offset bug)", todayIso("America/Denver", t) === "2026-09-15");
check("utc date is Wed", todayIso("UTC", t) === "2026-09-16");
check("tokyo date is Wed", todayIso("Asia/Tokyo", t) === "2026-09-16");
check("denver != utc at this instant", todayIso("America/Denver", t) !== todayIso("UTC", t));

check("denver weekday is Tue (2)", weekdayInZone("America/Denver", t) === 2);
check("tokyo weekday is Wed (3)", weekdayInZone("Asia/Tokyo", t) === 3);

check(
  "occurrenceDateFor daily chore in denver = Tue",
  occurrenceDateFor(daily, "America/Denver", t) === "2026-09-15",
);
check("weekly Tue chore IS scheduled in Denver at t", isScheduledToday(tue, "America/Denver", t));
check("weekly Tue chore NOT scheduled in Tokyo at t", !isScheduledToday(tue, "Asia/Tokyo", t));
check("weekly Wed chore IS scheduled in Tokyo at t", isScheduledToday(wed, "Asia/Tokyo", t));

// Positive-offset mirror bug: 23:30Z Wed is still Wed in UTC but already Thu in Tokyo.
const t2 = new Date("2026-09-16T23:30:00Z");
check(
  "tokyo rolls to Thu before UTC does (positive-offset mirror bug)",
  todayIso("Asia/Tokyo", t2) === "2026-09-17" && todayIso("UTC", t2) === "2026-09-16",
);

// DST: Denver is UTC-6 in September, UTC-7 in December.
check(
  "dst-aware: denver in december is UTC-7",
  todayIso("America/Denver", new Date("2026-12-16T06:30:00Z")) === "2026-12-15",
);

// Never-blocks contract.
check("invalid zone degrades to UTC answer", todayIso("Not/AZone", t) === todayIso("UTC", t));
check(
  "once chores are zone-independent",
  occurrenceDateFor({ recurrence: "once" }, "Asia/Tokyo") === "0001-01-01",
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
if (failures > 0) process.exit(1);
