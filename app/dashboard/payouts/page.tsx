import { auth } from "@clerk/nextjs/server";
import { markPaid } from "@/lib/actions/parent";
import { formatCents } from "@/lib/money";
import { getEarnersWithBalances, getPayoutHistory } from "@/lib/queries";

export default async function PayoutsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [earnersWithBalances, history] = await Promise.all([
    getEarnersWithBalances(userId),
    getPayoutHistory(userId),
  ]);
  // Paying yourself doesn't make sense — this list is real kids only.
  const kidsWithBalances = earnersWithBalances.filter((e) => !e.isParent);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Balances &amp; payouts
        </h2>
        {kidsWithBalances.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No kids yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {kidsWithBalances.map((kid) => (
              <li key={kid.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: kid.color }}
                    />
                    <span className="font-medium">{kid.name}</span>
                  </div>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCents(kid.balanceCents)} owed
                  </span>
                </div>
                <form action={markPaid} className="flex gap-2">
                  <input type="hidden" name="kidId" value={kid.id} />
                  <input
                    name="amount"
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="Amount"
                    required
                    className="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    name="note"
                    placeholder="Note (optional)"
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white dark:bg-indigo-700"
                  >
                    Mark paid
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Payout history
        </h2>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No payouts recorded yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <span>
                  {p.kidName}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="font-medium">{formatCents(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
