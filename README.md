reusable-platform
Two independent, reusable products, combined through an API and sold as complete, customer-specific solutions:

AuthCore — reusable authentication/authorization core (works standalone).
CommerceCore — reusable commerce engine, including guest checkout that works without AuthCore.
Each customer receives their own configuration, deployment, and own database — this is not a shared multi-tenant SaaS. The cores never import each other; the API is the composition root. Customer branding lives only in web frontends and configuration.

Status
Step 1 (AuthCore) in progress · workspace foundation + migration-safety gate committed and verified (ADR 0008) · feature slices (Argon2id hashing, registration, sessions, lockout) not yet started. Current operational state: handoff.md.

Mandatory roadmap (fixed order)
Build AuthCore ← current step
Build CommerceCore
Integrate both through the API
Build and integrate the database (migrations built alongside steps 1–4)
Build the customer-specific frontend
Deploy the website
Test and finalize
Approved stack (v1)
TypeScript · Node.js 24 LTS · pnpm workspaces · Fastify · PostgreSQL · Drizzle (stable line) · revocable DB-backed sessions · Docker → VPS/managed container host · Next.js customer frontends · Argon2id hashing. Full rationale: docs/architecture/overview.md and docs/adr/.

Important boundary rules
Neither core may import the other's internals.
CommerceCore treats AuthCore identity IDs as opaque strings; no cross-core DB foreign keys.
One PostgreSQL database per customer, schema ownership per core (authcore, commerce).
Each core must have its own Drizzle migration journal — see ADR 0002, incl. the proof that misconfiguration here fails silently.
Documentation index
Path	Purpose
handoff.md	Session recovery point — read first in every session
docs/architecture/overview.md	Approved architecture: boundaries, DB strategy, integration seams
docs/adr/	Accepted decision records (ADRs 0001–0008)
docs/development/setup.md	Toolchain and local environment setup
docs/development/git-workflow.md	Checkpoint/commit/push policy
docs/development/recovery.md	Crash and new-machine recovery ritual
docs/session-log.md	Exact record of committed session work
Setup
The pnpm workspace exists: root manifests (package.json, pnpm-workspace.yaml, tsconfig.base.json) and packages/authcore with pinned toolchain versions (ADR 0008). Install with pnpm install; check with pnpm -r typecheck, pnpm -r test, and pnpm gate:authcore. See docs/development/setup.md for the portable toolchain. No code consumes .env yet; .env.example documents future configuration.
