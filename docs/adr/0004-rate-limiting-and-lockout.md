# ADR 0004 — Rate limiting and account lockout

**Status:** Accepted

## Decision

- **One API container per customer deployment in v1.** No multi-replica scaling is
  claimed safe: in-memory rate-limit state is strictly **per-process**, so scaling out
  would silently multiply effective limits.
- Rate limiting via `@fastify/rate-limit` in **in-memory** mode for v1, behind a thin
  `RateLimitStore` seam so a shared store (Redis or Postgres) can be swapped in later
  **without touching call sites**. The decision document must never conflate "in-memory"
  with "scales horizontally."
- **Durable account lockout** lives in the `authcore` Postgres schema (e.g. a
  `login_attempts` record), because in-memory counters vanish on restart and cannot see
  attempts spread over time.
- **Safe-lockout design against its own abuse mode** (an attacker locking out a victim):
  progressive delay first; lockout only after N consecutive failures; **time-bounded and
  self-recovering**; generic error responses that never reveal lockout state or account
  existence; per-account **plus** per-IP signals, so lockout on one IP cannot
  indefinitely deny the victim.
- Rate limiting + progressive delay are primary controls; lockout stays secondary and narrow.
- **Required tests (owner-mandated):** brute-force protection; password-reset abuse;
  safe-lockout behaviour; rate-limit failure paths (limiter unavailable → fail CLOSED on
  write, never open the throttle).
