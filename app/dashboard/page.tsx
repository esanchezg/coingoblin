import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatCents } from "@/lib/money";
import { getKidsWithBalances, getOrCreateHousehold, getPendingCompletions } from "@/lib/queries";

export default async function DashboardHome() {
  const { userId } = await auth();
  if (!userId) return null;

  const [household, kidsWithBalances, pending] = await Promise.all([
    getOrCreateHousehold(userId),
    getKidsWithBalances(userId),
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
          className="flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <span className="font-medium">
            {pending.length} chore{pending.length === 1 ? "" : "s"} waiting for approval
          </span>
          <span>→</span>
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Balances
        </h2>
        {kidsWithBalances.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No kids yet. Add one from the Kids tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kidsWithBalances.map((kid) => (
              <li
                key={kid.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: kid.color }}
                  />
                  <span className="font-medium">{kid.name}</span>
                </div>
                <span className="font-semibold text-emerald-600">
                  {formatCents(kid.balanceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
