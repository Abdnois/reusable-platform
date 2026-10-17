# ADR 0008 — Workspace skeleton, pinned toolchain, and the migration-safety gate

**Status:** Accepted (implemented in commits `20e447f6b4c0acd2af9051e9a3579bd753030407` and `9b32032db044e31bec75aa1a6f114c7bf8e3b597`, both observed and pushed)

## Context

Step 1 begins. The proof project validated drizzle-toolkit behaviour outside the repo;
this ADR records the first in-repo foundation and the decisions it made.

## Decision

**Workspace:** pnpm workspaces (`packages/*`, `apps/*`); root `package.json` is private,
pins `packageManager: pnpm@10.34.7` and `engines.node: >=24 <25`. Base `tsconfig.base.json`
is strict (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext) with
`skipLibCheck: true` and documented reasoning: first-party code stays fully checked;
drizzle-orm 0.45.x's prebuilt `.d.ts` emit internal errors under typescript 5.9 and do not
need re-checking.

**Pinned versions (exact, no ranges; proven end-to-end in the disposable proof):**

| Package | Version | Why |
|---|---|---|
| drizzle-orm | `0.45.4` | current stable line; v1 RC explicitly rejected (ADR 0001/0002) |
| drizzle-kit | `0.31.11` | same line; supports per-core `migrations.table` journal overrides |
| pg | `8.23.1` | PostgreSQL driver; exact-pinned |
| typescript | `5.9.3` | current 5.x stable from the registry |
| @types/node | `24.19.2` | matches the Node 24 line |
| @types/pg | `8.23.1` | matches the driver |
| pnpm | `10.34.7` | latest 10.x from the registry |

**AuthCore owns:** schema `authcore`, journal table `authcore_migrations` (metadata
schema `drizzle`), migrations output `packages/authcore/drizzle` (committed). Schema file
declares `pgSchema("authcore")`; the initial migration (`0000_*`) creates the
schema-qualified `authcore.users` table with zero foreign keys.

**Migration-safety gate (`pnpm gate:authcore`):**

- Asserts, without trusting drizzle-kit exit codes: journal override present and not the
  default `__drizzle_migrations`, journal name prefixed `authcore_`, metadata schema is
  `drizzle`, `schemaFilter` exactly `["authcore"]`, `out` inside AuthCore, schema file
  exists and declares `pgSchema("authcore")`, generated journal entries point at existing
  `.sql` files, and no runtime import of another core.
- Adds an **import-parity probe**: the real `drizzle.config.ts` is imported and compared
  against the text-extracted values, so the validator's parsing cannot silently drift.
- **Database presence** is strictly opt-in via `AUTHCORE_GATE_DB_URL` (a dedicated scratch
  database); the check runs **read-only SELECTs** and reports `PENDING` when unset — it is
  never claimed as passing. No DB-dependent test was executed in this unit (no DB was
  started, per the task constraints).
- Negative cases are tested with isolated temp-dir fixtures: missing override, forbidden
  default table, foreign journal prefix, foreign `schemaFilter`, out-dir pointing at
  another package, missing schema file, empty/ghost-entry journal, cross-core import,
  unreadable config, plus a full real-package integration test. **16/16 tests pass.**

**Test tooling:** Node's built-in `node:test` runner with Node 24's native TypeScript
type-stripping (verified on v24.22.0 before adopting). No extra test dependency; a
heavier runner (e.g. vitest) can replace it later if needed without API impact.

## Consequences

- Every future core/feature slice must keep `pnpm gate:authcore` and `pnpm -r test`
  green before commits, per the git-workflow rules.
- CommerceCore (Step 2) must be added the same way: own schema, own `commerce_migrations`
  journal, own out dir, and its own gate checks reusing these check functions.
- The database-presence part of the gate must first run as soon as a disposable
  *development* (not the historical proof) database is available.
