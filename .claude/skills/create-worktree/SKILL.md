---
name: create-worktree
description: Create a git worktree for isolated work on an issue or feature. Use before running `git worktree add` by hand, and whenever starting work that should not touch the caller's current checkout.
argument-hint: '<issue-number> <slug> [base-branch]'
---

# Create a worktree

Every worktree in this repo is Orca-managed, under
`/home/pawel/orca/workspaces/freegantt/<issue-number>-<slug>` — never a `.worktrees/` sibling
folder inside this checkout. A `.worktrees/` worktree sat outside Orca's tracking, and a
stale-worktree sweep deleted one mid-run, branch and unpushed commit both (#482).

Never run a raw `git worktree add`. Run the one script that enforces this:

```
./scripts/create-worktree.sh <issue-number> <slug> [base-branch]
```

`./scripts/create-worktree.sh 332 extender-preview-fault` creates worktree
`332-extender-preview-fault`, off `origin/main` by default, and runs `pnpm install` there unless
Orca's own setup hook for this repo (`pnpm install`) already did. Passing the same issue number
and slug again resumes that worktree instead of failing.

Orca names the branch `Pawel-IT/<issue-number>-<slug>`, not `fix/<issue-number>-<slug>`. The
prefix is Orca's, not the script's — every caller reads the branch name the script prints, and
does not assume the old `fix/` prefix.

Every command against the worktree needs its own `cd`/`-C` — state the absolute path out loud
each time work moves into or out of it, so the user can always tell where changes are landing.

## A subagent's worktree goes through the same door

A subagent started with `isolation: "worktree"` does not get a `.claude/worktrees/agent-*`
checkout. The `WorktreeCreate` hook (`.claude/hooks/worktree-create.sh`) runs
`./scripts/create-worktree.sh --agent <name>` instead. The worktree lands in
`/home/pawel/orca/workspaces/freegantt/<name>`, and Orca files it under the caller's worktree.

The `WorktreeRemove` hook (`.claude/hooks/worktree-remove.sh`) runs when the subagent finishes. It
removes the worktree only when it has no uncommitted file and no unpushed commit. Otherwise the
worktree stays for the caller to push, and the rule in "Clean up when the work merges" applies.

## Orca already tracks the worktree

`orca worktree create` registers the worktree with Orca as it creates it, so the caller's session
and the user's review pane can both find it without a separate hand-off step. Pass `--activate` to
`orca worktree create` directly, outside this script, only when you want Orca to reveal the new
worktree in the app; the script itself does not need to, since the point of using Orca is that it
already knows about the worktree.

## Clean up when the work merges

If `git -C <path> status --porcelain` prints any line, stop and report. Leave it.

Otherwise remove the checkout:

```
orca worktree rm --worktree id:<repo-id>::<path> --json
```

Read `<repo-id>` from `orca worktree current --json` (or `orca worktree list --json`) and `<path>`
from the same place. Removal also deletes the checked-out local branch, unless Orca knows the
branch predated the worktree or cannot prove it merged — so a merged, pushed branch is the normal
case to remove this way. Never pass `--force`; if removal fails, print the error and leave the
checkout.
