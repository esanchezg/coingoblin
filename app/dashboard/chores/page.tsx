import { auth } from "@clerk/nextjs/server";
import { createChore, deleteChore, logCompletionFor, setChoreActive } from "@/lib/actions/parent";
import { formatCents } from "@/lib/money";
import {
  getBountiesForParent,
  getChoresForParent,
  getClaimsForChores,
  getEarnersForParent,
  getHouseholdTimezone,
} from "@/lib/queries";
import { DAY_LABELS, isScheduledToday, scheduleLabel } from "@/lib/chore-schedule";
import { getOrCreateParentEarner } from "@/lib/parent-earner";
import ChoreDataTransfer from "./data-transfer";

export default async function ChoresPage() {
  const { userId } = await auth();
  if (!userId) return null;

  await getOrCreateParentEarner(userId);
  const [choreRows, earners, bounties, timezone] = await Promise.all([
    getChoresForParent(userId),
    getEarnersForParent(userId),
    getBountiesForParent(userId),
    getHouseholdTimezone(userId),
  ]);
  const kidRows = earners.filter((e) => !e.isParent);
  const claims = await getClaimsForChores(choreRows, timezone);
  const kidNameById = new Map(kidRows.map((k) => [k.id, k.name]));
  const openBounties = bounties.filter(({ claim }) => claim?.status !== "approved");
  const doneBounties = bounties.filter(({ claim }) => claim?.status === "approved");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-800">
          🎯 Bounties
        </h2>
        {openBounties.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-amber-300 bg-white p-4 text-sm text-slate-500">
            No open bounties. Post one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {openBounties.map(({ bounty, claim }) => (
              <li key={bounty.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-medium ${bounty.active ? "" : "text-slate-400 line-through"}`}>
                      {bounty.title}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatCents(bounty.valueCents)} ·{" "}
                      {bounty.assignedKidId ? kidNameById.get(bounty.assignedKidId) ?? "unknown kid" : "anyone"}
                    </p>
                    {claim && (
                      <p className="mt-1 text-sm text-amber-700">
                        Claimed by {claim.earnerName} · awaiting approval
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <form
                      action={async () => {
                        "use server";
                        await setChoreActive(bounty.id, !bounty.active);
                      }}
                    >
                      <button type="submit" className="text-indigo-600">
                        {bounty.active ? "Pause" : "Resume"}
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await deleteChore(bounty.id);
                      }}
                    >
                      <button type="submit" className="text-red-500">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-amber-800">
            + New bounty
          </summary>
          <form action={createChore} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="isBounty" value="1" />
            <input
              name="title"
              placeholder="Bounty (e.g. Clean the garage)"
              required
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            <input
              name="value"
              type="number"
              step="0.25"
              min="0.25"
              placeholder="Value in dollars"
              required
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            <select
              name="assignedKidId"
              defaultValue="any"
              className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            >
              <option value="any">Anyone (first to do it)</option>
              {kidRows.map((kid) => (
                <option key={kid.id} value={kid.id}>
                  {kid.name} only
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white"
            >
              Post bounty
            </button>
          </form>
        </details>

        {doneBounties.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800/70">
              Completed bounties
            </h3>
            <ul className="flex flex-col gap-1">
              {doneBounties.map(({ bounty, claim }) => (
                <li
                  key={bounty.id}
                  className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-500"
                >
                  <span>
                    ✓ {bounty.title} · {claim?.earnerName}
                  </span>
                  <span className="font-medium text-slate-700">{formatCents(bounty.valueCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Chores
        </h2>
        {choreRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No chores yet. Add one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {choreRows.map((chore) => {
              const claim = claims.get(chore.id);
              const scheduledToday = isScheduledToday(chore, timezone);
              return (
                <li
                  key={chore.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`font-medium ${chore.active ? "" : "text-slate-400 line-through"}`}>
                        {chore.title}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatCents(chore.valueCents)} · {scheduleLabel(chore)} ·{" "}
                        {chore.assignedKidId ? kidNameById.get(chore.assignedKidId) ?? "unknown kid" : "anyone"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-sm">
                      <form
                        action={async () => {
                          "use server";
                          await setChoreActive(chore.id, !chore.active);
                        }}
                      >
                        <button type="submit" className="text-indigo-600">
                          {chore.active ? "Pause" : "Resume"}
                        </button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await deleteChore(chore.id);
                        }}
                      >
                        <button type="submit" className="text-red-500">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  {chore.active &&
                    (!scheduledToday ? (
                      <p className="mt-2 text-xs text-slate-400">Not scheduled today</p>
                    ) : claim ? (
                      <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        ✓ Done today by {claim.earnerName}
                        {claim.status === "pending" ? " · awaiting approval" : ""}
                      </p>
                    ) : (
                      <form action={logCompletionFor} className="mt-3 flex gap-2">
                        <input type="hidden" name="choreId" value={chore.id} />
                        <select
                          name="earnerId"
                          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        >
                          {earners.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.isParent ? `Me (${e.name})` : e.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Log done
                        </button>
                      </form>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a chore
        </h2>
        <form action={createChore} className="flex flex-col gap-3">
          <input
            name="title"
            placeholder="Chore (e.g. Take out trash)"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <input
            name="value"
            type="number"
            step="0.25"
            min="0.25"
            placeholder="Value in dollars"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <select
            name="recurrence"
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            defaultValue="once"
          >
            <option value="once">One-time</option>
            <option value="daily">Every day</option>
            <option value="weekly">Specific days</option>
          </select>
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, i) => (
              <label key={label} className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="daysOfWeek" value={i} />
                {label}
              </label>
            ))}
          </div>
          <select
            name="assignedKidId"
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
            defaultValue="any"
          >
            <option value="any">Anyone (first to do it)</option>
            {kidRows.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.name} only
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"
          >
            Add chore
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Backup &amp; restore
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Save your chore setup, or restore it after a rebuild.
        </p>
        <ChoreDataTransfer />
      </section>
    </div>
  );
}
