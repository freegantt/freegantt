# Rules for every wave-1 worker

Read these before your own brief's task. Your own brief overrides this file where it says so.

## Context

- The consumer request is `plans/2026-11-02-crm-handoff/handoff.md` in the coordinator worktree:
  `/home/pawel/orca/workspaces/freegantt/Sscheduling-Work/plans/2026-11-02-crm-handoff/handoff.md`.
- The owner waived the S6 → S7 gate for this work on 2026-11-02. S6 rows R1 and R2 stay open.
- Read `CLAUDE.md` in your worktree. Its hard rules apply in full: the Stop rule for `harness/`, Simplified Technical English, naming, comments, no spec labels in code, ADRs only with owner approval.
- Read `docs/agents/api.md` before you add or change any API.

## Authorized

- Commit on your own branch. Commit atomically (`atomic-commits` skill): one logical change per commit, staged by path.
- Add the `CHANGELOG.md` line in the same commit as a consumer-visible change.
- Push your branch.
- Open a **draft** pull request with the `pull-requests` skill.
- Run `pnpm` scripts, tests, typecheck, lint, and e2e in your worktree.

## Not authorized

- Do not mark the pull request ready. Do not merge.
- Do not write, amend or accept an ADR. If you think one is needed, use `ask`.
- Do not edit files that another wave-1 worker owns (see "Ownership" in your brief).
- Do not work around a library gap in `harness/`. Use `ask` (the Stop rule).

## Progress file

After each commit, append one line to `plans/2026-11-02-crm-handoff/progress-<your-slice>.md` in **your** worktree: `sha | item | state | next step`. Commit that file with the work.

## Done

1. Run the verification gate in `docs/agents/ci.md` (browser-free chain at least; e2e if you touched the DOM or `harness/`).
2. Send one `worker_done`: commits, test results, the draft PR URL, what you skipped, and what the owner must decide.
3. Then stop.

## Blocked

Use `ask` with what blocks you and what answer unblocks you. Do not send progress messages.
