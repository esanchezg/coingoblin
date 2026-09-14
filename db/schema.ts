import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const households = pgTable("households", {
  parentUserId: text("parent_user_id").primaryKey(),
  familyCode: text("family_code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kids = pgTable("kids", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentUserId: text("parent_user_id").notNull(),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chores = pgTable("chores", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentUserId: text("parent_user_id").notNull(),
  title: text("title").notNull(),
  valueCents: integer("value_cents").notNull(),
  recurrence: text("recurrence", { enum: ["once", "daily", "weekly"] })
    .notNull()
    .default("once"),
  // Comma-separated day-of-week ints (0=Sun .. 6=Sat), only set when recurrence = "weekly"
  daysOfWeek: text("days_of_week"),
  // null = open to any kid in the household (first to complete claims it)
  assignedKidId: uuid("assigned_kid_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const completions = pgTable(
  "completions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    choreId: uuid("chore_id").notNull(),
    kidId: uuid("kid_id").notNull(),
    // The date (YYYY-MM-DD) this occurrence is for. Fixed sentinel for "once" chores
    // so the unique index below caps them at a single completion ever.
    occurrenceDate: text("occurrence_date").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (t) => [uniqueIndex("completions_chore_occurrence_unique").on(t.choreId, t.occurrenceDate)],
);

export const payouts = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  kidId: uuid("kid_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kidSessions = pgTable("kid_sessions", {
  token: text("token").primaryKey(),
  kidId: uuid("kid_id").notNull(),
  parentUserId: text("parent_user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
