"use client";

import { useState, useTransition } from "react";
import { updateChore } from "@/lib/actions/parent";
import { DAY_LABELS, parseDaysOfWeek } from "@/lib/chore-schedule";

type Kid = { id: string; name: string };
type EditableChore = {
  id: string;
  title: string;
  valueCents: number;
  recurrence: "once" | "daily" | "weekly";
  daysOfWeek: string | null;
  assignedKidId: string | null;
};

export default function EditChoreForm({
  chore,
  kidRows,
  showRecurrence,
  accent = "indigo",
}: {
  chore: EditableChore;
  kidRows: Kid[];
  showRecurrence: boolean;
  accent?: "indigo" | "amber";
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await updateChore(formData);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "ok", text: "Saved!" });
      // Leave the confirmation visible for a moment before collapsing back.
      setTimeout(() => {
        setOpen(false);
        setMessage(null);
      }, 1200);
    });
  }

  const link = accent === "amber" ? "text-amber-700 dark:text-amber-400" : "text-indigo-600 dark:text-indigo-400";
  const border = accent === "amber" ? "border-amber-300 dark:border-amber-800" : "border-slate-300 dark:border-slate-700";
  const button = accent === "amber" ? "bg-amber-600 dark:bg-amber-700" : "bg-indigo-600 dark:bg-indigo-700";

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mt-2">
      <summary className={`cursor-pointer text-sm ${link}`}>Edit</summary>
      <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-3">
        <input type="hidden" name="choreId" value={chore.id} />
        <input
          name="title"
          defaultValue={chore.title}
          required
          className={`rounded-xl border ${border} px-3 py-2 text-sm dark:bg-slate-900`}
        />
        <input
          name="value"
          type="number"
          step="0.25"
          min="0.25"
          defaultValue={chore.valueCents / 100}
          required
          className={`rounded-xl border ${border} px-3 py-2 text-sm dark:bg-slate-900`}
        />
        {showRecurrence && (
          <>
            <select
              name="recurrence"
              defaultValue={chore.recurrence}
              className={`rounded-xl border ${border} px-3 py-2 text-sm dark:bg-slate-900`}
            >
              <option value="once">One-time</option>
              <option value="daily">Every day</option>
              <option value="weekly">Specific days</option>
            </select>
            <div className="flex flex-wrap gap-2">
              {DAY_LABELS.map((label, i) => (
                <label key={label} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={i}
                    defaultChecked={parseDaysOfWeek(chore.daysOfWeek).includes(i)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}
        <select
          name="assignedKidId"
          defaultValue={chore.assignedKidId ?? "any"}
          className={`rounded-xl border ${border} px-3 py-2 text-sm dark:bg-slate-900`}
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
          disabled={isPending}
          className={`rounded-xl ${button} px-3 py-2 text-sm font-semibold text-white disabled:opacity-50`}
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {message && (
          <p
            className={`text-sm ${
              message.kind === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {message.text}
          </p>
        )}
      </form>
    </details>
  );
}
