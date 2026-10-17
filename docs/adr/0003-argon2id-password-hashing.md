# ADR 0003 — Argon2id password hashing

**Status:** Accepted (library version + exact cost parameters to be pinned in Step 1 and recorded here)

## Decision

- AuthCore hashes passwords with **Argon2id** via its canonical (prebuilt-binary-friendly)
  binding, using **explicit parameters**: the OWASP baseline (mem 19 MiB / time 2 /
  parallelism 1) is the starting range to tune; the chosen numbers are recorded here at
  pin time.
- Both **hash creation and verification** are tested **inside the final Docker image** —
  the flywheel must include the container, because native addons often build in the host
  and break in the container, and that can be invisible until runtime.
- Library selection (`@node-rs/argon2` vs. native `argon2` npm package) is finalized in
  Step 1: prefer the binding that installs cleanly for the target Docker base image
  (Alpine vs. Debian) without build tooling; the concrete pin goes in this ADR.

## Consequences

- In-image verification (registration + login flow fixture) is a mandatory Step-1 test,
  not an optional extra.
- The exact pinned package version and any deviation from the OWASP baseline are recorded in this file.
