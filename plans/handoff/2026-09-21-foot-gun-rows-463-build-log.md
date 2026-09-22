# Build log — the seven foot-gun rows under #463

Decisions the coordinator and the implementers made on their own while they closed the seven rows under #463.

## PR 1 — #478, #480, #479

No decision left open. The three issues settled every row's wording.

**Worktree location.** `scripts/create-worktree.sh` puts a worktree at `.worktrees/<issue>-<slug>/`. A process outside this run deleted the first one, with its branch. The five PRs run one at a time, so each one now uses a branch in the Orca worktree the coordinator holds. The documented door stays correct for parallel work.

## PR 2 — #477

No decision left open. The issue's plan settled the wording, the sites, and the plan-row edit.

**`pr-wait` raced the `ready_for_review` transition.** `open-pr --ready` queued a gate run, but
concurrency (keyed on the branch) cancelled it against the draft-push run's tail end (`docs/04`
§5.2, #415's known shape). No live run remained, so `pr-wait` timed out twice. The documented fix
applied: push a commit so `synchronize` fires, then run `pr-wait` again. This note is that commit.
