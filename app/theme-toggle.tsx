"use client";

import { useTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "🖥️" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors ${
            theme === option.value
              ? "bg-white shadow-sm dark:bg-slate-600"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
