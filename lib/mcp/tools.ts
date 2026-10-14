import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { chores, completions, kids } from "@/db/schema";
import {
  approveCompletion,
  createChore,
  logCompletionFor,
  markPaid,
  rejectCompletion,
  setChoreActive,
  updateChore,
} from "@/lib/actions/parent";
import { occurrenceDateFor } from "@/lib/chore-schedule";
import { runAsParent } from "@/lib/mcp-context";
import { resolveParent } from "@/lib/mcp/auth";
import { formatCents } from "@/lib/money";
import {
  getBountiesForParent,
  getChoreOccurrencesForParent,
  getChoresForParent,
  getEarnersWithBalances,
  getHouseholdTimezone,
  getKidCompletions,
  getPayoutHistory,
  getPendingCompletions,
  getUnpaidBreakdownForParent,
} from "@/lib/queries";

// Every tool runs inside runAsParent(), so the existing Server Actions see the connected parent
// as their signed-in user and enforce household scoping exactly as the web app does. Tools never
// take a parent/household id from the model.

class ToolError extends Error {}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

type Annotations = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: false };
const READ: Annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE: Annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Money leaves the books and can't be undone from here, so clients should confirm first.
const DESTRUCTIVE: Annotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kids and chores can be given by id or (case-insensitive) name, resolved within the household.
async function resolveEarner(parentUserId: string, ref: string) {
  const rows = await getDb().select().from(kids).where(eq(kids.parentUserId, parentUserId));
  const q = ref.trim().toLowerCase();
  const matches = rows.filter((k) => k.id === ref.trim() || k.name.toLowerCase() === q);
  if (matches.length === 0) throw new ToolError(`No kid or parent named "${ref}". Call get_overview to see names.`);
  if (matches.length > 1) throw new ToolError(`More than one earner matches "${ref}"; use the id from get_overview.`);
  return matches[0];
}

async function resolveChore(parentUserId: string, ref: string) {
  const rows = await getDb().select().from(chores).where(eq(chores.parentUserId, parentUserId));
  const q = ref.trim().toLowerCase();
  const matches = uuidRe.test(ref.trim())
    ? rows.filter((c) => c.id === ref.trim())
    : rows.filter((c) => c.title.toLowerCase() === q);
  if (matches.length === 0) throw new ToolError(`No chore titled "${ref}". Call list_chores to see titles.`);
  if (matches.length > 1) throw new ToolError(`More than one chore is titled "${ref}"; use the id from list_chores.`);
  return matches[0];
}

function choreForm(fields: {
  choreId?: string;
  title: string;
  valueCents: number;
  recurrence: "once" | "daily" | "weekly";
  daysOfWeek: number[];
  assignedKidId: string | null;
  noCatchUp: boolean;
  isBounty?: boolean;
}) {
  const f = new FormData();
  if (fields.choreId) f.set("choreId", fields.choreId);
  f.set("title", fields.title);
  f.set("value", String(fields.valueCents / 100));
  f.set("recurrence", fields.recurrence);
  for (const d of fields.daysOfWeek) f.append("daysOfWeek", String(d));
  f.set("assignedKidId", fields.assignedKidId ?? "any");
  if (fields.noCatchUp) f.set("noCatchUp", "1");
  if (fields.isBounty) f.set("isBounty", "1");
  return f;
}

const dayInput = z.array(z.number().int().min(0).max(6)).max(7).describe("Days of week, 0=Sunday .. 6=Saturday. Weekly chores only.");
const dollars = z.number().positive().max(10000).describe("Dollar amount, e.g. 1.5");

export function registerTools(server: McpServer) {
  function define<S extends z.ZodObject>(
    name: string,
    description: string,
    schema: S,
    annotations: Annotations,
    handler: (args: z.output<S>, parentUserId: string) => Promise<unknown>,
  ) {
    // The generic schema defeats the SDK's argument inference, so the callback is typed here instead.
    const callback = async (rawArgs: unknown, ctx: { http?: { authInfo?: Parameters<typeof resolveParent>[0] } }) => {
      const parentUserId = await resolveParent(ctx.http?.authInfo);
      const parsed = schema.safeParse(rawArgs);
      if (!parsed.success) return fail(`Invalid input: ${parsed.error.issues[0]?.message ?? "check the arguments"}`);
      if (!parentUserId) return fail("No CoinGoblin household is linked to this account. Open the CoinGoblin dashboard once while signed in, then try again.");
      try {
        return text(await runAsParent(parentUserId, () => handler(parsed.data as z.output<S>, parentUserId)));
      } catch (e) {
        if (e instanceof ToolError) return fail(e.message);
        if (e instanceof Error && ["Not found", "Assigned kid not found"].includes(e.message)) return fail(e.message);
        console.error(`[mcp] ${name} failed`, e);
        return fail("Something went wrong in CoinGoblin. Nothing further was changed by this call.");
      }
    };
    server.registerTool(name, { description, inputSchema: schema, annotations } as never, callback as never);
  }

  const money = (cents: number) => ({ cents, display: formatCents(cents) });

  // ---------- read ----------

  define("get_overview",
    "Start here. Every kid (and the parent as an earner) with the amount currently owed, the number of chores waiting for approval, and the household timezone.",
    z.object({}), READ, async (_a, parentUserId) => {
      const [earners, pending, timezone] = await Promise.all([
        getEarnersWithBalances(parentUserId),
        getPendingCompletions(parentUserId),
        getHouseholdTimezone(parentUserId),
      ]);
      return {
        timezone,
        pendingApprovals: pending.length,
        earners: earners.map((e) => ({ id: e.id, name: e.name, isParent: e.isParent, owed: money(e.balanceCents) })),
      };
    });

  define("list_pending_approvals",
    "Chores claimed by kids that are waiting for the parent to approve or reject. Use the completionId with approve_completions / reject_completions.",
    z.object({}), READ, async (_a, parentUserId) => {
      const [pending, timezone] = await Promise.all([getPendingCompletions(parentUserId), getHouseholdTimezone(parentUserId)]);
      return pending.map((p) => ({
        completionId: p.id,
        kid: p.kidName,
        chore: p.choreTitle,
        isBounty: p.isBounty,
        value: money(p.valueCents),
        claimedAt: p.completedAt.toLocaleString("en-US", { timeZone: timezone }),
      }));
    });

  define("get_balance_breakdown",
    "What each kid's owed balance is made of: approved chores claimed since their last payout, plus any carried-over (or paid-ahead) remainder. Omit kid for everyone.",
    z.object({ kid: z.string().optional().describe("Kid name or id.") }), READ, async ({ kid }, parentUserId) => {
      const [earners, breakdowns, timezone] = await Promise.all([
        getEarnersWithBalances(parentUserId),
        getUnpaidBreakdownForParent(parentUserId),
        getHouseholdTimezone(parentUserId),
      ]);
      const wanted = kid ? (await resolveEarner(parentUserId, kid)).id : null;
      return earners
        .filter((e) => !e.isParent && (!wanted || e.id === wanted))
        .map((e) => {
          const items = breakdowns.get(e.id) ?? [];
          const listed = items.reduce((sum, i) => sum + i.valueCents, 0);
          return {
            kid: e.name,
            owed: money(e.balanceCents),
            carriedOver: money(e.balanceCents - listed),
            chores: items.map((i) => ({
              chore: i.choreTitle,
              isBounty: i.isBounty,
              value: money(i.valueCents),
              claimedAt: i.completedAt.toLocaleString("en-US", { timeZone: timezone }),
            })),
          };
        });
    });

  define("list_chores",
    "Recurring/one-time chores with this week's slots (who did each day, and whether it's still open), plus bounties. Use ids from here with the chore-editing tools.",
    z.object({}), READ, async (_a, parentUserId) => {
      const [choreRows, occurrences, bounties, earners] = await Promise.all([
        getChoresForParent(parentUserId),
        getChoreOccurrencesForParent(parentUserId),
        getBountiesForParent(parentUserId),
        getEarnersWithBalances(parentUserId),
      ]);
      const nameById = new Map(earners.map((e) => [e.id, e.name]));
      const describe = (c: (typeof choreRows)[number]) => ({
        id: c.id,
        title: c.title,
        value: money(c.valueCents),
        recurrence: c.recurrence,
        daysOfWeek: c.daysOfWeek,
        assignedTo: c.assignedKidId ? nameById.get(c.assignedKidId) ?? "unknown kid" : "anyone",
        active: c.active,
        allowCatchUp: c.allowCatchUp,
      });
      return {
        chores: choreRows.map((c) => ({
          ...describe(c),
          thisWeek: occurrences
            .filter((o) => o.chore.id === c.id)
            .map((o) => ({
              date: o.occurrenceDate,
              doneBy: o.claim?.earnerName ?? null,
              status: o.claim?.status ?? "open",
            })),
        })),
        bounties: bounties.map(({ bounty, claim }) => ({
          ...describe(bounty),
          claimedBy: claim?.earnerName ?? null,
          claimStatus: claim?.status ?? "open",
        })),
      };
    });

  define("get_kid_history",
    "A kid's most recent chore completions (any status: pending, approved, rejected).",
    z.object({ kid: z.string().describe("Kid name or id.") }), READ, async ({ kid }, parentUserId) => {
      const earner = await resolveEarner(parentUserId, kid);
      const rows = await getKidCompletions(earner.id);
      return rows.map((r) => ({
        chore: r.choreTitle,
        status: r.status,
        value: money(r.valueCents),
        isBounty: r.isBounty,
        claimedAt: r.completedAt.toISOString(),
      }));
    });

  define("list_payouts",
    "Payout history across all kids, newest first.",
    z.object({}), READ, async (_a, parentUserId) => {
      const history = await getPayoutHistory(parentUserId);
      return history.map((p) => ({ kid: p.kidName, amount: money(p.amountCents), note: p.note, paidAt: p.createdAt.toISOString() }));
    });

  // ---------- write ----------

  async function reviewAll(ids: string[], parentUserId: string, action: (id: string) => Promise<void>) {
    // Only act on completions that are still pending, so a stale id can't flip an already-reviewed one.
    const pending = new Set((await getPendingCompletions(parentUserId)).map((p) => p.id));
    const done: string[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      if (!pending.has(id)) {
        skipped.push(id);
        continue;
      }
      await action(id);
      done.push(id);
    }
    return { done: done.length, skippedNotPending: skipped };
  }

  const idList = z.array(z.uuid()).min(1).max(50).describe("completionId values from list_pending_approvals.");

  define("approve_completions",
    "Approve pending chore claims; the value is added to the kid's balance. Ids that are no longer pending are skipped.",
    z.object({ completionIds: idList }), WRITE, ({ completionIds }, parentUserId) =>
      reviewAll(completionIds, parentUserId, approveCompletion));

  define("reject_completions",
    "Reject pending chore claims; nothing is added to the balance and the slot becomes claimable again. Ids that are no longer pending are skipped.",
    z.object({ completionIds: idList }), WRITE, ({ completionIds }, parentUserId) =>
      reviewAll(completionIds, parentUserId, rejectCompletion));

  define("log_chore_done",
    "Record a chore as done by a kid (or the parent), auto-approved, adding its current value to their balance. Only days in the current week are allowed. Fails if that day is already claimed.",
    z.object({
      chore: z.string().describe("Chore title or id (not a bounty)."),
      earner: z.string().describe("Kid name or id; use the parent's own name to credit the parent."),
      date: z.iso.date().optional().describe("YYYY-MM-DD the chore was for. Defaults to today in the household timezone; ignored for one-time chores."),
    }), WRITE, async ({ chore, earner, date }, parentUserId) => {
      const [c, e, timezone] = await Promise.all([
        resolveChore(parentUserId, chore),
        resolveEarner(parentUserId, earner),
        getHouseholdTimezone(parentUserId),
      ]);
      const occurrenceDate = c.recurrence === "once" ? occurrenceDateFor(c, timezone) : date ?? occurrenceDateFor(c, timezone);
      const existing = await getDb()
        .select({ status: completions.status, kidId: completions.kidId })
        .from(completions)
        .where(and(eq(completions.choreId, c.id), eq(completions.occurrenceDate, occurrenceDate)));
      if (existing.some((x) => x.status !== "rejected")) throw new ToolError("That chore is already claimed for that day.");
      const f = new FormData();
      f.set("choreId", c.id);
      f.set("earnerId", e.id);
      f.set("occurrenceDate", occurrenceDate);
      try {
        await logCompletionFor(f);
      } catch (err) {
        if (err instanceof Error && err.message.includes("isn't part of this week")) throw new ToolError(err.message);
        throw err;
      }
      return { logged: c.title, for: e.name, date: occurrenceDate, value: money(c.valueCents) };
    });

  define("record_payout",
    "Record that the parent paid a kid cash. Reduces what's owed by that amount. Only call this after the parent has told you the kid and amount.",
    z.object({
      kid: z.string().describe("Kid name or id."),
      amount: dollars,
      note: z.string().max(200).optional(),
    }), DESTRUCTIVE, async ({ kid, amount, note }, parentUserId) => {
      const earner = await resolveEarner(parentUserId, kid);
      if (earner.isParent) throw new ToolError("Payouts are for kids, not the parent.");
      const f = new FormData();
      f.set("kidId", earner.id);
      f.set("amount", String(amount));
      if (note) f.set("note", note);
      await markPaid(f);
      const [after] = (await getEarnersWithBalances(parentUserId)).filter((x) => x.id === earner.id);
      return { paid: earner.name, amount: money(Math.round(amount * 100)), nowOwed: money(after?.balanceCents ?? 0) };
    });

  const assignee = z.string().nullable().optional().describe('Kid name or id; "anyone" or null for an open chore.');
  const resolveAssignee = async (parentUserId: string, ref: string | null | undefined) => {
    if (ref === undefined) return undefined;
    if (ref === null || ref.trim().toLowerCase() === "anyone") return null;
    const e = await resolveEarner(parentUserId, ref);
    return e.id;
  };

  define("create_chore",
    "Add a chore, or a bounty (one-time job, first to claim it). Value is in dollars.",
    z.object({
      title: z.string().min(1).max(200),
      value: dollars,
      recurrence: z.enum(["once", "daily", "weekly"]).default("once").describe("Ignored for bounties (always once)."),
      daysOfWeek: dayInput.optional(),
      assignedTo: assignee,
      noCatchUp: z.boolean().optional().describe("True = must be done the same day, no makeup window."),
      isBounty: z.boolean().optional(),
    }), WRITE, async (a, parentUserId) => {
      if (a.recurrence === "weekly" && !a.daysOfWeek?.length && !a.isBounty) throw new ToolError("Weekly chores need daysOfWeek.");
      const assignedKidId = (await resolveAssignee(parentUserId, a.assignedTo)) ?? null;
      await createChore(choreForm({
        title: a.title,
        valueCents: Math.round(a.value * 100),
        recurrence: a.recurrence,
        daysOfWeek: a.daysOfWeek ?? [],
        assignedKidId,
        noCatchUp: a.noCatchUp ?? false,
        isBounty: a.isBounty,
      }));
      return { created: a.title, value: money(Math.round(a.value * 100)) };
    });

  define("update_chore",
    "Change a chore's title, value, assignee, schedule or catch-up rule. Only the fields you pass change. Past completions keep the value they were earned at.",
    z.object({
      chore: z.string().describe("Chore title or id."),
      title: z.string().min(1).max(200).optional(),
      value: dollars.optional(),
      recurrence: z.enum(["once", "daily", "weekly"]).optional(),
      daysOfWeek: dayInput.optional(),
      assignedTo: assignee,
      noCatchUp: z.boolean().optional(),
    }), WRITE, async (a, parentUserId) => {
      const c = await resolveChore(parentUserId, a.chore);
      const assignedKidId = (await resolveAssignee(parentUserId, a.assignedTo)) ?? (a.assignedTo === undefined ? c.assignedKidId : null);
      const recurrence = a.recurrence ?? c.recurrence;
      const daysOfWeek = a.daysOfWeek ?? (c.daysOfWeek ? c.daysOfWeek.split(",").map(Number) : []);
      if (recurrence === "weekly" && daysOfWeek.length === 0) throw new ToolError("Weekly chores need daysOfWeek.");
      const result = await updateChore(choreForm({
        choreId: c.id,
        title: a.title ?? c.title,
        valueCents: a.value !== undefined ? Math.round(a.value * 100) : c.valueCents,
        recurrence,
        daysOfWeek,
        assignedKidId,
        noCatchUp: a.noCatchUp ?? !c.allowCatchUp,
      }));
      if (!result.ok) throw new ToolError(result.error);
      return { updated: a.title ?? c.title };
    });

  define("set_chore_active",
    "Pause (active=false) or resume (active=true) a chore or bounty. Paused chores vanish from kids' lists but keep their history.",
    z.object({ chore: z.string().describe("Chore title or id."), active: z.boolean() }), WRITE, async ({ chore, active }, parentUserId) => {
      const c = await resolveChore(parentUserId, chore);
      await setChoreActive(c.id, active);
      return { chore: c.title, active };
    });
}
