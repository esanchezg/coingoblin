import Image from "next/image";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { acceptInvite } from "@/lib/actions/family";
import { findOpenInvite } from "@/lib/queries";

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error } = await searchParams;
  const { userId } = await auth();
  const invite = await findOpenInvite(token);
  const firstName = userId ? ((await currentUser())?.firstName ?? "") : "";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Image src="/goblin-hero.png" alt="" width={96} height={96} className="rounded-2xl" />
      {!invite ? (
        <>
          <h1 className="text-2xl font-bold">Invite not found</h1>
          <p className="text-slate-500 dark:text-slate-400">
            This invite link is invalid, expired or already used. Ask for a new one.
          </p>
        </>
      ) : !userId ? (
        <>
          <h1 className="text-2xl font-bold">You&apos;re invited!</h1>
          <p className="text-slate-500 dark:text-slate-400">Sign in or create an account to join the family as a parent.</p>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`}
            className="w-full rounded-2xl bg-indigo-600 px-6 py-4 text-lg font-semibold text-white"
          >
            Sign in / Sign up
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Join the family</h1>
          <form action={acceptInvite} className="flex w-full flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <input
              name="name"
              defaultValue={firstName}
              placeholder="Your name"
              required
              className="rounded-xl border border-slate-300 px-4 py-3 text-base dark:border-slate-700 dark:bg-slate-900"
            />
            {typeof error === "string" && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">
              Join
            </button>
          </form>
        </>
      )}
    </main>
  );
}
