# ADR 0005 — Email via an adapter interface (dev adapter first)

**Status:** Accepted (real provider intentionally NOT yet chosen)

## Decision

- AuthCore sends email only through an `EmailSender` interface owned by AuthCore's public
  surface — never through a concrete provider import inside core flows.
- **v1 ships a development adapter only**: it writes messages to local logs/streams (or a
  local file) so verification and password-reset flows are testable end-to-end without
  any external service, account, or network.
- **A real transactional provider must be selected and integrated before any production
  deployment.** Provider choice is deliberately deferred to a later ADR; the selection
  criterion is deliverability + API seam + cost, evaluated when deployment approaches.
- **Before production deployment**, the dev adapter is removed from used paths and swapped
  through configuration — never by editing core code.

## Consequences

- No vendor API keys are needed for v1 development.
- Provider swap is a config change, not a refactor, by construction.
