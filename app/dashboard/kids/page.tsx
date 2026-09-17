import { auth } from "@clerk/nextjs/server";
import { createKid, deleteKid, resetKidPin } from "@/lib/actions/parent";
import { getKidsForParent } from "@/lib/queries";

const COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f97316", "#0ea5e9", "#a855f7"];

export default async function KidsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const kidRows = await getKidsForParent(userId);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Kids
        </h2>
        {kidRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No kid profiles yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kidRows.map((kid) => (
              <li
                key={kid.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: kid.color }} />
                    <span className="font-medium">{kid.name}</span>
                  </div>
                  <form
                    action={async () => {
                      "use server";
                      await deleteKid(kid.id);
                    }}
                  >
                    <button type="submit" className="text-sm text-red-500">
                      Remove
                    </button>
                  </form>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-indigo-600">Reset PIN</summary>
                  <form action={resetKidPin} className="mt-2 flex gap-2">
                    <input type="hidden" name="kidId" value={kid.id} />
                    <input
                      name="pin"
                      inputMode="numeric"
                      pattern="\d{4,6}"
                      placeholder="New 4-6 digit PIN"
                      required
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a kid
        </h2>
        <form action={createKid} className="flex flex-col gap-3">
          <input
            name="name"
            placeholder="Name"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            placeholder="4-6 digit PIN"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <div className="flex gap-2">
            {COLORS.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={color === COLORS[0]}
                  className="peer sr-only"
                />
                <span
                  className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2"
                  style={{ backgroundColor: color }}
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white"
          >
            Add kid
          </button>
        </form>
      </section>
    </div>
  );
}
