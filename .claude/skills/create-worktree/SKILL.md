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

## Give the worktree its own herdr workspace

The script calls `git worktree add`, and git tells herdr nothing. So the caller's session and the
user's review pane both stay on the main checkout, and neither one sees the new work. Hand the
finished worktree to herdr yourself:

```
herdr worktree open \
  --path /home/pawel/code/FreeGantt/.worktrees/<issue>-<slug> \
  --cwd /home/pawel/code/FreeGantt \
  --no-focus
```

This opens a workspace whose panes start in the worktree, and it fires `worktree.opened`. The
`persiyanov.reviewr` plugin answers that event. It opens a review pane in the new workspace, and
roots that pane at the worktree.

**This step works. Do not debug it.** The event is silent by design, and a silent success looks
exactly like a failure from the caller's pane.

Always pass `--cwd <repo root>`. herdr resolves the source workspace from the _focused_ pane, not
from the pane that runs the command. A focused pane that sits in a linked worktree fails the call:
`linked_worktree_source: New and open worktree actions start from the repo parent workspace`. You
cannot see where focus is, so name the repo root every time (observed, herdr 0.9.0).

A worktree that already has a workspace answers `"already_open": true`, and reviewr then skips its
auto-open on purpose — it never resurrects a pane the user closed. That answer is a success, not a
failure. Read `.result.workspace.workspace_id` and report it.

## Say where the review pane is

The review pane opens in the **new** workspace. `--no-focus` keeps the user in the pane they
called you from, so they see nothing change. Name the workspace and tell them to switch:

> Worktree ready. The review pane is in workspace `w16` (`336-rename-hierarchy-parent-id`).
> Switch to that workspace to review it.

Report this every time. On 2026-09-14 the auto-open succeeded on the first try, the user saw
nothing appear in their own pane, and both of us spent an hour treating a working feature as a
bug.

## Never toggle reviewr from the calling pane

reviewr reviews the **focused pane's working directory**. It does not read the workspace's
registered worktree. The `ctrl+e` toggle closes every reviewr pane in the workspace, then opens one
fresh at the focused pane's cwd.

So a toggle in the calling pane reviews the calling pane's checkout, and shows that checkout's
uncommitted work. Closing and reopening never recovers the worktree pane — it rebuilds a main
pane. Tell the user to leave `ctrl+e` alone and use the auto-opened pane instead.

A pane's working directory is fixed when the pane launches. Your own `cd` does not move it: your
Bash calls run in subshells, and the pane's foreground process is the agent. So you cannot point
the calling pane's reviewr at the worktree. Do not try (observed 2026-09-14, herdr 0.9.0,
reviewr 0.37.1).

Do not start a second agent in the new workspace to work around this. A new agent begins with no
context, and the user loses the conversation that asked for the worktree. Keep working from the
calling session, and let the user review in the other workspace.

## Verify before you report

Never infer a pane from an exit code. Read the panes and the plugin log:

```
herdr pane list --workspace <workspace-id>
herdr plugin log list
```

A workspace with 2 panes has its review pane. In the log, an entry with `"event":
"worktree.opened"` and `"exit_code": 0` is the auto-open that ran. `auto-open` prints nothing on
success, so empty `stdout` proves nothing on its own.

## Clean up when the work merges

If `git -C .worktrees/<issue>-<slug> status --porcelain` prints any line, stop and report. Leave it.

Otherwise close the workspace, then remove the checkout:

```
herdr workspace close <workspace-id>
git worktree remove .worktrees/<issue>-<slug>
```
