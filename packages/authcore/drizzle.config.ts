import { defineConfig } from "drizzle-kit";

// AuthCore HARD BOUNDARIES (see docs/adr/0002-drizzle-dual-journal-migrations.md):
// - AuthCore owns schema `authcore` — all tables live there, no others.
// - The journal table MUST be `authcore_migrations`, never the default
//   `__drizzle_migrations`. Two cores sharing the default journal have been
//   proven to collide silently: drizzle-kit prints success (exit 0) while the
//   second core's migrations never run. The schema-presence gate enforces this.
// - CommerceCore (Step 2) will get its own schema `commerce` and its own
//   journal table; neither may write to the other's journal.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["authcore"],
  migrations: {
    table: "authcore_migrations",
    schema: "drizzle",
  },
  // Connection credentials for `drizzle-kit migrate` (generate never connects).
  // The e2e runner (scripts/e2e.mjs) sets AUTHCORE_DB_URL to the ephemeral
  // scratch cluster; the placeholder keeps the config importable without env.
  dbCredentials: {
    url:
      process.env.AUTHCORE_DB_URL ??
      "postgres://authcore:placeholder@127.0.0.1:5432/placeholder",
  },
});
