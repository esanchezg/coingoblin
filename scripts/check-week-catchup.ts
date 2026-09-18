import {
  claimableOccurrenceDates,
  isCatchUpOccurrence,
  occurrenceDayLabel,
  todayIso,
} from "../lib/chore-schedule";

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) failures++;
}
function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const daily = { recurrence: "daily" as const, daysOfWeek: null };
const monWed = { recurrence: "weekly" as const, daysOfWeek: "1,3" };
const friOnly = { recurrence: "weekly" as const, daysOfWeek: "5" };
const once = { recurrence: "once" as const, daysOfWeek: null };

// 1) Mid-week Wednesday, Denver — daily window is Mon/Tue/Wed
const t1 = new Date("2026-09-16T20:00:00Z"); // Wed 14:00 MDT
check(
  "daily window mid-week (Denver)",
  arraysEqual(claimableOccurrenceDates(daily, "America/Denver", t1), [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
  ]),
);

// 2) Same instant, weekly Mon+Wed chore — Tuesday absent
check(
  "weekly Mon+Wed window mid-week (Denver)",
  arraysEqual(claimableOccurrenceDates(monWed, "America/Denver", t1), ["2026-09-14", "2026-09-16"]),
);

// 3) Same instant, weekly Fri-only chore — empty, never a future slot
check(
  "weekly Fri-only chore has no slots yet on a Wednesday",
  claimableOccurrenceDates(friOnly, "America/Denver", t1).length === 0,
);

// 4) The exact instant from the timezone regression test — still Tuesday in Denver
const t2 = new Date("2026-09-16T01:32:43Z");
check(
  "still-Tuesday instant excludes Wednesday",
  arraysEqual(claimableOccurrenceDates(daily, "America/Denver", t2), ["2026-09-14", "2026-09-15"]),
);

// 5) Monday reset — only today, prior week's dates gone
const t3 = new Date("2026-11-02T18:00:00Z"); // Mon in Denver
const mondayResult = claimableOccurrenceDates(daily, "America/Denver", t3);
check("monday reset yields only today", arraysEqual(mondayResult, ["2026-11-02"]));
check("monday reset excludes prior week", !mondayResult.includes("2026-10-26"));

// 6) Sunday — full 7-day window, spanning the DST fall-back
const t4 = new Date("2026-11-01T18:00:00Z"); // Sun in Denver, DST ends this day
check(
  "sunday gives full week across DST fall-back",
  arraysEqual(claimableOccurrenceDates(daily, "America/Denver", t4), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]),
);

// 7) once chores: always the sentinel, never a catch-up, no day label
check(
  "once chore is always the sentinel regardless of zone/instant",
  arraysEqual(claimableOccurrenceDates(once, "Asia/Tokyo", t1), ["0001-01-01"]),
);
check("once sentinel is never a catch-up", !isCatchUpOccurrence("0001-01-01", "America/Denver", t1));
check("once sentinel has no day label", occurrenceDayLabel("0001-01-01", "America/Denver", t1) === null);

// 8) Today / day labels
check(
  "today's date labels as 'Today'",
  occurrenceDayLabel(todayIso("America/Denver", t1), "America/Denver", t1) === "Today",
);
check("monday labels as 'Mon'", occurrenceDayLabel("2026-09-14", "America/Denver", t1) === "Mon");
check("monday is a catch-up on Wednesday", isCatchUpOccurrence("2026-09-14", "America/Denver", t1));

// 9) Positive-offset mirror: Tokyo already Thursday when Denver is still Wednesday
const t5 = new Date("2026-09-16T23:30:00Z");
check(
  "tokyo window ends later than denver at the same instant",
  claimableOccurrenceDates(daily, "Asia/Tokyo", t5).at(-1) === "2026-09-17" &&
    claimableOccurrenceDates(daily, "America/Denver", t5).at(-1) === "2026-09-16",
);

// 10) Non-integer offset
check(
  "non-integer offset (Pacific/Chatham +12:45)",
  arraysEqual(claimableOccurrenceDates(daily, "Pacific/Chatham", new Date("2026-03-01T11:00:00Z")), [
    "2026-03-02",
  ]),
);

// 11) Month boundary
check(
  "month boundary (Asia/Kathmandu)",
  arraysEqual(
    claimableOccurrenceDates(daily, "Asia/Kathmandu", new Date("2026-02-28T19:00:00Z")),
    ["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01"],
  ),
);

// 12) Year boundary
check(
  "year boundary (UTC)",
  arraysEqual(
    claimableOccurrenceDates(daily, "UTC", new Date("2027-01-01T12:00:00Z")),
    ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"],
  ),
);

// 13) Invalid zone degrades to UTC, never throws
check(
  "invalid zone degrades to UTC",
  arraysEqual(claimableOccurrenceDates(daily, "Not/AZone", t1), claimableOccurrenceDates(daily, "UTC", t1)),
);

// 14) Monotonic/shape invariants across many consecutive instants
let allOk = true;
for (let h = 0; h < 400; h++) {
  const t = new Date(Date.UTC(2026, 0, 1, h));
  const dates = claimableOccurrenceDates(daily, "America/Denver", t);
  if (dates.length === 0 || dates.length > 7) allOk = false;
  for (let i = 0; i < dates.length; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dates[i])) allOk = false;
    if (i > 0 && dates[i] <= dates[i - 1]) allOk = false;
  }
  const last = dates.at(-1);
  if (last !== todayIso("America/Denver", t)) allOk = false;
  const firstWeekday = new Date(`${dates[0]}T00:00:00Z`).getUTCDay();
  if (firstWeekday !== 1) allOk = false;
}
check("monotonic ascending, bounded length, correct start/end weekday across 400 instants", allOk);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
if (failures > 0) process.exit(1);
