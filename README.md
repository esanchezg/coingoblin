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

## Claude connector (MCP)

`/api/mcp` is a remote MCP server so you can ask about balances and manage chores from the Claude app. Clerk is the OAuth server; a connection acts as the parent who signed in (`lib/mcp/auth.ts`).

Setup: in the Clerk dashboard enable **OAuth applications → Dynamic client registration**, then in Claude add a custom connector pointing at `https://<your domain>/api/mcp` and sign in as the parent.

Tools: `get_overview`, `list_pending_approvals`, `get_balance_breakdown`, `list_chores`, `get_kid_history`, `list_payouts` (read); `approve_completions`, `reject_completions`, `log_chore_done`, `record_payout`, `create_chore`, `update_chore`, `set_chore_active` (write). Writes reuse the dashboard's Server Actions (`lib/actions/parent.ts`), so the same ownership checks apply. There is no delete tool; pause a chore instead.

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
