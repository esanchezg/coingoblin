import { completeChore } from "@/lib/actions/kid";
import { getKidSession } from "@/lib/kid-session";
import { formatCents } from "@/lib/money";
import { isCatchUpOccurrence, occurrenceDayLabel, scheduleLabel } from "@/lib/chore-schedule";
import {
  getAvailableBountiesForKid,
  getAvailableChoresForKid,
  getKidCompletions,
  getEarnersWithBalances,
  getHouseholdTimezone,
  getTakenChoresForKid,
} from "@/lib/queries";

export default async function KidHome() {
  const session = await getKidSession();
  if (!session) return null;

  const [available, bounties, taken, myCompletions, leaderboard, timezone] = await Promise.all([
    getAvailableChoresForKid(session.kid.id, session.parentUserId),
    getAvailableBountiesForKid(session.kid.id, session.parentUserId),
    getTakenChoresForKid(session.kid.id, session.parentUserId),
    getKidCompletions(session.kid.id),
    getEarnersWithBalances(session.parentUserId),
    getHouseholdTimezone(session.parentUserId),
  ]);

  const dueToday = available.filter((s) => !isCatchUpOccurrence(s.occurrenceDate, timezone));
  const catchUp = available.filter((s) => isCatchUpOccurrence(s.occurrenceDate, timezone));

  const pending = myCompletions.filter((c) => c.status === "pending");
  const completedBounties = myCompletions.filter((c) => c.isBounty && c.status === "approved");
  const myBalance = leaderboard.find((k) => k.id === session.kid.id)?.balanceCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-emerald-600 p-5 text-white shadow-sm">
        <p className="text-sm text-emerald-100">Your balance</p>
        <p className="mt-1 text-4xl font-bold">{formatCents(myBalance)}</p>
      </section>

      {bounties.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            🎯 Bounties
          </h2>
          <ul className="flex flex-col gap-2">
            {bounties.map((bounty) => (
              <li
                key={bounty.id}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-900 dark:bg-slate-900"
              >
                <div>
                  <p className="font-medium">{bounty.title}</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{formatCents(bounty.valueCents)}</p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await completeChore(bounty.id);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white dark:bg-amber-700"
                  >
                    Claim it!
                  </button>
                </form>
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
            Nothing due today. Nice!
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
                <form
                  action={async () => {
                    "use server";
                    await completeChore(chore.id, occurrenceDate);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white dark:bg-indigo-700"
                  >
                    Done!
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {catchUp.length > 0 && (
        <section className="rounded-2xl border border-sky-300 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
            ⏰ Catch up on chores you missed
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
                <form
                  action={async () => {
                    "use server";
                    await completeChore(chore.id, occurrenceDate);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white dark:bg-sky-700"
                  >
                    Done!
                  </button>
                </form>
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
            Bounties you&apos;ve crushed
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

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Family leaderboard
        </h2>
        <ul className="flex flex-col gap-2">
          {leaderboard.map((kid, i) => (
            <li
              key={kid.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                kid.id === session.kid.id
                  ? "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">#{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kid.color }} />
                {kid.name}
                {kid.isParent && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Parent
                  </span>
                )}
              </span>
              <span className="font-medium">{formatCents(kid.balanceCents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
