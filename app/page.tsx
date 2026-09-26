import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="text-center">
        <Image
          src="/goblin-hero.png"
          alt="CoinGoblin mascot holding a coin"
          width={160}
          height={160}
          priority
          className="mx-auto rounded-3xl"
        />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">CoinGoblin</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">Chores done. Coins earned.</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/kid-login"
          className="rounded-2xl bg-indigo-600 px-6 py-4 text-center text-lg font-semibold text-white shadow-sm active:scale-[0.98]"
        >
          I&apos;m a Kid
        </Link>
        <Link
          href="/sign-in"
          className="rounded-2xl border border-slate-300 bg-white px-6 py-4 text-center text-lg font-semibold text-slate-700 shadow-sm active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          Parent Sign In
        </Link>
      </div>

      <p className="max-w-xs text-center text-sm text-slate-400 dark:text-slate-500">
        New parent?{" "}
        <Link href="/sign-up" className="underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
