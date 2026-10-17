# Architecture overview — v1

> Approved by the owner across planning sessions (2026-10-16/17). This is the durable
> replacement for the chat-only proposal. Scope markers: **[v1]** = build now; **[later]**
> = deferred until demonstrated need. Details of individual decisions: `docs/adr/`.

## 1. Product model

Two **independently reusable** products, sold as combined customer solutions:

| Product | Delivers | Must work without the other? |
|---|---|---|
| **AuthCore** | registration, login, Argon2id hashing, email verification + recovery, revocable DB sessions, basic roles/permissions, rate limiting + durable lockout **[v1]**; MFA/passkeys/OIDC-provider/offline-first **[later]** | yes |
| **CommerceCore** | catalog + variants, pricing + inventory, guest & authenticated carts, orders + basic checkout, **payment-provider interface with a test adapter** **[v1]**; promotions/shipping matrix/multi-provider payments **[later]** | yes, including guest checkout |

Deployment model: one customer = one config + one deployment + **one PostgreSQL database**.
Not a multi-tenant platform.

## 2. Composition rules (hard boundaries)

- `AuthCore` and `CommerceCore` are first-class packages; **neither may import the other's internals**.
- The **API is the composition root**: it wires both cores through their explicit public interfaces.
- CommerceCore treats AuthCore identity IDs as **opaque strings**; **no cross-core database FKs** in v1.
- Branding/presentation never enters core logic; it lives in customer frontend + config only.
- Screens (browser, tests, shell scripts) never receive authority: **authorization is enforced server-side** (ADR 0007).

Proposed layout (v1 shape, realized in Step 1):

```
packages/authcore/          # core #1 (public TS interface + internals, schema, migrations)
packages/commercecore/      # core #2 (same shape)
apps/api/                   # Fastify composition root wiring both cores + auth/email seams
apps/storefront/            # Next.js app consuming shared components + per-customer config
packages/web-ui/            # reusable storefront components (no customer branding)
```

## 3. Database strategy

- One PostgreSQL database per customer; inside it, **schema `authcore`** and **schema `commerce`** — each core owns its schema and its migrations.
- **Two independent Drizzle migration journals** (`migrations.table` per core config) — a
  shared default journal collides *silently* (proven: success message + exit 0 while one
  core's tables were never created). The CI gate asserts schemas + journals exist after
  migrating an empty DB (ADR 0002).
- No FK across schemas; integrity is application-level (opaque ID references).
- AuthCore alone must migrate cleanly into a fresh database (proven in the proof run).

## 4. Integration seams (how the cores talk without entangling)

| Concern | Seam | Owner |
|---|---|---|
| Identity for orders | API resolves AuthCore user → CommerceCore `customer_subject_id` (opaque string) | API composition root |
| Payment | `PaymentProvider` interface; **fake/test adapter first**; real provider selected later **[later]** | CommerceCore |
| Email | `EmailSender` interface; **dev adapter** (log/local capture); real provider pre-deployment **[later]** | AuthCore |
| Rate limiting | in-memory store via `@fastify/rate-limit` behind a thin `RateLimitStore` seam; durable **account lockout** in `authcore` schema; boot-time refusal if scaled beyond one replica with the memory store **[later shared store]** | AuthCore |

## 5. API surface sketch (v1 shape)

AuthCore-facing routes: register / verify-email / login / logout / refresh-session /
request-password-reset / perform-password-reset / revoke-session / list-sessions /
basic role & permission management.

CommerceCore-facing routes: products / variants / inventory / carts (guest + auth) /
checkout → order; guest orders carry a claim token usable **only** against server-side
ownership proof (ADR 0007).

Composition-root rules: every route validates input server-side; every query is scoped
by the server-resolved subject, never by a client-supplied ID or email.

## 6. Frontend & hosting

- Next.js by default (ADR 0006). Reusable components in `packages/web-ui`; per-customer
  branding/config in the customer app — never in shared components.
- Storefront + API under the same registrable customer domain; strict cookie attributes,
  CSRF, CORS, and proxy-trust (ADR 0006).

## 7. Accepted decision records

0001 stack · 0002 Drizzle dual-journal migrations · 0003 Argon2id · 0004 rate limiting
+ lockout · 0005 email adapter · 0006 frontend/hosting domain · 0007 server-side
authorization & guest-order claiming.

## 8. Acceptance criteria for v1 (summary)

- **AuthCore:** register→verify→login→session refresh→logout→revoke all work; Argon2id
  hashes verify; lockout/time-delay/rate-limit tests pass; sessions are DB rows,
  revocable, and never cookie-only.
- **CommerceCore:** guest cart→checkout→order completes without any AuthCore dependency;
  authorized-user flows resolve identity via the API; ownership is enforced and tested.
- **Composition:** integrating both into `apps/api` requires **no core-internal changes**.
- **Per-customer reusability:** a fresh customer DB migrates both schemas cleanly, plus
  the presence gate passes; AuthCore alone migrates cleanly into its own fresh DB.
- **Tests**: automated tests in every slice; rate limiting and lockout have explicit
  abuse-prevention tests as mandated.

## 9. Risks register (living — prune or extend as reality changes)

1. **Silent migration skip** (proven failure mode) → mitigated by ADR 0002 + CI presence gate.
2. **Unvalidated container path** (no Docker so far): multi-stage pnpm image + in-image
   Argon2 must be verified at first Docker exposure, not assumed.
3. **Versioned line shifts**: pin exact versions at implementation start; any change is a
   deliberate, recorded decision.
