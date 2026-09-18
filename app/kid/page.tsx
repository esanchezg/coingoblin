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
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">
            🎯 Bounties
          </h2>
          <ul className="flex flex-col gap-2">
            {bounties.map((bounty) => (
              <li
                key={bounty.id}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{bounty.title}</p>
                  <p className="text-lg font-bold text-amber-700">{formatCents(bounty.valueCents)}</p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await completeChore(bounty.id);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white"
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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today&apos;s chores
        </h2>
        {dueToday.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Nothing due today. Nice!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dueToday.map(({ chore, occurrenceDate }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-slate-500">{formatCents(chore.valueCents)}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {scheduleLabel(chore)}
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
                    className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white"
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
        <section className="rounded-2xl border border-sky-300 bg-sky-50 p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-800">
            ⏰ Catch up on chores you missed
          </h2>
          <ul className="flex flex-col gap-2">
            {catchUp.map(({ chore, occurrenceDate }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-2xl border border-sky-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-slate-500">{formatCents(chore.valueCents)}</p>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
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
                    className="rounded-xl bg-sky-600 px-4 py-2 font-semibold text-white"
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Already done this week
          </h2>
          <ul className="flex flex-col gap-2">
            {taken.map(({ chore, occurrenceDate, claim }) => (
              <li
                key={`${chore.id}:${occurrenceDate}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Waiting for approval
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
              >
                <span>{c.choreTitle}</span>
                <span className="text-amber-700">{formatCents(c.valueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {completedBounties.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Bounties you&apos;ve crushed
          </h2>
          <ul className="flex flex-col gap-2">
            {completedBounties.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"
              >
                <span>🎯 {c.choreTitle}</span>
                <span className="font-medium text-slate-700">{formatCents(c.valueCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Family leaderboard
        </h2>
        <ul className="flex flex-col gap-2">
          {leaderboard.map((kid, i) => (
            <li
              key={kid.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                kid.id === session.kid.id
                  ? "border-indigo-300 bg-indigo-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-slate-400">#{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kid.color }} />
                {kid.name}
                {kid.isParent && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
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
