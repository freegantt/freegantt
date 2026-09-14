#!/usr/bin/env bash
# scripts/create-worktree.sh — the one door for a new git worktree in this repo. Every worktree
# lands under .worktrees/<issue>-<slug>/ (gitignored, .gitignore), never as a sibling folder
# (`../FreeGantt-<n>`) — one place under the project root that shows up in a file tree instead of
# requiring the reader to already know to look one level up.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/create-worktree.sh <issue-number> <slug> [base-branch]" >&2
  echo "Example: scripts/create-worktree.sh 332 extender-preview-fault" >&2
  exit 1
fi

issue="$1"
slug="$2"
base="${3:-origin/main}"
branch="fix/${issue}-${slug}"
dir=".worktrees/${issue}-${slug}"

# Resolve the main checkout, not the caller's. `--show-toplevel` answers a linked worktree with
# its own root, which would nest .worktrees/ inside that worktree.
repo_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
cd "$repo_root"

if [ -e "$dir" ]; then
  echo "error: $dir already exists" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch $branch already exists locally — resuming it."
  git worktree add "$dir" "$branch"
elif git ls-remote --exit-code --heads origin "$branch" > /dev/null 2>&1; then
  echo "Branch $branch already exists on origin — resuming it."
  git fetch origin "$branch" --quiet
  git worktree add -b "$branch" "$dir" "origin/$branch"
else
  git fetch origin --quiet
  git worktree add -b "$branch" "$dir" "$base"
fi

echo "Installing dependencies in $dir..."
(cd "$dir" && pnpm install)

echo
echo "Worktree ready: $dir (branch $branch)"
