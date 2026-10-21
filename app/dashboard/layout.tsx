import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentParent } from "@/lib/current-parent";
import TimezoneSync from "./timezone-sync";
import ThemeToggle from "../theme-toggle";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/dashboard/approvals", label: "Approve", icon: "✅" },
  { href: "/dashboard/chores", label: "Chores", icon: "🧹" },
  { href: "/dashboard/kids", label: "Kids", icon: "🧒" },
  { href: "/dashboard/payouts", label: "Payouts", icon: "💵" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Only null for a signed-in parent whose access another parent turned off (the route requires sign-in).
  const parent = await currentParent();
  return (
    <div className="flex min-h-screen flex-col">
      <TimezoneSync />
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <span className="flex items-center gap-2 text-lg font-bold">
          <Image src="/goblin-hero.png" alt="" width={28} height={28} className="rounded-md" />
          CoinGoblin
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        {parent ? (
          children
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Your access to this family has been turned off. Ask another parent to turn it back on.
          </p>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-600 dark:text-slate-400"
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
