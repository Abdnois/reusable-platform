# Development setup

> No application code exists yet, so no project dependencies are installed today.
> This file records the required toolchain and, separately, what is **already**
> installed on the current dev machine. Nothing here implies Step-1 code may start
> without approval.

## Required toolchain (target machines)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS (v24.22.0 proven installable) | exact minor is pinned at Step-1 start |
| pnpm | 10.x | workspace manager; lockfile committed |
| PostgreSQL | 17.x (17.11 proven) | one cluster locally in dev; one per customer in prod |
| Docker | any current | needed for container verification (ADR 0003); not available on the current dev machine yet |
| Git | any current | full (non-shallow) clone preferred — history is checked in the recovery ritual |

## Current dev machine (2026-10-17) [Verified]

A **portable, no-admin, not-on-PATH** toolchain already exists at
`C:\Users\Abid\proof-toolchain\` and is **usable** (Node v24.22.0, PostgreSQL 17.11
binaries, stopped data cluster, disposable proof project). See `handoff.md` §5.
It is **machine-local, untracked, and replaceable** — see
[recovery.md](recovery.md) for exact rebuild steps on any new Windows install.

## Local database (pattern to use in Step 1 and later)

- One dev database per feature work; **schema per core** (`authcore`, `commerce`).
- Sensitive values live in `.env` — **never** committed; `.env.example` stays inert and
  realistic-but-fake (see [`.env.example`](../../.env.example)).
- Schema-per-core migrations use per-core `drizzle.config.ts` with distinct
  `migrations.table` journals and a migration-orchestrator script (details: ADR 0002);
  the **presence gate** must run and be green before any feature slice is claimed done.

## Project-internal commands

**Working today** (all executed with observed output as of 2026-10-17):

```
pnpm install                # install all workspace deps from the committed lockfile
pnpm -r typecheck           # strict TS in all packages (currently: authcore)
pnpm -r test                # run every package's tests (currently: 16 gate tests)
pnpm gate:authcore          # AuthCore migration-safety gate (config + artifacts; DB-presence = PENDING w/o AUTHCORE_GATE_DB_URL)
pnpm --filter @platform/authcore generate     # regenerate migrations after schema edits (no DB needed)
```

**Still future** (created with their slices; do not pretend they exist):

```
pnpm migrate:apply          # orchestrator over ALL core migrations — Step 4 slice
pnpm gate:schemas           # cross-core presence gate over every core — Step 4 slice
pnpm dev / pnpm build       # API + storefront runtime — Steps 3/5
```

The AuthCore package itself has `pnpm --filter @platform/authcore migrate` (drizzle-kit
migrate against AUTHCORE_DATABASE_URL) — it exists as a script but has **not** been
executed against any database yet, so treat it as unproven until first run in a slice
that provisions a disposable dev database. Do not run it against the historical proof
cluster.
