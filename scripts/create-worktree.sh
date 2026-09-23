#!/usr/bin/env bash
# scripts/create-worktree.sh — the one door for a new worktree in this repo. Every worktree is
# Orca-managed, under /home/pawel/orca/workspaces/<repo>/<name>, never a `.worktrees/` sibling
# folder inside this checkout — a stale-worktree sweep can delete that one, branch and all (#482).
set -euo pipefail

usage() {
  echo "Usage: scripts/create-worktree.sh <issue-number> <slug> [base-branch]" >&2
  echo "       scripts/create-worktree.sh --agent <name> [base-branch]" >&2
  echo "Example: scripts/create-worktree.sh 332 extender-preview-fault" >&2
}

# --agent: a subagent's `isolation: "worktree"` checkout, made by .claude/hooks/worktree-create.sh.
# It has no issue, and Orca files it under the caller's worktree, not at the top level.
if [ "${1:-}" = "--agent" ]; then
  if [ "$#" -lt 2 ]; then
    usage
    exit 1
  fi
  issue=""
  name="$2"
  base="${3:-origin/main}"
else
  if [ "$#" -lt 2 ]; then
    usage
    exit 1
  fi
  issue="$1"
  slug="$2"
  base="${3:-origin/main}"
  if ! [[ "$issue" =~ ^[0-9]+$ ]]; then
    echo "error: <issue-number> must be a number, got '$issue'." >&2
    usage
    exit 1
  fi
  name="${issue}-${slug}"
fi

# Resolve the orca CLI executable for this session. See the user-level orca-cli skill
# (~/.claude/skills/orca-cli/SKILL.md) for the environment variables an Orca-managed session sets.
# This ladder never falls back to bare `orca`: on a plain Linux machine that name can resolve to
# the GNOME Orca screen reader instead of Orca's CLI, and starting speech on the user's machine is
# a worse failure than stopping here with a clear error.
if [ -n "${ORCA_CLI_COMMAND:-}" ]; then
  orca_cmd="$ORCA_CLI_COMMAND"
elif [ -n "${ORCA_DEV_REPO_ROOT:-}" ] && command -v orca-dev > /dev/null 2>&1; then
  orca_cmd="orca-dev"
elif command -v orca-ide > /dev/null 2>&1; then
  orca_cmd="orca-ide"
else
  echo "error: no orca CLI executable found (checked ORCA_CLI_COMMAND, orca-dev, orca-ide)" >&2
  exit 1
fi

# Run an orca CLI subcommand that returns a JSON envelope, and stop with the CLI's own error on
# any failure. Orca prints its error envelope on stdout (not stderr) and exits 1, so a plain
# `set -e` command substitution loses the message; this wraps both failure shapes — a nonzero
# exit and an `"ok": false` envelope — and prints the real cause either way.
run_orca() {
  local json code message
  if ! json="$("$orca_cmd" "$@")"; then
    echo "error: $orca_cmd $* failed:" >&2
    echo "$json" >&2
    exit 1
  fi
  if node -e '
    const data = JSON.parse(process.argv[1] || "{}");
    process.exit(data.ok === false ? 0 : 1);
  ' "$json"; then
    code="$(node -e '
      const data = JSON.parse(process.argv[1] || "{}");
      process.stdout.write(data.error?.code ?? "unknown_error");
    ' "$json")"
    message="$(node -e '
      const data = JSON.parse(process.argv[1] || "{}");
      process.stdout.write(data.error?.message ?? "");
    ' "$json")"
    echo "error: $orca_cmd $* failed ($code): $message" >&2
    exit 1
  fi
  printf '%s' "$json"
}

# Installs dependencies for a worktree at <path>, unless Orca's own setup hook for this repo
# (`hookSettings.scripts.setup`) already ran `pnpm install` there.
install_dependencies() {
  local path="$1"
  if [ -d "$path/node_modules" ]; then
    echo "Dependencies already installed by Orca's setup hook."
  else
    echo "Installing dependencies in $path..."
    (cd "$path" && pnpm install)
  fi
}

# Read the repo id from the running checkout. This works from the main checkout and from a linked
# worktree alike, so the script never hard-codes a repo id.
current_json="$(run_orca worktree current --json)"
repo_id="$(node -e '
  const data = JSON.parse(process.argv[1] || "{}");
  process.stdout.write(data.result?.worktree?.repoId ?? "");
' "$current_json")"

if [ -z "$repo_id" ]; then
  echo "error: could not resolve the Orca repo id from 'orca worktree current --json'." >&2
  exit 1
fi

# A second call with the same issue and slug resumes the existing worktree instead of failing.
# Match on the worktree's own name (displayName), not on the branch checked out inside it — a
# caller can `git switch` inside a worktree, and the live HEAD branch is not the worktree's
# identity (#487 review).
list_json="$(run_orca worktree list --repo "id:$repo_id" --json)"
existing_path="$(node -e '
  const data = JSON.parse(process.argv[1]);
  const hit = (data.result?.worktrees ?? []).find((w) => w.displayName === process.argv[2]);
  process.stdout.write(hit?.git?.path ?? hit?.path ?? "");
' "$list_json" "$name")"
existing_branch="$(node -e '
  const data = JSON.parse(process.argv[1]);
  const hit = (data.result?.worktrees ?? []).find((w) => w.displayName === process.argv[2]);
  const ref = hit?.git?.branch ?? "";
  process.stdout.write(ref.replace(/^refs\/heads\//, ""));
' "$list_json" "$name")"

if [ -n "$existing_path" ]; then
  echo "Worktree for $name already exists — resuming it."
  echo

  if [ ! -d "$existing_path" ]; then
    echo "error: Orca lists worktree $name at $existing_path, but that path does not exist on disk." >&2
    exit 1
  fi

  install_dependencies "$existing_path"

  echo
  echo "Worktree ready: $existing_path (branch $existing_branch)"
  exit 0
fi

echo "Creating worktree $name..."
# An issue worktree stands alone. An agent worktree takes Orca's default: a child of the caller.
lineage=()
if [ -n "$issue" ]; then
  lineage=(--issue "$issue" --no-parent)
fi
create_json="$(run_orca worktree create \
  --repo "id:$repo_id" \
  --name "$name" \
  --base-branch "$base" \
  "${lineage[@]}" \
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

if [ ! -d "$path" ]; then
  echo "error: orca worktree create returned path $path, but it does not exist on disk." >&2
  exit 1
fi

install_dependencies "$path"

echo
echo "Worktree ready: $path (branch $created_branch)"
