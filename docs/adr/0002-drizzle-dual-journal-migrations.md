# ADR 0002 — Drizzle migrations: per-core schemas and per-core journals

**Status:** Accepted — validated by the disposable proof (19/19 assertions PASS) [Recorded]

## Context

Two cores own distinct schemas in one customer database. Drizzle Kit's **default**
journal is a single table (`__drizzle_migrations` in schema `drizzle`); two cores
sharing it produced — in a controlled negative test — a silent skip: `drizzle-kit
migrate` prints success and exits 0 while the second core's tables are never created.

## Decision

- Declared schemas via `pgSchema` (e.g. `authcore`, `commerce`) with compact table definitions only in each package's schema file.
- **Every package with migrations gets its own `drizzle.config.ts`**, including:
  - `schemaFilter` naming its own schema(s);
  - `migrations.schema` (default/override per docs) and **`migrations.table` set distinctly per core** (e.g. `authcore_migrations`, `commerce_migrations`), so journals can never collide;
  - separate `out:` migration directories per core package.
- A single orchestrator (script) applies core migrations in a **declared order** (authcore first by default; reverse order was also proven to work).
- **Presence gate (mandatory before substantial development):** after migrating a fresh
  database, assert each core's schema, its expected tables, and its journal table with
  **exactly its own core's entries** exists. Exit codes are NOT a sufficient signal — the
  negative control proved a green exit can mean "nothing happened".
- **No cross-core foreign keys:** CommerceCore stores AuthCore subject IDs as opaque
  strings; FKs exist only within a core's own schema (proven count: 0 cross-schema FKs).

## Consequences

- Per-core migration independence proven: adding a second authcore migration left commerce's journal untouched; AuthCore migrates cleanly into a fully fresh database.
- The gate becomes a merge-blocking CI job as soon as the workspace exists.
