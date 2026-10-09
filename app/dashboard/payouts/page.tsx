import { auth } from "@clerk/nextjs/server";
import { markPaid } from "@/lib/actions/parent";
import { formatCents } from "@/lib/money";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/date";
import {
  getEarnersWithBalances,
  getHouseholdTimezone,
  getPayoutHistory,
  getUnpaidBreakdownForParent,
} from "@/lib/queries";
import CollapsibleSection from "@/app/collapsible-section";

export default async function PayoutsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [earnersWithBalances, history, timezone, breakdowns] = await Promise.all([
    getEarnersWithBalances(userId),
    getPayoutHistory(userId),
    getHouseholdTimezone(userId),
    getUnpaidBreakdownForParent(userId),
  ]);
  // Paying yourself doesn't make sense — this list is real kids only.
  const kidsWithBalances = earnersWithBalances.filter((e) => !e.isParent);

  return (
    <div className="flex flex-col gap-6">
      <CollapsibleSection id="payouts-balances-payouts" title={<>Balances &amp; payouts</>}>
        {kidsWithBalances.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No kids yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {kidsWithBalances.map((kid) => {
              const items = breakdowns.get(kid.id) ?? [];
              const listedCents = items.reduce((sum, item) => sum + item.valueCents, 0);
              const carriedOverCents = kid.balanceCents - listedCents;
              const showBreakdown = items.length > 0 || carriedOverCents !== 0;

              return (
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

                  {showBreakdown && (
                    <details className="mb-3">
                      <summary className="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400">
                        What&apos;s this made of?
                      </summary>
                      <ul className="mt-2 flex flex-col gap-2">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div>
                              <span className="flex items-center gap-2">
                                {item.choreTitle}
                                {item.isBounty && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                                    🎯 Bounty
                                  </span>
                                )}
                              </span>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                Claimed {formatDateTimeInZone(item.completedAt, timezone)}
                              </p>
                            </div>
                            <span className="font-medium">{formatCents(item.valueCents)}</span>
                          </li>
                        ))}
                        {carriedOverCents !== 0 && (
                          <li className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            <span>
                              {carriedOverCents > 0 ? "Carried over from earlier" : "Paid ahead from earlier"}
                            </span>
                            <span className="font-medium">{formatCents(carriedOverCents)}</span>
                          </li>
                        )}
                        <li className="flex items-center justify-between px-4 py-1 text-sm font-semibold">
                          <span>Total</span>
                          <span>{formatCents(kid.balanceCents)}</span>
                        </li>
                      </ul>
                    </details>
                  )}

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
              );
            })}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="payouts-payout-history" title="Payout history">
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
                <div>
                  <span>
                    {p.kidName}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatDateInZone(p.createdAt, timezone)}
                  </p>
                </div>
                <span className="font-medium">{formatCents(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>
    </div>
  );
}
