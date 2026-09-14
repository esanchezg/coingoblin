import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { kidSessions, kids } from "@/db/schema";

const COOKIE_NAME = "kid_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export async function createKidSession(kidId: string, parentUserId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const db = getDb();
  await db.insert(kidSessions).values({ token, kidId, parentUserId, expiresAt });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getKidSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const [session] = await db
    .select()
    .from(kidSessions)
    .where(eq(kidSessions.token, token))
    .limit(1);
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  const [kid] = await db.select().from(kids).where(eq(kids.id, session.kidId)).limit(1);
  if (!kid) return null;

  return { kid, parentUserId: session.parentUserId };
}

export async function clearKidSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const db = getDb();
    await db.delete(kidSessions).where(eq(kidSessions.token, token));
  }
  store.delete(COOKIE_NAME);
}
