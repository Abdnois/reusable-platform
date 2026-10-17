# ADR 0001 — Multicore platform stack

**Status:** Accepted (owner-approved across planning sessions)

## Context

A reusable-platform monorepo will ship two cores (AuthCore, CommerceCore), an API
composition root, and per-customer Next.js frontends. Deployments are Docker containers
on a conventional VPS or managed container host.

## Decision (v1-mandatory)

- **TypeScript** on **Node.js 24 LTS**.
- **pnpm workspaces** monorepo.
- **Fastify** for the API composition root.
- **PostgreSQL** persistence; **Drizzle** ORM + Kit for queries and schema/migrations,
  **stable release line only** (the drizzle v1 RC is explicitly rejected; exact versions
  are pinned at implementation start — 0.45.4/0.31.11 were the stable pair at proof time).
- **Database-backed, revocable sessions** — no cookie-only sessions.
- **One PostgreSQL database per customer**, with per-core schemas.
- **Docker** per-customer containers; no multi-tenant SaaS runtime.

## Consequences

- pnpm pinning and `pnpm-workspace.yaml` become part of the trust boundary; lockfile is committed.
- Session revocation, presence-gating of migrations, and schema-owner separation
  (ADR 0002) ride directly on this stack.
- The corresponding Docker image needs the toolchain (incl. the Argon2 binary story in ADR 0003).
