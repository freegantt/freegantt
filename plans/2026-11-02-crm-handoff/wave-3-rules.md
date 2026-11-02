# Rules for every wave-3 worker

`common-rules.md` and `wave-2-rules.md` (same folder) apply in full. Read them first. This file adds to them and overrides them where it says so.

## The owner's rulings

`decisions.md` (same folder) holds every ruling. Read all of it, including "Wave-2 follow-up rulings". It overrides `plans/s7-dependencies-and-scheduling/README.md` where the two disagree. The README is in your worktree.

Words, from the rulings:
- **Connector**: the line core draws between two bars. Never "link" or "spec" in new code.
- **Dependency**: the stored rule (FS/SS/FF/SF, lag), owned by `entryDependencies()`.
- **Manually scheduled**: an Entry the engine never moves. Never "pinned" (the grid already has pinned columns).
- **Constraint**: a date rule on one Entry, for example "start no earlier than".
- **Working calendar**: always optional.

## Base

Your branch starts from `Pawel-IT/Sscheduling-Work`, which merges every wave-1 and wave-2 pull request (#666–#673). Do not merge `main`. Open your draft pull request **against `Pawel-IT/Sscheduling-Work`**, not `main`.

## The bundle guard (owner ruling D11)

Check 15 (`check-bundle-growth`) compares your branch with `main`, so it counts the unmerged growth of #666–#673 too. When it fails:
1. Add one row to `bundle-size-exceptions.md`. The pull-request column is your branch name, as `resolvePullRequestId()` in `scripts/check-bundle-growth.mjs` reads it.
2. Put the measured growth plus about 15% headroom in the delta column.
3. In the reason, name what your branch adds, and say the row also covers the unmerged #666–#673.
4. Commit the row with the change that caused the growth, or as its own commit.

Never raise the budget or weaken the guard.

## Ownership across wave 3

| Worker | Owns |
|---|---|
| S7.8 (calendar in propagation) | `src/scheduling/`, `src/extensions/features/scheduling*`, its harness page |
| S7.4 (connector select, delete, label) | `src/extensions/features/entry-dependencies*`, `src/render/` connector parts, the Dependencies harness page |
| F1 (engine follow-up) | `src/scheduling/`, its `src/api/index.ts` lines, `CONTEXT.md` |
| F2 (row span text) | the "Planned vs actual" harness page and its e2e |
| S7.2 (Dependency store) | `src/extensions/features/entry-dependencies*`, its `src/api/index.ts` lines, its harness page |
| S7.3 (connect gesture) | `src/interaction/`, `src/model/capabilities.ts`, `src/view/` connect parts, `src/render/` port parts, its harness page |

Shared files (`CHANGELOG.md`, `src/api/index.ts`, `docs/architecture/files.md`, harness nav, `bundle-size-exceptions.md`): add your own lines only. The coordinator merges.

## Done

`worker_done` quotes the last line of `pnpm verify:full` **word for word**. Run it like this, with your own port:
`FG_E2E_PORT=<port> pnpm verify:full > verify.log 2>&1; tail -3 verify.log`
Do not report PASS unless that line says PASS. An earlier wave-2 worker reported PASS on a failing branch.
