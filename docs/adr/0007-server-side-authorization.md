# ADR 0007 — Server-side authorization and guest-order claiming

**Status:** Accepted

## Decision

- **Authorization is enforced exclusively server-side.** The API resolves identity from
  the session (or auth context) itself; **browser- or caller-supplied permissions, roles,
  or user IDs are never trusted** — they carry no authority wherever they appear (URLs,
  cookies set outside the API, headers, JSON payloads).
- Every database read/write is scoped by the **server-resolved** subject, never by a
  client-provided ID. Posts/patches may mention IDs, but the API re-derives and checks
  ownership/permission on the server before acting.
- **Guest-order claiming is a trust boundary:** a guest (unauthenticated) order is placed
  without an account and later claimable only by proving ownership — via the order's
  freshly generated claim token (sent in the order-confirmation email), plus explicit
  checks that the claimant actually matches the order's recorded guest contact data.
  Guest-token-claim never bypasses backend ownership verification; "public claim by
  order ID" alone is insufficient and is forbidden.
- Server-side logic is the composition root for what the API exposes; frontend
  integrations never receive write authority on commerce or auth resources except
  through these checks.

## Consequences

- Guest-customer flows (CommerceCore) and authenticated flows share this framing, so a
  logged-in user and a guest get the same class of authorization checks.
- Rate limiting / lockout (ADR 0004) depend on this model — abuse-prevention rules are
  defined and tested entirely server-side.
