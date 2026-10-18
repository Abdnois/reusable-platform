import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

// AuthCore exclusively owns every object under schema `authcore`.
export const authcoreSchema = pgSchema("authcore");

/**
 * Identity anchor table. Email is the login identifier and is stored
 * normalized (trimmed + lowercased) with a unique constraint.
 */
export const users = authcoreSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Credential table — separated from identity so future auth methods
 * (passkeys, OAuth) can be added without touching the users table.
 * One credential row per user (userId is the primary key).
 */
export const credentials = authcoreSchema.table("credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Session table. Only the SHA-256 hash of the session token is stored —
 * the raw token is returned to the caller exactly once and never persisted.
 */
export const sessions = authcoreSchema.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
