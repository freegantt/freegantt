# Build log — the seven foot-gun rows under #463

Decisions the coordinator and the implementers made on their own while they closed the seven rows under #463.

## PR 1 — #478, #480, #479

No decision left open. The three issues settled every row's wording.

**Worktree location.** `scripts/create-worktree.sh` puts a worktree at `.worktrees/<issue>-<slug>/`. A stale-worktree sweep from another agent deleted that `.worktrees/` checkout, branch included. PRs 1 and 2 ran in the coordinator's own worktree as a stop-gap. PR #484 then moved the script to `orca worktree create`, so PR 3 onward each run in their own Orca-managed worktree, as the workflow always intended.

## PR 2 — #477

No decision left open. The issue's plan settled the wording, the sites, and the plan-row edit.

**`pr-wait` raced the `ready_for_review` transition.** `open-pr --ready` queued a gate run, but
concurrency (keyed on the branch) cancelled it against the draft-push run's tail end (`docs/04`
§5.2, #415's known shape). No live run remained, so `pr-wait` timed out twice. The documented fix
applied: push a commit so `synchronize` fires, then run `pr-wait` again. This note is that commit.

## PR 3 — #474

**`InvalidPresetError` shape.** A second validator needs a second message. The constructor takes `(presetId, reason)`, and each validator writes its own sentence. The two width fields go, because one code covers one meaning: this preset object is inconsistent.

No other decision left open. The issue's ruling settled the constructor shape, the two rules (unit and increment), and the empty-`headers` pass-through. `harness/main.ts` builds no custom `ViewPreset`, so this guard needed no harness review beyond confirming that.
