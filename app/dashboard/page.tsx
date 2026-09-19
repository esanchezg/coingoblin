import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatCents } from "@/lib/money";
import { getEarnersWithBalances, getOrCreateHousehold, getPendingCompletions } from "@/lib/queries";

export default async function DashboardHome() {
  const { userId } = await auth();
  if (!userId) return null;

  const [household, earnersWithBalances, pending] = await Promise.all([
    getOrCreateHousehold(userId),
    getEarnersWithBalances(userId),
    getPendingCompletions(userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl bg-indigo-600 p-5 text-white shadow-sm">
        <p className="text-sm text-indigo-100">Family code — share with your kids</p>
        <p className="mt-1 text-3xl font-bold tracking-[0.3em]">{household.familyCode}</p>
      </section>

      {pending.length > 0 && (
        <Link
          href="/dashboard/approvals"
          className="flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="font-medium">
            {pending.length} chore{pending.length === 1 ? "" : "s"} waiting for approval
          </span>
          <span>→</span>
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Balances
        </h2>
        {earnersWithBalances.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No kids yet. Add one from the Kids tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {earnersWithBalances.map((earner) => (
              <li
                key={earner.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: earner.color }}
                  />
                  <span className="font-medium">{earner.name}</span>
                  {earner.isParent && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      Parent
                    </span>
                  )}
                </div>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCents(earner.balanceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
