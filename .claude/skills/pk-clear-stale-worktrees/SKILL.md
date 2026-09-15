---
name: pk-clear-stale-worktrees
description: Remove stale git worktrees that have no uncommitted work. Dirty checkouts stay; report them to the user.
disable-model-invocation: true
argument-hint: '[keepers...]'
---

# Clear stale worktrees

Remove linked git worktrees the user is not keeping. The main checkout stays. Branches stay.

A **keeper** is the main checkout, plus every linked worktree the user named this turn.

A checkout is **dirty** when `git -C <path> status --porcelain` prints any line. Report a dirty checkout to the user. Leave it. Do not delete it.

## 1. List

From the main checkout:

```
git worktree list
herdr worktree list
```

The main checkout is the row whose path is the repo root (`git rev-parse --git-common-dir` then `..`). Every other row is a linked worktree.

## 2. Keepers

If the user named no linked worktree to keep: print every linked path with its branch and dirty/clean status. Stop. Ask which to keep. Delete nothing yet.

If the user named keepers: those paths (and the main checkout) stay.

## 3. Check each candidate

A **candidate** is a linked worktree that is not a keeper. For each candidate:

```
git -C <path> status --porcelain
```

Any output means dirty. Print the path, the branch, and the porcelain lines. Skip that checkout.

Empty output means clean. It may go.

## 4. Remove each clean candidate

Close the herdr workspace first, then remove the checkout. Name the absolute path in every command.

```
herdr workspace close <workspace-id>
git worktree remove <absolute-path>
```

Read `open_workspace_id` from `herdr worktree list`. Skip the close when there is no workspace. Never pass `--force` to `git worktree remove`. If remove fails, print the error and leave that checkout.

Then delete leftover Cursor project folders that match **this** path only (`~/.cursor/projects/` names that contain the worktree slug). Leave `~/.claude/projects/` alone. Leave the empty `.worktrees/` directory.

## 5. Report

Print three lists, then `git worktree list`:

- **Removed** — path and branch
- **Kept** — path and branch
- **Skipped (dirty)** — path, branch, and the porcelain lines
