import { auth } from "@clerk/nextjs/server";
import { createChore, deleteChore, setChoreActive } from "@/lib/actions/parent";
import { formatCents } from "@/lib/money";
import { getChoresForParent, getKidsForParent } from "@/lib/queries";
import { DAY_LABELS, parseDaysOfWeek } from "@/lib/chore-schedule";

export default async function ChoresPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [choreRows, kidRows] = await Promise.all([
    getChoresForParent(userId),
    getKidsForParent(userId),
  ]);
  const kidNameById = new Map(kidRows.map((k) => [k.id, k.name]));

  return (
    <div className="flex flex-col gap-6">
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
            {choreRows.map((chore) => (
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
                      {formatCents(chore.valueCents)} ·{" "}
                      {chore.recurrence === "weekly"
                        ? parseDaysOfWeek(chore.daysOfWeek)
                            .map((d) => DAY_LABELS[d])
                            .join(", ") || "weekly"
                        : chore.recurrence}{" "}
                      · {chore.assignedKidId ? kidNameById.get(chore.assignedKidId) ?? "unknown kid" : "anyone"}
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
              </li>
            ))}
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
    </div>
  );
}
