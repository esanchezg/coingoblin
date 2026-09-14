import { auth } from "@clerk/nextjs/server";
import { approveCompletion, rejectCompletion } from "@/lib/actions/parent";
import { formatCents } from "@/lib/money";
import { getPendingCompletions } from "@/lib/queries";

export default async function ApprovalsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const pending = await getPendingCompletions(userId);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Pending approvals
      </h2>

      {pending.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Nothing to review right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((item) => (
            <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.choreTitle}</p>
                  <p className="text-sm text-slate-500">
                    {item.kidName} · {formatCents(item.valueCents)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <form
                  action={async () => {
                    "use server";
                    await approveCompletion(item.id);
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white"
                  >
                    Approve
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await rejectCompletion(item.id);
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-600"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
