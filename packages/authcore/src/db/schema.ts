import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

// AuthCore exclusively owns every object under schema `authcore`.
export const authcoreSchema = pgSchema("authcore");

/**
 * Identity anchor table. Deliberately minimal in this foundation unit —
 * registration, credential, and session tables arrive in later slices,
 * each still inside schema `authcore` and still with no cross-core
 * foreign keys (CommerceCore references subject IDs as opaque strings).
 */
export const users = authcoreSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
