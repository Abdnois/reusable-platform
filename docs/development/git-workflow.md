# Git workflow and checkpoint policy

> Mandatory workflow for this repository. Nothing here overrides obs — all commits
> run by an agent follow the same rules as manual commits.

## Core rules (non-negotiable)

1. **Inspect before work:** `git status` + `git log --oneline -5` + `git fetch` / `git
   ls-remote origin main` at session start, and before any large edit. Confirm the tree
   matches the latest pushed handoff before changing anything.
2. **Known-good checkpoints:** before any risky change, and after every completed,
   verified unit of work, create a *small, coherent* commit. Prefer one commit per
   concept; never mix unrelated changes.
3. **Push after meaningful units, not tiny edits:** don't push per-keystroke; do push
   every unit whose description could be quoted as "done" in a session summary.
4. **Verify local == remote after every push:** `git ls-remote origin <branch>` must
   return the same SHA that `git rev-parse HEAD` returns. If they differ, the push did
   not land — diagnose before continuing.
5. **Never label unfinished or broken work as "done"**: the handoff and session log must
   reflect reality (tests failing, steps skipped, nothing done yet). Unfinished work is
   recorded as such, not hidden behind a "WIP" claim of success.
6. **Never rewrite known-good history** to conceal failures. We may rebase only our own
   unpushed local commits, and only deliberately.
7. **No secrets in Git:** real `.env` files, dump files, credentials, customer data —
   excluded by policy AND by `.gitignore`; `.env.example` remains inert (see ADRs:
   email and rate limiting defer secrets deliberately).

## Per-unit routine

```bash
git status                    # before
# ... make small edits ...
# run project checks (tests / typecheck) — record exact result in handoff
git add <explicit-paths>      # only files that belong to this unit
git commit -m "<conventional: feat/fix/docs/test/chore>"
git push origin <branch>
git ls-remote origin <branch>  # verify == git rev-parse HEAD
git status                    # confirm nothing unexpected remains
```

## Crash / forced-stop recovery

- **Never discard uncommitted work automatically.** After any unexpected stop, first
  inspect: `git status`, `git stash list`, untracked vs. modified vs. staged. Recover
  deliberately — decide per file whether it belongs to a finished unit or a partial one.
- Partial units may be committed as **explicitly labelled** WIP commits
  (`wip:` prefix) with the handoff clearly stating they are unfinished — recoverable,
  distinguishable from passing checkpoints.
- The last committed **and pushed** `handoff.md` must always constitute a usable
  recovery point, even when the session died before its final handoff update.

## Session-end ritual

1. Update `handoff.md` (reality, not aspiration).
2. Update `docs/session-log.md` with exact file lists and commit SHAs.
3. Commit (usually last action) and push.
4. Verify local == remote, and stop.
