# Recovery guide

> The goal: a new Freebuff session, a crashed process, or a fresh Windows install can
> recover this project working **without chat history**. Everything here is
> deterministic and tool-verifiable.
>
> Command availability: commands marked **[today]** work now; commands marked **[future]**
> describe the intended workflow and **do not exist yet** — the workspace and scripts are
> created in Step 1 and later. Update this file as soon as a [future] command becomes real.

## A. Recovery ritual (every new session, mandatory)

1. Read [handoff.md](../../handoff.md) top to bottom.
2. `git status --short` **[today]** — expect a clean tree (or one you can explain).
3. `git log --oneline -5` **[today]** — expect the last commit to match the session log.
4. `git ls-remote origin main` **[today]** — the SHA must equal `git rev-parse HEAD`.
   Do **not** assume agreement; look at the actual output. (`git fetch` also works but
   mutates local refs — prefer `ls-remote` for a pure check.)
5. Compare the actual tree (`git ls-files`) against the handoff's file manifest.
   Differences you cannot explain → stop and investigate, don't push forward.
6. Only then continue with the handoff's "Next steps".

**Discrepancy rules:** files listed but absent → retrace from the session log's commit
list; files present but unlisted → treat as unreviewed local changes (do not push);
commit SHAs mismatching the session log → verify the remote and re-derive exactly what
did and did not land.

## B. Crash / abrupt-stop recovery

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
- Never reach for `git reset --hard` or `git clean` as a shortcut; never discard or
  destroy unknown changes. Sorting and recovery are deliberate per-file decisions.
- Tests that could not finish are re-run before any "done" label is claimed.
- Re-run the session's *last* verification command and record its exact output before
  declaring the session recovered.

## C. Private repository access and clone verification

Access to the **private** GitHub repository requires authentication
(GitHub account with rights to `Abdnois/reusable-platform`, e.g. via Git Credential
Manager on Windows; no credentials belong in repo files or in this documentation).

```bash
# [today] clone and verify
git clone https://github.com/Abdnois/reusable-platform.git
cd reusable-platform
git branch --show-current            # must print: main
git log --oneline -5                 # inspect recent history; last entry must match the session log
git rev-parse HEAD                   # local HEAD
git ls-remote origin main            # authoritative remote SHA
```

**If the two SHAs differ:** stop. Inspect `git log origin/main..HEAD` and
`git log HEAD..origin/main` to see what diverges in each direction. Decide from evidence
which revision is intended (a local commit that never pushed? an incoming remote commit?).
Do **not** automatically reset, force-pull, or overwrite local work.

**Checkpoint context:** the audited checkpoint as of 2026-10-17 is
`6008e056c99913a481527ceb408ba33e8cef1334` (`6008e05`). Treat it as a **checkpoint**, not
a permanent freeze — the repository is *supposed* to advance in later steps. Any future
HEAD is fine as long as history is linear, the session log explains newer commits, and
no pushed history was rewritten.

## D. Properties, configuration and secrets

- `.env` files are ignored by Git and never committed. `.env.example` is the inert template —
  copy `.env.example` → `.env` **only when an application actually needs it** (until
  Step 1 creates the workspace it is not required).
- Fill secrets **only** from a secure source (owner/ops-provided values). Never invent
  real-looking secrets, and never commit `.env`.
- Whichever toolchain install method you choose, do **not** assume Node, pnpm,
  PostgreSQL, or Docker are on the system PATH — either add them per-session in Git Bash
  (`export PATH="...:$PATH"`) or install them explicitly.

## E. Toolchain installation (fresh machine; no admin required)

- **Node 24 LTS:** download the official win-x64 **zip**
  (`https://nodejs.org/dist/latest-v24.x/`), extract (e.g. to `%USERPROFILE%\tools\node-v24`),
  and SHA-256-verify against the published SHASUMS256.txt
  (`certutil -hashfile <zip> SHA256`). Node v24.22.0 is the version proven on this
  project's dev machine.
- **pnpm 10.x:** `corepack enable` inside the Node install, then
  `corepack prepare pnpm@latest --activate`; or `npm i -g pnpm` (into the portable prefix).
  Exact pnpm/Node/Postgres versions to pin are decided at Step-1 start (see ADR 0001
  and the handoff's approved decisions).
- **PostgreSQL 17 binaries:** portable zip from
  `https://www.enterprisedb.com/download-postgresql-binaries`; extract to
  `%USERPROFILE%\tools\pgsql`. Create the dev cluster only when needed
  (`initdb -D pgdata -U <role>` then `pg_ctl -D pgdata -l server.log -o "-p <port>" start`),
  and **stop it again afterward** (see the handoff's toolchain section for this
  machine's proven portable setup).
- **Docker Desktop:** only when container-verification time arrives (Step 6), not before.

## F. Database recovery (after Step 1 creates the workspace)

- Schema truth comes from **each core's migration process** — the per-core Drizzle
  configs with independent migration journals (ADR 0002). When rebuilding a development
  database, recreate the schema by running the cores' migrations. **Never treat an old
  database dump as the source of schema truth.**
- Preserve the boundaries: schema `authcore` and schema `commerce` stay separate, each
  with its own journal; no cross-core foreign keys; AuthCore migrates cleanly alone into
  a fresh database.
- Planned commands — **[future], do not exist yet; create/replace them with the actual
  scripts in Step 1 and update this table then:**
  ```
  pnpm install
  pnpm migrate:apply     # apply both cores' migrations in declared order (per-core journals)
  pnpm migrate:verify    # presence gate: assert schemas/tables/journals actually exist
  pnpm -r test
  ```
- Do not start PostgreSQL, or run any historical proof artifacts (e.g. the disposable
  `drizzle-proof` project) as part of ordinary recovery — those were one-time validation
  experiments outside the repository ([Recorded], not re-executed).

## G. Verification after recovery

Do these in order and record the outputs:

1. **[today]** `git status --short` — clean or explained.
2. **[today]** `git log --oneline -5` — matches the session log's latest entry.
3. **[today]** `git ls-remote origin main` vs `git rev-parse HEAD` — identical SHAs.
4. **[today]** `git stash list` — empty unless you know why.
5. **[future, Step 1 onward]** run available project tests (`pnpm -r test`) and the
   migration presence gate — until the workspace exists there are no tests or workspace
   scripts to run; do not pretend otherwise in the handoff.

## H. What if even Git history is unavailable (edge case)

`handoff.md` + `docs/` (if locally present) are the ground truth for what the project
**intended**; the remote GitHub repository is the ground truth for what was **actually
committed**. When GitHub is unreachable, recovery stops at the last locally verified
state — record it, then re-establish remote connectivity before further work.
