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
