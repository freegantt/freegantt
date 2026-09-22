# Build log — the seven foot-gun rows under #463

Decisions the coordinator and the implementers made on their own while they closed the seven rows under #463.

## PR 1 — #478, #480, #479

No decision left open. The three issues settled every row's wording.

**Worktree location.** `scripts/create-worktree.sh` puts a worktree at `.worktrees/<issue>-<slug>/`. A process outside this run deleted the first one, with its branch. The five PRs run one at a time, so each one now uses a branch in the Orca worktree the coordinator holds. The documented door stays correct for parallel work.

## PR 2 — #477

No decision left open. The issue's plan settled the wording, the sites, and the plan-row edit.
