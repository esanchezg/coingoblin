import type { chores } from "@/db/schema";

type Chore = typeof chores.$inferSelect;

// Sentinel occurrence date for one-off chores, so the unique (choreId, occurrenceDate)
// index caps them at a single completion ever, regardless of when they're done.
const ONCE_OCCURRENCE_DATE = "0001-01-01";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function occurrenceDateFor(chore: Pick<Chore, "recurrence">): string {
  return chore.recurrence === "once" ? ONCE_OCCURRENCE_DATE : todayIso();
}

export function isScheduledToday(chore: Pick<Chore, "recurrence" | "daysOfWeek">): boolean {
  if (chore.recurrence === "once" || chore.recurrence === "daily") return true;
  const days = (chore.daysOfWeek ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
  return days.includes(new Date().getDay());
}

export function parseDaysOfWeek(value: string | null): number[] {
  return (value ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
