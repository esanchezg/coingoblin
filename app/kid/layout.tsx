import { redirect } from "next/navigation";
import { getKidSession } from "@/lib/kid-session";
import { kidLogout } from "@/lib/actions/kid";

export default async function KidLayout({ children }: { children: React.ReactNode }) {
  const session = await getKidSession();
  if (!session) redirect("/kid-login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: session.kid.color }}
          />
          <span className="font-semibold">{session.kid.name}</span>
        </div>
        <form action={kidLogout}>
          <button type="submit" className="text-sm text-slate-400">
            Log out
          </button>
        </form>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
