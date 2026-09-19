"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { lookupHouseholdByCode, verifyKidPinAndLogin } from "@/lib/actions/kid";

type KidOption = { id: string; name: string; color: string };

export default function KidLoginForm() {
  const [step, setStep] = useState<"code" | "pick" | "pin">("code");
  const [code, setCode] = useState("");
  const [kids, setKids] = useState<KidOption[]>([]);
  const [parentUserId, setParentUserId] = useState("");
  const [selectedKid, setSelectedKid] = useState<KidOption | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await lookupHouseholdByCode(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.kids.length === 0) {
        setError("No kid profiles set up yet — ask your parent to add one.");
        return;
      }
      setKids(result.kids);
      setParentUserId(result.parentUserId);
      setStep("pick");
    });
  }

  function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKid) return;
    setError("");
    startTransition(async () => {
      const result = await verifyKidPinAndLogin(selectedKid.id, parentUserId, pin);
      if (result && !result.ok) {
        setError(result.error);
        setPin("");
      }
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="text-4xl">👺</div>

      {step === "code" && (
        <form onSubmit={submitCode} className="flex w-full max-w-xs flex-col gap-3">
          <label className="text-center text-sm text-slate-500 dark:text-slate-400">
            Enter your family code
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            required
            autoFocus
            className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl tracking-[0.3em] dark:border-slate-700 dark:bg-slate-900"
          />
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            Continue
          </button>
        </form>
      )}

      {step === "pick" && (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">Who are you?</p>
          {kids.map((kid) => (
            <button
              key={kid.id}
              onClick={() => {
                setSelectedKid(kid);
                setStep("pin");
                setError("");
              }}
              className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-4 text-left text-lg font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: kid.color }} />
              {kid.name}
            </button>
          ))}
        </div>
      )}

      {step === "pin" && selectedKid && (
        <form onSubmit={submitPin} className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Enter {selectedKid.name}&apos;s PIN
          </p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            type="password"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
            className="rounded-xl border border-slate-300 px-4 py-4 text-center text-2xl tracking-[0.3em] dark:border-slate-700 dark:bg-slate-900"
          />
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setStep("pick")}
            className="text-sm text-slate-400 dark:text-slate-500"
          >
            ← back
          </button>
        </form>
      )}

      <Link href="/" className="text-sm text-slate-400 dark:text-slate-500">
        ← home
      </Link>
    </main>
  );
}
