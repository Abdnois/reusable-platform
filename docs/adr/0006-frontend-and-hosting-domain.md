# ADR 0006 — Next.js frontends and same-domain hosting

**Status:** Accepted (Next.js chosen; concrete blockers would trigger revisit)

## Decision

- Customer frontends use **Next.js**. Branch exception: a concrete compatibility issue
  could justify a different framework, but only with an owner-approved ADR revision.
- **Reusable storefront components** live in shared packages (e.g. `packages/web-ui`);
  per-customer **branding and configuration** live in each customer's app/config layer.
  The two are never mixed — shared components carry no customer identity.
- **Storefront and API are served under the same registrable customer domain** wherever
  possible (same-site cookies; no cross-origin cookie friction).
- Security posture enforced at the API edge:
  - cookies: client-visible as `HttpOnly`, `Secure` (in prod), `SameSite=Lax/Strict`,
    server-rendered; never exposed to JS;
  - CSRF: double-submit or same-site-plus-token, per the shape of the cookie setup;
  - CORS: restrictive — only the customer's own origin is allowed (or none, on a
    same-origin deployment);
  - **proxy trust**: `trustProxy` is set to the **explicit, allowed list** of proxy
    addresses (never `true`), so `X-Forwarded-For` limits stay accurate for rate limiting.

## Consequences

- The Step-1 rate-limiting correctness (ADR 0004) depends on the proxy-trust decision
  being honored when deployment land — recorded here so it is not rediscovered late.
