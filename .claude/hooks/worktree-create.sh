#!/usr/bin/env bash
# WorktreeCreate hook: a subagent's `isolation: "worktree"` checkout goes through
# scripts/create-worktree.sh, so it lands in Orca's workspace folder, not in .claude/worktrees/.
# Claude Code reads the last stdout line as the worktree path, so all other output goes to stderr.
set -euo pipefail

name="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).name??""))')"
if [ -z "$name" ]; then
  echo "worktree-create: the hook input has no name." >&2
  exit 1
fi

output="$("$CLAUDE_PROJECT_DIR/scripts/create-worktree.sh" --agent "$name")"
echo "$output" >&2

path="$(printf '%s\n' "$output" | sed -n 's/^Worktree ready: \(.*\) (branch .*)$/\1/p' | tail -1)"
if [ -z "$path" ]; then
  echo "worktree-create: scripts/create-worktree.sh printed no worktree path." >&2
  exit 1
fi
echo "$path"
