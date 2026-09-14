# CoinGoblin

A mobile-focused chores & allowance tracker for the family.

- **Parent** signs in with email/password (Clerk) and manages kid profiles, chores, approvals, and payouts from `/dashboard`.
- **Kids** log in from any device with the family code + a PIN (no email needed) at `/kid-login`.
- Chores can be one-time, daily, or weekly, assigned to a specific kid or left open to whoever gets there first.
- Balances are tracked in-app; the parent marks payouts as settled after handing over cash.

## Stack

- Next.js (App Router) on Vercel
- Clerk for parent auth
- Neon Postgres + Drizzle ORM for data
- Custom PIN-based session cookies for kid profiles (no Clerk account needed per kid)

## Local development

```bash
npm install
npm run dev
```

Env vars are pulled from Vercel via `vercel env pull .env.local`.

## Database

```bash
npm run db:push    # push schema changes to Postgres
npm run db:studio  # browse the database
```
