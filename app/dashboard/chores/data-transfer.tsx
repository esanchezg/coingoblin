"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { exportBalances, exportChores, importChores } from "@/lib/actions/parent";

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ChoreDataTransfer() {
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleExportChores() {
    setMessage(null);
    startTransition(async () => {
      const data = await exportChores();
      download(`coingoblin-chores-${todayIso()}.json`, data);
    });
  }

  function handleExportBalances() {
    setMessage(null);
    startTransition(async () => {
      const data = await exportBalances();
      download(`coingoblin-balances-${todayIso()}.json`, data);
    });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("Replace ALL current chores with this file? This can't be undone.")) return;

    setMessage(null);
    startTransition(async () => {
      const text = await file.text();
      const result = await importChores(text);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      const unmatched = result.unmatchedNames.length
        ? ` Couldn't match: ${result.unmatchedNames.join(", ")} — set to "anyone".`
        : "";
      setMessage({ kind: "ok", text: `Imported ${result.imported} chore(s).${unmatched}` });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleExportChores}
          disabled={isPending}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          Export chores
        </button>
        <button
          type="button"
          onClick={handleExportBalances}
          disabled={isPending}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          Export balances
        </button>
      </div>

      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        Importing deletes every current chore and replaces it with the file&apos;s contents.
        Export your balances first if you owe your kids money — that record isn&apos;t restored
        by an import.
      </p>
      <label className="rounded-xl border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {isPending ? "Working…" : "Import chores"}
        <input
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          disabled={isPending}
          className="hidden"
        />
      </label>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
