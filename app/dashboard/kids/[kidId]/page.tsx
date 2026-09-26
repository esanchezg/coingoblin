import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { formatCents } from "@/lib/money";
import { isCatchUpOccurrence, occurrenceDayLabel, scheduleLabel } from "@/lib/chore-schedule";
import {
  getAvailableBountiesForKid,
  getAvailableChoresForKid,
  getKidCompletions,
  getKidsForParent,
  getEarnersWithBalances,
  getHouseholdTimezone,
  getTakenChoresForKid,
} from "@/lib/queries";

// Read-only view so a parent can check what a kid sees without logging out
// of their own account. Claiming/completing chores is still done by the kid,
// or by the parent from the Chores page (which auto-approves), never here.
export default async function KidDashboardPreview({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;
  const { kidId } = await params;

  const kidRows = await getKidsForParent(userId);
  const kid = kidRows.find((k) => k.id === kidId);
  if (!kid) notFound();

  const [available, bounties, taken, completions, leaderboard, timezone] = await Promise.all([
    getAvailableChoresForKid(kid.id, userId),
    getAvailableBountiesForKid(kid.id, userId),
    getTakenChoresForKid(kid.id, userId),
    getKidCompletions(kid.id),
    getEarnersWithBalances(userId),
    getHouseholdTimezone(userId),
  ]);

  const dueToday = available.filter((s) => !isCatchUpOccurrence(s.occurrenceDate, timezone));
  const catchUp = available.filter((s) => isCatchUpOccurrence(s.occurrenceDate, timezone));

  const pending = completions.filter((c) => c.status === "pending");
  const completedBounties = completions.filter((c) => c.isBounty && c.status === "approved");
  const balance = leaderboard.find((k) => k.id === kid.id)?.balanceCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/kids" className="text-sm text-indigo-600 dark:text-indigo-400">
          ← Back to Kids
        </Link>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Viewing only
        </span>
      </div>

      <section className="rounded-2xl bg-emerald-600 p-5 text-white shadow-sm">
        <p className="flex items-center gap-2 text-sm text-emerald-100">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kid.color }} />
          {kid.name}&apos;s balance
        </p>
        <p className="mt-1 text-4xl font-bold">{formatCents(balance)}</p>
      </section>

      {bounties.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            🎯 Bounties available
          </h2>
          <ul className="flex flex-col gap-2">
            {bounties.map((bounty) => (
              <li
                key={bounty.id}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-900 dark:bg-slate-900"
              >
                <p className="font-medium">{bounty.title}</p>
                <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{formatCents(bounty.valueCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Today&apos;s chores
        </h2>
        {dueToday.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Nothing due today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dueToday.map(({ chore, occurrenceDate }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatCents(chore.valueCents)}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {scheduleLabel(chore)}
                    </span>
                    {!chore.allowCatchUp && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                        Gone if not done today
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {catchUp.length > 0 && (
        <section className="rounded-2xl border border-sky-300 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
            ⏰ Catch-up chores
          </h2>
          <ul className="flex flex-col gap-2">
            {catchUp.map(({ chore, occurrenceDate }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-2xl border border-sky-200 bg-white p-4 dark:border-sky-900 dark:bg-slate-900"
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatCents(chore.valueCents)}</p>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                      {occurrenceDayLabel(occurrenceDate, timezone)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {taken.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Already done this week
          </h2>
          <ul className="flex flex-col gap-2">
            {taken.map(({ chore, occurrenceDate, claim }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: claim.earnerColor }} />
                  {occurrenceDayLabel(occurrenceDate, timezone)} · {chore.title} —{" "}
                  {claim.status === "approved"
                    ? `done by ${claim.earnerIsParent ? `${claim.earnerName} (Parent)` : claim.earnerName}`
                    : `claimed by ${claim.earnerName} · awaiting approval`}
                </span>
                <span className="font-medium">{formatCents(chore.valueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Waiting for approval
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950"
              >
                <span>{c.choreTitle}</span>
                <span className="text-amber-700 dark:text-amber-400">{formatCents(c.valueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {completedBounties.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Bounties crushed
          </h2>
          <ul className="flex flex-col gap-2">
            {completedBounties.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              >
                <span>🎯 {c.choreTitle}</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{formatCents(c.valueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
