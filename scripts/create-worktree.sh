#!/usr/bin/env bash
# scripts/create-worktree.sh — the one door for a new worktree in this repo. Every worktree is
# Orca-managed, under /home/pawel/orca/workspaces/<repo>/<name>, never a `.worktrees/` sibling
# folder inside this checkout — a stale-worktree sweep can delete that one, branch and all (#482).
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/create-worktree.sh <issue-number> <slug> [base-branch]" >&2
  echo "Example: scripts/create-worktree.sh 332 extender-preview-fault" >&2
  exit 1
fi

issue="$1"
slug="$2"
base="${3:-origin/main}"
name="${issue}-${slug}"
branch="Pawel-IT/${name}"

# Resolve the orca CLI executable for this session (.claude/skills/orca-cli). A managed session
# exports ORCA_CLI_COMMAND; a dev checkout exposes ORCA_DEV_REPO_ROOT and orca-dev; a plain Linux
# shell outside Orca's terminals falls back to orca-ide, never bare `orca` — that name can resolve
# to the GNOME Orca screen reader and start speech on the user's machine.
if [ -n "${ORCA_CLI_COMMAND:-}" ]; then
  orca_cmd="$ORCA_CLI_COMMAND"
elif [ -n "${ORCA_DEV_REPO_ROOT:-}" ] && command -v orca-dev > /dev/null 2>&1; then
  orca_cmd="orca-dev"
elif command -v orca-ide > /dev/null 2>&1; then
  orca_cmd="orca-ide"
elif command -v orca > /dev/null 2>&1; then
  orca_cmd="orca"
else
  echo "error: no orca CLI executable found (checked ORCA_CLI_COMMAND, orca-dev, orca-ide, orca)" >&2
  exit 1
fi

# Read the repo id from the running checkout. This works from the main checkout and from a linked
# worktree alike, so the script never hard-codes a repo id.
current_json="$("$orca_cmd" worktree current --json 2> /dev/null || true)"
repo_id="$(node -e '
  const data = JSON.parse(process.argv[1] || "{}");
  process.stdout.write(data.result?.worktree?.repoId ?? "");
' "$current_json")"

if [ -z "$repo_id" ]; then
  echo "error: could not resolve the Orca repo id. Run this from an Orca-managed checkout of this repo." >&2
  exit 1
fi

# A second call with the same issue and slug resumes the existing worktree instead of failing.
list_json="$("$orca_cmd" worktree list --repo "id:$repo_id" --json)"
existing_path="$(node -e '
  const data = JSON.parse(process.argv[1]);
  const wantBranch = "refs/heads/" + process.argv[2];
  const hit = (data.result?.worktrees ?? []).find((w) => w.branch === wantBranch);
  process.stdout.write(hit?.git?.path ?? hit?.path ?? "");
' "$list_json" "$branch")"

if [ -n "$existing_path" ]; then
  echo "Worktree for $name already exists — resuming it."
  echo
  echo "Worktree ready: $existing_path (branch $branch)"
  exit 0
fi

echo "Creating worktree $name..."
create_json="$("$orca_cmd" worktree create \
  --repo "id:$repo_id" \
  --name "$name" \
  --issue "$issue" \
  --base-branch "$base" \
  --no-parent \
  --json)"

path="$(node -e '
  const data = JSON.parse(process.argv[1]);
  process.stdout.write(data.result?.worktree?.git?.path ?? "");
' "$create_json")"
created_branch="$(node -e '
  const data = JSON.parse(process.argv[1]);
  const ref = data.result?.worktree?.git?.branch ?? "";
  process.stdout.write(ref.replace(/^refs\/heads\//, ""));
' "$create_json")"

if [ -z "$path" ]; then
  echo "error: orca worktree create did not return a path. Raw output:" >&2
  echo "$create_json" >&2
  exit 1
fi

# The repo's Orca setup hook already runs `pnpm install` for a new worktree (`hookSettings.scripts.setup`).
# Install here only when that did not happen, so a working checkout never waits on a second install.
if [ -d "$path/node_modules" ]; then
  echo "Dependencies already installed by Orca's setup hook."
else
  echo "Installing dependencies in $path..."
  (cd "$path" && pnpm install)
fi

echo
echo "Worktree ready: $path (branch $created_branch)"
