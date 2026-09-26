import type { chores } from "@/db/schema";

type Chore = typeof chores.$inferSelect;

// Sentinel occurrence date for one-off chores, so the unique (choreId, occurrenceDate)
// index caps them at a single completion ever, regardless of when they're done.
const ONCE_OCCURRENCE_DATE = "0001-01-01";

// Fallback used whenever a household hasn't had its zone detected yet, or has a
// zone string Intl doesn't recognize. Timezone resolution must never be a hard
// requirement that can take down a chore list.
export const DEFAULT_TIMEZONE = "UTC";

function dateFormatterFor(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    // Invalid/unknown IANA zone (Intl throws RangeError on construction) — degrade
    // to UTC rather than crashing every page that renders a chore list.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
}

// "Today" as a YYYY-MM-DD calendar date in the given IANA zone. Assembled from
// formatToParts' semantic part types rather than trusting a locale's separator/
// field order to stay stable across Node/ICU versions.
export function todayIso(timezone: string, now: Date = new Date()): string {
  const parts = dateFormatterFor(timezone).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

// Day of week (0=Sun .. 6=Sat, matching chores.daysOfWeek) in the given IANA zone.
// Derived from the already-computed zone-local date rather than a second Intl call,
// so the date and the weekday can never disagree across a midnight boundary.
export function weekdayInZone(timezone: string, now: Date = new Date()): number {
  return new Date(`${todayIso(timezone, now)}T00:00:00Z`).getUTCDay();
}

export function occurrenceDateFor(
  chore: Pick<Chore, "recurrence">,
  timezone: string,
  now: Date = new Date(),
): string {
  return chore.recurrence === "once" ? ONCE_OCCURRENCE_DATE : todayIso(timezone, now);
}

export function isScheduledToday(
  chore: Pick<Chore, "recurrence" | "daysOfWeek">,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (chore.recurrence === "once" || chore.recurrence === "daily") return true;
  return parseDaysOfWeek(chore.daysOfWeek).includes(weekdayInZone(timezone, now));
}

// YYYY-MM-DD from a UTC-anchored Date. The cursor dates in claimableOccurrenceDates
// are calendar anchors, not instants, so this must never re-zone them.
function isoFromUtcDate(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Every occurrence of this chore that is still open to be logged right now: from
// this week's Monday (household-local) through today, inclusive, limited to the
// days the chore is actually scheduled on. Chronological, ascending. A missed day
// stays in this set for the rest of the week and drops out once Monday arrives.
// One-time chores/bounties are outside the week window entirely — one sentinel
// slot, forever, until claimed. Chores with allowCatchUp: false skip the makeup
// window entirely — only today's slot (if scheduled) is ever claimable, and a
// missed day is gone for good once the day ends.
export function claimableOccurrenceDates(
  chore: Pick<Chore, "recurrence" | "daysOfWeek"> & { allowCatchUp?: boolean },
  timezone: string,
  now: Date = new Date(),
): string[] {
  if (chore.recurrence === "once") return [occurrenceDateFor(chore, timezone, now)];

  const days = chore.recurrence === "daily" ? null : parseDaysOfWeek(chore.daysOfWeek);

  // Anchor on the household-local calendar date, then do every subsequent step in
  // UTC. UTC has no DST, so the walk can't skip or duplicate a calendar day; the
  // zone only ever influences which date "today" is.
  const cursor = new Date(`${todayIso(timezone, now)}T00:00:00Z`);
  const daysSinceMonday = (cursor.getUTCDay() + 6) % 7; // 0=Sun..6=Sat, Monday=1
  cursor.setUTCDate(cursor.getUTCDate() - daysSinceMonday);

  const dates: string[] = [];
  for (let i = 0; i <= daysSinceMonday; i++) {
    const scheduledThisDay = days === null || days.includes(cursor.getUTCDay());
    const withinWindow = chore.allowCatchUp !== false || i === daysSinceMonday;
    if (scheduledThisDay && withinWindow) dates.push(isoFromUtcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Human label for one slot. null for the one-time sentinel — there is no
// meaningful weekday for "whenever you get to it"; callers should omit the day
// chip rather than print a fake one.
export function occurrenceDayLabel(
  occurrenceDate: string,
  timezone: string,
  now: Date = new Date(),
): string | null {
  if (occurrenceDate === ONCE_OCCURRENCE_DATE) return null;
  if (occurrenceDate === todayIso(timezone, now)) return "Today";
  return DAY_LABELS[new Date(`${occurrenceDate}T00:00:00Z`).getUTCDay()] ?? null;
}

// True only for a genuine make-up slot from earlier this week. The one-time
// sentinel is not a catch-up (it has no day), and neither is today.
export function isCatchUpOccurrence(
  occurrenceDate: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (occurrenceDate === ONCE_OCCURRENCE_DATE) return false;
  return occurrenceDate !== todayIso(timezone, now);
}

export function parseDaysOfWeek(value: string | null): number[] {
  return (value ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(chore: Pick<Chore, "recurrence" | "daysOfWeek">): string {
  if (chore.recurrence === "daily") return "Every day";
  if (chore.recurrence === "once") return "One-time";
  const days = parseDaysOfWeek(chore.daysOfWeek).map((d) => DAY_LABELS[d]);
  return days.length ? days.join(", ") : "Weekly";
}
