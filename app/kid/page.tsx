import { completeChore } from "@/lib/actions/kid";
import { getKidSession } from "@/lib/kid-session";
import { formatCents } from "@/lib/money";
import {
  getAvailableChoresForKid,
  getKidCompletions,
  getKidsWithBalances,
} from "@/lib/queries";

export default async function KidHome() {
  const session = await getKidSession();
  if (!session) return null;

  const [available, myCompletions, leaderboard] = await Promise.all([
    getAvailableChoresForKid(session.kid.id, session.parentUserId),
    getKidCompletions(session.kid.id),
    getKidsWithBalances(session.parentUserId),
  ]);

  const pending = myCompletions.filter((c) => c.status === "pending");
  const myBalance = leaderboard.find((k) => k.id === session.kid.id)?.balanceCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-emerald-600 p-5 text-white shadow-sm">
        <p className="text-sm text-emerald-100">Your balance</p>
        <p className="mt-1 text-4xl font-bold">{formatCents(myBalance)}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today&apos;s chores
        </h2>
        {available.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Nothing to do right now. Nice!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {available.map((chore) => (
              <li
                key={chore.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <p className="text-sm text-slate-500">{formatCents(chore.valueCents)}</p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await completeChore(chore.id);
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
              </span>
              <span className="font-medium">{formatCents(kid.balanceCents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
