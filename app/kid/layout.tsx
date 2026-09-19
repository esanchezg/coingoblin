import { redirect } from "next/navigation";
import { getKidSession } from "@/lib/kid-session";
import { kidLogout } from "@/lib/actions/kid";
import ThemeToggle from "../theme-toggle";

export default async function KidLayout({ children }: { children: React.ReactNode }) {
  const session = await getKidSession();
  if (!session) redirect("/kid-login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: session.kid.color }}
          />
          <span className="font-semibold">{session.kid.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <form action={kidLogout}>
            <button type="submit" className="text-sm text-slate-400 dark:text-slate-500">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
