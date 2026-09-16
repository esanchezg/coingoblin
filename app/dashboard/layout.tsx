import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import TimezoneSync from "./timezone-sync";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/dashboard/approvals", label: "Approve", icon: "✅" },
  { href: "/dashboard/chores", label: "Chores", icon: "🧹" },
  { href: "/dashboard/kids", label: "Kids", icon: "🧒" },
  { href: "/dashboard/payouts", label: "Payouts", icon: "💵" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TimezoneSync />
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="text-lg font-bold">🪙 CoinGoblin</span>
        <UserButton />
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-200 bg-white">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-600"
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
