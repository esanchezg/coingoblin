import Link from "next/link";
import { headers } from "next/headers";
import { currentParent } from "@/lib/current-parent";
import { createInvite, setParentAccess } from "@/lib/actions/family";
import { createKid, deleteKid, resetKidPin } from "@/lib/actions/parent";
import { getKidsForParent, getParentsForHousehold } from "@/lib/queries";

const COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f97316", "#0ea5e9", "#a855f7"];

export default async function KidsPage({ searchParams }: PageProps<"/dashboard/kids">) {
  const parent = await currentParent();
  if (!parent) return null;
  const { householdId } = parent;

  const [kidRows, parentRows] = await Promise.all([
    getKidsForParent(householdId),
    getParentsForHousehold(householdId),
  ]);

  // Set by createInvite, which redirects here with the new token so it can be shown once.
  const { invite } = await searchParams;
  let inviteLink: string | null = null;
  if (typeof invite === "string" && /^[0-9a-f]{64}$/.test(invite)) {
    const h = await headers();
    inviteLink = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/invite/${invite}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Kids
        </h2>
        {kidRows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No kid profiles yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {kidRows.map((kid) => (
              <li
                key={kid.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: kid.color }} />
                    <span className="font-medium">{kid.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/kids/${kid.id}`}
                      className="text-sm text-indigo-600 dark:text-indigo-400"
                    >
                      View
                    </Link>
                    <form
                      action={async () => {
                        "use server";
                        await deleteKid(kid.id);
                      }}
                    >
                      <button type="submit" className="text-sm text-red-500 dark:text-red-400">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400">Reset PIN</summary>
                  <form action={resetKidPin} className="mt-2 flex gap-2">
                    <input type="hidden" name="kidId" value={kid.id} />
                    <input
                      name="pin"
                      inputMode="numeric"
                      pattern="\d{4,6}"
                      placeholder="New 4-6 digit PIN"
                      required
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
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

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Parents
        </h2>
        <ul className="flex flex-col gap-2">
          {parentRows.map((p) => {
            const isMe = p.id === parent.earnerId;
            // The creator's Clerk id is the household id (null until their row is claimed).
            const isCreator = p.clerkUserId === null || p.clerkUserId === householdId;
            const disabled = p.disabledAt !== null;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className={`font-medium ${disabled ? "text-slate-400 line-through dark:text-slate-500" : ""}`}>
                  {p.name}
                  {isMe && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">(you)</span>}
                </span>
                {!isMe && !isCreator && (
                  <form action={setParentAccess}>
                    <input type="hidden" name="earnerId" value={p.id} />
                    <input type="hidden" name="disabled" value={disabled ? "0" : "1"} />
                    <button
                      type="submit"
                      className={`text-sm ${disabled ? "text-indigo-600 dark:text-indigo-400" : "text-red-500 dark:text-red-400"}`}
                    >
                      {disabled ? "Turn access on" : "Turn access off"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Invite another parent with a one-time link. It works once and expires in 7 days.
          </p>
          {inviteLink && (
            <input
              readOnly
              value={inviteLink}
              className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          )}
          <form action={createInvite}>
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
              {inviteLink ? "Make a new link" : "Make invite link"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Add a kid
        </h2>
        <form action={createKid} className="flex flex-col gap-3">
          <input
            name="name"
            placeholder="Name"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4,6}"
            placeholder="4-6 digit PIN"
            required
            className="rounded-xl border border-slate-300 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-900"
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
                  className="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 dark:ring-offset-slate-950"
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
