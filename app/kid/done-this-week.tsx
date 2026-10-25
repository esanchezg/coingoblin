import { formatCents } from "@/lib/money";
import { completionDayIso, occurrenceDateLabel, weekStartIso } from "@/lib/chore-schedule";
import type { getKidCompletions, getTakenChoresForKid } from "@/lib/queries";

type Completion = Awaited<ReturnType<typeof getKidCompletions>>[number];
type Taken = Awaited<ReturnType<typeof getTakenChoresForKid>>[number];

// Collapsed history at the bottom of a kid's page: everything the kid did this
// week (plus anything older still waiting on a parent), then a smaller list of
// chores their siblings took. Shared by the kid's own page and the parent's
// read-only preview of it.
export default function DoneThisWeek({
  title,
  completions,
  taken,
  timezone,
}: {
  title: string;
  completions: Completion[];
  taken: Taken[];
  timezone: string;
}) {
  const weekStart = weekStartIso(timezone);
  const mine = completions
    .map((c) => ({ ...c, day: completionDayIso(c.occurrenceDate, c.completedAt, timezone) }))
    .filter((c) => c.status === "pending" || c.day >= weekStart)
    .sort((a, b) => b.day.localeCompare(a.day) || b.completedAt.getTime() - a.completedAt.getTime());

  return (
    <section className="flex flex-col gap-2">
      <details className="rounded-2xl border border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
          ✅ {title} ({mine.length})
        </summary>
        {mine.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400">Nothing yet this week.</p>
        ) : (
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {mine.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
              >
                <span className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {occurrenceDateLabel(c.day)}
                  </span>
                  <span>
                    {c.isBounty && "🎯 "}
                    {c.choreTitle}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {c.status === "pending" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      Waiting
                    </span>
                  )}
                  {c.status === "rejected" && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                      Not approved
                    </span>
                  )}
                  <span className={`font-medium ${c.status === "rejected" ? "text-slate-400 line-through" : ""}`}>
                    {formatCents(c.valueCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {taken.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Done by others ({taken.length})
          </summary>
          <ul className="flex flex-col gap-1.5 px-3 pb-3">
            {taken.map(({ chore, occurrenceDate, claim }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between gap-3 px-1 text-sm text-slate-500 dark:text-slate-400"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: claim.earnerColor }} />
                  {occurrenceDateLabel(occurrenceDate) && `${occurrenceDateLabel(occurrenceDate)} · `}
                  {chore.title} — {claim.earnerIsParent ? `${claim.earnerName} (Parent)` : claim.earnerName}
                  {claim.status === "pending" && " · waiting"}
                </span>
                <span className="font-medium">{formatCents(chore.valueCents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
