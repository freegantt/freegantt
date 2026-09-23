#!/usr/bin/env bash
# WorktreeRemove hook: the pair of worktree-create.sh. It removes a subagent's Orca worktree only
# when nothing in it can be lost — no uncommitted file and no commit that no remote has. Anything
# else stays on disk for the caller to push or review; a sweep once deleted unpushed work (#482).
set -euo pipefail

path="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).worktree_path??""))')"
if [ -z "$path" ] || [ ! -d "$path" ]; then
  exit 0
fi

if [ -n "$(git -C "$path" status --porcelain)" ]; then
  echo "worktree-remove: $path has uncommitted changes. It stays." >&2
  exit 0
fi
if [ -n "$(git -C "$path" rev-list HEAD --not --remotes | head -1)" ]; then
  echo "worktree-remove: $path has commits that no remote has. It stays." >&2
  exit 0
fi

if [ -n "${ORCA_CLI_COMMAND:-}" ]; then
  orca_cmd="$ORCA_CLI_COMMAND"
elif command -v orca-ide > /dev/null 2>&1; then
  orca_cmd="orca-ide"
else
  echo "worktree-remove: no orca CLI executable found. $path stays." >&2
  exit 0
fi

if ! "$orca_cmd" worktree rm --worktree "path:$path" --json >&2; then
  echo "worktree-remove: orca worktree rm failed. $path stays." >&2
fi
