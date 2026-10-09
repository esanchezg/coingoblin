"use client";

import { useEffect, useRef } from "react";

const TONES = {
  slate: "text-slate-700 dark:text-slate-200",
  amber: "text-amber-900 dark:text-amber-200",
  sky: "text-sky-900 dark:text-sky-200",
};

// Native <details> so sections work before hydration and keep their content
// (and any half-filled form) mounted while collapsed. Collapsed state is
// remembered per device in localStorage; every section starts open.
export default function CollapsibleSection({
  id,
  title,
  tone = "slate",
  className,
  children,
}: {
  id: string;
  title: React.ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const storageKey = `section-collapsed:${id}`;

  useEffect(() => {
    try {
      if (ref.current && localStorage.getItem(storageKey) === "1") ref.current.open = false;
    } catch {
      // storage unavailable (private mode etc.), stay open
    }
  }, [storageKey]);

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    try {
      if (e.currentTarget.open) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  }

  return (
    <details ref={ref} open onToggle={handleToggle} className={`group ${className ?? ""}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 select-none [&::-webkit-details-marker]:hidden">
        <h2 className={`text-base font-bold uppercase tracking-wide ${TONES[tone]}`}>{title}</h2>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 transition-transform group-open:rotate-180 ${TONES[tone]}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
