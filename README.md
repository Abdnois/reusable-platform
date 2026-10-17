# reusable-platform

Two independent, reusable products, combined through an API and sold as complete,
customer-specific solutions:

- **AuthCore** — reusable authentication/authorization core (works standalone).
- **CommerceCore** — reusable commerce engine, including **guest checkout that works
  without AuthCore**.

Each customer receives their own configuration, deployment, and **own database** — this
is not a shared multi-tenant SaaS. The cores never import each other; the API is the
composition root. Customer branding lives only in web frontends and configuration.

## Status

**Planning complete · Step 1 (AuthCore) not yet started · no application code yet.**
Current operational state: [handoff.md](handoff.md).

## Mandatory roadmap (fixed order)

1. Build AuthCore ← *current step*
2. Build CommerceCore
3. Integrate both through the API
4. Build and integrate the database (migrations built alongside steps 1–4)
5. Build the customer-specific frontend
6. Deploy the website
7. Test and finalize

## Approved stack (v1)

TypeScript · Node.js 24 LTS · pnpm workspaces · Fastify · PostgreSQL · Drizzle (stable
line) · revocable DB-backed sessions · Docker → VPS/managed container host · Next.js
customer frontends · Argon2id hashing. Full rationale: [docs/architecture/overview.md](docs/architecture/overview.md)
and [docs/adr/](docs/adr/).

## Important boundary rules

- Neither core may import the other's internals.
- CommerceCore treats AuthCore identity IDs as opaque strings; **no cross-core DB foreign keys**.
- **One PostgreSQL database per customer**, schema ownership per core (`authcore`, `commerce`).
- Each core must have its **own Drizzle migration journal** — see ADR 0002, incl. the
  proof that misconfiguration here fails *silently*.

## Documentation index

| Path | Purpose |
|---|---|
| [handoff.md](handoff.md) | **Session recovery point — read first in every session** |
| [docs/architecture/overview.md](docs/architecture/overview.md) | Approved architecture: boundaries, DB strategy, integration seams |
| [docs/adr/](docs/adr/) | Accepted decision records (ADRs 0001–0007) |
| [docs/development/setup.md](docs/development/setup.md) | Toolchain and local environment setup |
| [docs/development/git-workflow.md](docs/development/git-workflow.md) | Checkpoint/commit/push policy |
| [docs/development/recovery.md](docs/development/recovery.md) | Crash and new-machine recovery ritual |
| [docs/session-log.md](docs/session-log.md) | Exact record of committed session work |

## Setup

Not available yet beyond the planning stage — see
[docs/development/setup.md](docs/development/setup.md) for the toolchain that *will* be
required and for the portable toolchain already proven on the dev machine. `cp .env.example .env`
will be the standard config step once the workspace exists.
