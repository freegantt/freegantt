#!/usr/bin/env bash
# PostToolUse: format, lint, and (conditionally) boundary-check the file that was just edited.
# docs/04-hooks-and-ci.md §2.1. Non-src edits must never tax editing docs or fixtures — exit 0 immediately.

set -euo pipefail

payload="$(cat)"
file_path="$(node -e '
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => {
    try {
      const json = JSON.parse(data);
      process.stdout.write(json.tool_input?.file_path ?? "");
    } catch {
      process.stdout.write("");
    }
  });
' <<<"$payload")"

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  src/*.ts | */src/*.ts) ;;
  *) exit 0 ;;
esac

if [[ ! -f "$file_path" ]]; then
  exit 0
fi

# The edited file's own directory decides the repo root — never the shell's cwd. A PostToolUse hook
# runs with the session's primary directory as cwd even when the edited file lives in a different
# git worktree, so `git rev-parse --show-toplevel` alone would resolve the wrong root and lint the
# file as "outside of base path" (#323 worktree session).
cd "$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")"

if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

# 1. Formatting is never worth a turn — fix it silently.
pnpm exec prettier --write "$file_path" >/dev/null 2>&1 || true

# 2. Full rule set, scoped to this one file.
lint_output="$(pnpm exec eslint --max-warnings 0 "$file_path" 2>&1)" || {
  echo "$lint_output" >&2
  echo "" >&2
  echo "eslint failed on $file_path (docs/04-hooks-and-ci.md §2.1). Fix the violation above before continuing." >&2
  exit 2
}

# 3. If the edit added an import statement, boundaries are cheap enough to check now.
if git diff --unified=0 -- "$file_path" 2>/dev/null | grep -qE '^\+\s*import '; then
  boundaries_output="$(pnpm boundaries 2>&1)" || {
    echo "$boundaries_output" >&2
    echo "" >&2
    echo "dependency-cruiser boundary check failed after an import was added to $file_path (plans/01 §1, I1)." >&2
    exit 2
  }
fi

exit 0
