---
name: create-worktree
description: Create a git worktree for isolated work on an issue or feature. Use before running `git worktree add` by hand, and whenever starting work that should not touch the caller's current checkout.
argument-hint: '<issue-number> <slug> [base-branch]'
---

# Create a worktree

Every worktree in this repo lives at `.worktrees/<issue-number>-<slug>/` (gitignored) — never as a
sibling folder (`../FreeGantt-<n>`). One place under the project root, visible in a file tree,
instead of a location the user has to already know to look for.

Never run a raw `git worktree add`. Run the one script that enforces the location:

```
./scripts/create-worktree.sh <issue-number> <slug> [base-branch]
```

`./scripts/create-worktree.sh 332 extender-preview-fault` creates branch
`fix/332-extender-preview-fault` at `.worktrees/332-extender-preview-fault/`, off `origin/main`
by default, and runs `pnpm install` there. Passing the same issue number and slug again resumes
that branch (local or `origin/`) instead of failing.

Every command against the worktree needs its own `cd`/`-C` — state the absolute path out loud
each time work moves into or out of it, so the user can always tell where changes are landing.

When the work merges, remove it from the project root: `git worktree remove
.worktrees/<issue>-<slug>`.
