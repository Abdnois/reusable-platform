# Recovery guide

> The goal: a new Freebuff session, a crashed process, or a fresh Windows install can
> recover this project working **without chat history**. Everything here is
> deterministic and tool-verifiable.

## A. Recovery ritual (every new session, mandatory)

1. Read [handoff.md](../../handoff.md) top to bottom.
2. `git status` — expect a clean tree (or one you can explain).
3. `git log --oneline -5` — expect the last commit to match the session log.
4. `git fetch origin && git ls-remote origin main` — the reported SHA must equal
   `git rev-parse HEAD`. If not: diagnose (network? incoming commit? failed push?).
   Never guess.
5. Compare the actual tree (`git ls-files`) against the handoff's file manifest.
   Differences you cannot explain → stop and investigate, don't push forward.
6. Only then continue with the handoff's "Next steps".

**Discrepancy rules:** files listed but absent → retrace from the session log's commit
list; files present but unlisted → treat as unreviewed local changes (do not push);
commit SHAs mismatching the session log → verify the remote and re-derive exactly what
did and did not land.

## B. Crash / abrupt-stop recovery (triable-after-disaster)

The first duties are **evidence**, not repairing:

```bash
git status
git stash list
git log --oneline -5
git ls-files --others --exclude-standard   # untracked files
```

- Uncommitted changes are inspected one by one, **never** discarded wholesale. Sort into:
  finished-unit (commit normally), partial-unit (WIP commit with `wip:` prefix and an
  explanatory handoff entry), or reference-only (leave untracked).
- Tests that could not finish are re-run before any "done" label is claimed.
- Re-run the session's *last* verification command and record its exact output before
  declaring the session recovered.

## C. New-machine / fresh-Windows recovery

1. **Clone:** `git clone https://github.com/Abdnois/reusable-platform.git` (full clone, not shallow) —
   checkout `main`.
2. **Install the toolchain** (nothing here requires admin on Windows):
   - Node.js 24 LTS: download the official win-x64 **zip** from
     `https://nodejs.org/dist/latest-v24.x/`, extract (e.g. to
     `%USERPROFILE%\tools\node-v24`), SHA-256-verify: `certutil -hashfile <zip> SHA256`
     against the value published in the official SHASUMS256.txt.
     Add its root to PATH for the session (`export PATH="...:$PATH"` in Git Bash) —
     optionally persist per-user, not system-wide.
   - pnpm 10.x: `corepack enable` inside that Node install, then `corepack prepare pnpm@latest --activate`; or `npm i -g pnpm` (into the portable prefix).
   - PostgreSQL 17 binaries: portable zip from
     `https://www.enterprisedb.com/download-postgresql-binaries`; extract to
     `%USERPROFILE%\tools\pgsql`; init a local cluster:
     `initdb -D pgdata -U platform; pg_ctl -D pgdata -l server.log -o "-p 5432" start`.
   - Docker Desktop (when container verification time arrives; not needed before Step 6).
3. **Restore configuration safely:** copy `.env.example` → `.env`, fill real values
   from the customer/ops record — **never** commit it, and never reuse a `.env` from
   Git history (it is not there, by design).
4. **Recreate modules + database:**
   ```
   pnpm install                      # from the committed lockfile
   pnpm migrate   # orchestrator + per-core journals, once Step 1 exists
   pnpm gate:schemas                 # assert schemas/tables/journals actually exist
   pnpm -r test
   ```
5. **Verify** the exact same checks as the pre-crash session would: the presence gate
   green, both schemas present, AuthCore-alone migration into a fresh database feasible
   (see ADR 0002), and the handoff's "Next steps" now unobstructed.

## D. What if even Git history is unavailable (edge case)

`handoff.md` + `docs/` (if locally present) are the ground truth for what the project
**intended**; the remote GitHub repository is the ground truth for what was **actually
committed**. When GitHub is unreachable, recovery stops at the last locally verified
state — record it, then re-establish remote connectivity before further work.
