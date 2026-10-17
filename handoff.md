# Project Handoff — reusable-platform

> **Read this first in every new session.** This file is the recovery point when chat
> history, a running process, or an entire Windows installation is gone. At the end of
> every session, update it to reflect reality — including "nothing was done" — then commit and push.
>
> Legend: **[Verified]** = checked against tool output in the session noted.
> **[Recorded]** = result from an earlier session, reported in that session's own output; not re-run here.

Last updated: 2026-10-17 · Session type: documentation / recovery system (before Step 1)

## 1. Project goal

Build **two independent, reusable products** that are combined through an API and resold
as complete customer-specific solutions:

- **AuthCore** — reusable authentication/authorization core.
- **CommerceCore** — reusable commerce engine that works **without** AuthCore, including guest checkout.

Each customer gets their **own configuration, deployment, and database**. This is **not**
a shared multi-tenant SaaS platform. The cores never import each other's internals; the
API is the composition root. Branding lives in customer frontend/config layers only.

Details: [README.md](README.md) · [docs/architecture/overview.md](docs/architecture/overview.md)

## 2. Mandatory seven-step roadmap (fixed order — do not reorder)

1. **Build AuthCore** ← current step (not started)
2. Build CommerceCore
3. Integrate both through the API
4. Build and integrate the database (schemas/migrations are developed *alongside* steps 1–4, never postponed)
5. Build the customer-specific frontend
6. Deploy the website
7. Test and finalize

## 3. Repository state

**Pre-session state** [Verified 2026-10-17, immediately before this session's commits]:

| Item | Value |
|---|---|
| Local path | `/e/reusable-platform` (Windows: `E:\reusable-platform`) |
| Branch | `main` |
| Known-good commit | `95ef8d10ec6ad28a0c40ad1d8694827bde04f7a6` (`95ef8d1` — "initialize repository with README and .gitignore") |
| Remote | `origin` → `https://github.com/Abdnois/reusable-platform.git` |
| Remote agreement | `git ls-remote origin main` returned exactly this hash |
| History | Full clone, not shallow |
| Working tree | Clean; tracked files exactly `.gitignore` + `README.md` |

**This session's commits** [Verified — this session]:

- `05f19e2514022aebdc18ec4c815d4cfd070eb838` (`05f19e2`) — "docs: add session recovery
  system (handoff, architecture overview, ADRs, dev guides)" — 15 files, pushed to
  `origin/main` and **verified**: `git ls-remote origin main` returned the same SHA
  immediately after the push (diff `95ef8d1..05f19e2`); tree clean afterwards.
- A second finalization commit (handoff + session-log hashes) follows this one; a file
  cannot contain its own hash, so its SHA is confirmed at push time via the ritual in
  [docs/development/git-workflow.md](docs/development/git-workflow.md).
- Prior known-good baseline `95ef8d1` remains reachable; no history was rewritten.

**Read-only audit** [Verified 2026-10-17]: confirmed the above in a fresh session —
branch `main`; HEAD `6008e056c99913a481527ceb408ba33e8cef1334`; `git ls-remote origin main`
returned exactly that SHA; working tree clean; all 16 tracked files present; no
secret-pattern hits in tracked files (`.env` absent, `.env.example` inert and tracked);
proof toolchain directory intact with the database server stopped (no `postgres.exe`, no
listener on 55432). The audit made **no changes**. Audit checkpoints are checkpoints,
not freezes — the repo is expected to advance once Step 1 is authorized.

## 4. Completed work (all sessions; stands without chat history)

1. **Architecture proposal** [Recorded] — approved in principle across several review
   rounds. Its durable content was previously chat-only; from this session it lives in
   [docs/architecture/overview.md](docs/architecture/overview.md) and the ADRs.
2. **Drizzle dual-journal migration proof** [Recorded] — disposable project at
   `C:\Users\Abid\proof-toolchain\drizzle-proof` (outside the repo, deliberately not
   committed), with pinned `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `pg@8.23.1` and    portable PostgreSQL on port 55432. **Results: 19/19 assertions passed** — a
    **historical result, not re-verified since** (the disposable proof project lives
    outside the repo and was not re-executed during the 2026-10-17 audit). Notably:
   - one database, two schemas (`authcore`, `commerce`), each with its **own journal table** in schema `drizzle`
   - each journal contains only its own core's migrations; re-running is idempotent
   - cross-core FK count = **0**; every FK is intra-schema
   - AuthCore alone in a **fresh** database works; reverse migration order works
3. **Negative control (the critical finding)** [Recorded] — with the per-core
   `migrations.table` overrides removed, `drizzle-kit migrate` printed success with
   **exit code 0** while silently creating **no commerce tables**. A journal collision
   *looks green*. **Consequence:** the build gate must assert physical schema/journal
   presence after migration; exit codes are insufficient.
4. **Session recovery system** [Verified this session] — the `handoff.md` + `docs/` set,
   created, committed and pushed per [docs/development/git-workflow.md](docs/development/git-workflow.md).

## 5. Machine-specific toolchain state

Directory `C:\Users\Abid\proof-toolchain\` [Verified — exists with named subdirs]:

| Component | Status |
|---|---|
| `node-v24.22.0-win-x64/` (+ `node.zip` original archive) | Portable Node v24.22.0, SHA-256-verified at download time [Recorded]. Not on system PATH. |
| `pgsql/` (+ `pg.zip` original archive) | Portable PostgreSQL binaries (version 17.11 [Recorded]); no installer, no Windows service. |
| `pgdata/` | initdb-ed cluster. **Server STOPPED** [Verified: no `postgres.exe` process, no listener on port 55432]. Start only when needed; stop after. |
| `drizzle-proof/` | Disposable proof project with its own `node_modules`. Untracked, machine-local, entirely rebuildable (see recovery doc). |

All of it is machine-local, not in Git, and not on PATH [Verified]. Freebuff restarts do
not auto-start the database server; it must stay stopped between sessions unless work needs it.

## 6. Approved decisions (binding baseline)

These were approved by the owner across planning sessions. Implementation must not
contradict them; changes require explicit approval and a handoff entry.

- TypeScript, **Node.js 24 LTS**; **pnpm workspaces** monorepo
- **Fastify** API; **PostgreSQL** persistence; **Drizzle** ORM/Kit on the **stable** release line (v1 RC explicitly rejected); exact versions pinned at implementation start — 0.45.4 / 0.31.11 were the current stable pair at proof time [Recorded]
- **Database-backed, revocable sessions** (no cookie-only sessions)
- **Docker** containers → conventional VPS or managed container host
- Customer frontends built with **Next.js** unless a concrete incompatibility emerges (ADR 0006)
- **One PostgreSQL database per customer**; schema ownership: `authcore` and `commerce` (and app schemas as needed)
- **No cross-core database foreign keys** — CommerceCore stores AuthCore identity IDs as **opaque strings** (ADR 0002)
- **Argon2id** password hashing with explicit cost parameters; hash+verify verified inside the final Docker image (ADR 0003)
- Auth emails initially via a **dev adapter behind an interface**; a real transactional provider must be selected **before** any production deployment (ADR 0005)
- **One API container per customer in v1**: in-memory rate limiting + durable DB-backed account lockout; safe-lockout design; a later shared-store option is pre-wired but not deployed (ADR 0004)
- Storefront and API served under the **same registrable customer domain**; cookie/CSRF/CORS/proxy-trust configured strictly (ADR 0006)
- **Server-side authorization only** — never trust browser/caller-supplied permissions; guest-order claiming verifies ownership (ADR 0007)

**Recommended, not yet formally approved** (track until owner decides):
- CI presence gate as a merge-blocking job (consequence of the negative control) — recommended, status pending
- UTC-only timestamps everywhere — recommendation
- Turbo/Nx task runner — deferred; plain pnpm scripts suffice for v1

## 7. Open decisions (not blocking Step 1)

1. **Managed Postgres provider** for customer deployments — comparison still owed.
2. **Real email provider** — decide before deployment; dev adapter in the meantime.
3. **Core distribution model** to per-customer deployments (releases, private registry, vendoring) — decide by Step 5.
4. **Guest-order → account claiming UX**: how an unverified guest later claims an order after registering (login-based claim vs claim-code link) — decide during CommerceCore (Step 2); ADR 0007 already requires the proof mechanism.

## 8. Constraints

- No application code yet. The old `Website` / `Website-clean` projects are not to be modified or referenced.
- Never commit secrets, real `.env` files, credentials, DB dumps, or customer data. `.env` is git-ignored; only `.env.example` is tracked and kept realistic-but-inert.
- Push after meaningful, verified units — not after every tiny edit (git-workflow doc).
- **Do not reorder or skip the seven-step roadmap.**

## 9. Tests and verification record

| Check | Result | Status |
|---|---|---|
| Drizzle proof: 19 assertions (dual journal, zero cross-core FKs, AuthCore-alone, reverse order, idempotent re-run) | 19/19 PASS | [Recorded] |
| Negative control (journal collision reproduces silent skip) | reproduced | [Recorded] |
| `git log` / `status` / `ls-remote` agreement | clean tree, remote matches local HEAD | [Verified this session] |
| Portable toolchain dirs + stopped DB server | present / stopped | [Verified this session] |
| Docker image build | not attempted | pending — Step 6 |
| In-image Argon2 hash+verify | not attempted | pending — Step 1 |
| Rate-limit and lockout behaviour tests | not attempted | pending — Step 1 |
| M2 args hardening tests | not attempted | pending — Step 1 |

## 10. Failed attempts this session

None. (Historical [Recorded]: backgrounding the proof's database inside a synchronous
shell timed out twice; fixed by running the process fully detached with its own logfile.)

## 11. Known risks

1. **Migration configuration** is the highest-risk area — the negative control proved a
   plausible misconfiguration looks green while silently creating nothing. The first
   code milestone must ship the presence gate.
2. **Container path unvalidated** — no Docker was available; both the multi-stage pnpm
   image and in-image Argon2 are claimed only on research. Verify at first Docker exposure.
3. **Stable-line perturbation** — `latest` currently does not resolve to the v1 RC
   [Recorded], but releases move; lock exact versions at Step 1 start and note any change here.

## 12. Next steps in exact order (fresh-session starter)

1. **Trust-check**: `git status`, `git log --oneline -5`, `git ls-remote origin main` —
   compare against this file and the session log. If anything is surprising, stop and investigate.
2. Read [docs/development/setup.md](docs/development/setup.md), then
   [docs/architecture/overview.md](docs/architecture/overview.md) and the ADR index.
3. **Step 1 (AuthCore) begins only after explicit approval.** Planned slices, each an
   independently testable commit+push unit:
   1. pnpm workspace skeleton (root configs + `packages/authcore` shell that type-checks).
   2. AuthCore schema + **migration presence gate** (prove schemas/journals exist post-migrate).
   3. Argon2id hashing module + in-image verification fixture.
   4. Registration, login, DB-backed revocable sessions, logout + tests.
   5. Rate limiting + durable lockout including the mandated brute-force/reset-abuse/lockout-failure tests (ADR 0004).
   6. Step-1 wrap-up: docs refresh, handoff update, final checkpoint push.

## 13. Checkpoint discipline

Full policy: [docs/development/git-workflow.md](docs/development/git-workflow.md).
Non-negotiables: verify local/remote agreement after every push; never label unfinished
or broken work "done"; record failures verbatim; never rewrite pushed history to hide failures.

---

### Session file manifest

| File | Created | Last touched |
|---|---|---|
| `handoff.md` | 2026-10-17 | 2026-10-17 |
| `README.md` (replaced) | 2026-10-17 | 2026-10-17 |
| `.env.example` | 2026-10-17 | 2026-10-17 |
| `docs/architecture/overview.md` | 2026-10-17 | 2026-10-17 |
| `docs/adr/0001` … `docs/adr/0007` | 2026-10-17 | 2026-10-17 |
| `docs/development/setup.md` | 2026-10-17 | 2026-10-17 |
| `docs/development/git-workflow.md` | 2026-10-17 | 2026-10-17 |
| `docs/development/recovery.md` | 2026-10-17 | 2026-10-17 |
| `docs/session-log.md` | 2026-10-17 | 2026-10-17 |
