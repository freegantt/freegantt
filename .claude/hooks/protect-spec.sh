#!/usr/bin/env bash
# PreToolUse: block edits that would casually change the spec, add a runtime dependency, or loosen a
# guard. docs/04-hooks-and-ci.md §2.2. Converts the easy path into a conversation; it can't fully
# prevent a determined edit, but CI's `disables` job plus review catch the rest.

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")"

payload="$(cat)"
parsed="$(node -e '
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => {
    try {
      const json = JSON.parse(data);
      const filePath = json.tool_input?.file_path ?? "";
      const newContent =
        json.tool_input?.content ??
        json.tool_input?.new_string ??
        (json.tool_input?.edits ?? []).map((e) => e.new_string ?? "").join("\n");
      // Pairs of (old, new) strings for the edit(s) being made, when available.
      // Write has no old_string (full-file rewrite); Edit/MultiEdit do.
      let pairs = [];
      if (Array.isArray(json.tool_input?.edits)) {
        pairs = json.tool_input.edits.map((e) => [e.old_string ?? "", e.new_string ?? ""]);
      } else if (typeof json.tool_input?.old_string === "string") {
        pairs = [[json.tool_input.old_string, json.tool_input.new_string ?? ""]];
      }
      process.stdout.write(JSON.stringify({ filePath, newContent, pairs }));
    } catch {
      process.stdout.write(JSON.stringify({ filePath: "", newContent: "", pairs: [] }));
    }
  });
' <<<"$payload")"

file_path="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).filePath)" "$parsed")"
new_content="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).newContent)" "$parsed")"

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  plans/* | */plans/*)
    # Narrow exception: an edit that only flips markdown checkbox state
    # ("- [ ]" <-> "- [x]"/"- [X]") and changes nothing else is allowed —
    # ticking an acceptance box once its gate is satisfied isn't a spec change.
    # Anything else touching plans/ (including Write, which has no old_string
    # to diff against) is still blocked.
    checkbox_only="$(node -e '
      const { pairs } = JSON.parse(process.argv[1]);
      if (pairs.length === 0) { process.stdout.write("no"); process.exit(0); }
      const normalize = (s) => s.replace(/\[[ xX]\]/g, "[ ]");
      const ok = pairs.every(([oldS, newS]) => normalize(oldS) === normalize(newS) && oldS !== newS);
      process.stdout.write(ok ? "yes" : "no");
    ' "$parsed")"
    if [[ "$checkbox_only" == "yes" ]]; then
      exit 0
    fi
    echo "plans/ is the spec. Locked decisions D1-D12 change by explicit human decision, not as a side effect of implementation. Ask first. (Exception: toggling '- [ ]'/'- [x]' checkboxes with no other change is allowed.)" >&2
    exit 2
    ;;
esac

case "$file_path" in
  package.json | */package.json)
    # A deliberately loose check: only complain if the edit touches a "dependencies" block
    # (not devDependencies) — dependency-cruiser/eslint config etc. are unaffected.
    if grep -qE '"dependencies"\s*:' <<<"$new_content" 2>/dev/null; then
      echo "Exactly one runtime dependency is allowed (plans/04 §1). Rejected candidates and their reasons are documented there." >&2
      exit 2
    fi
    ;;
esac

case "$file_path" in
  eslint.config.js | */eslint.config.js | .dependency-cruiser.cjs | */.dependency-cruiser.cjs)
    if [[ -f "$file_path" ]]; then
      old_lines="$(grep -cE 'forbid\(|rules:|severity' "$file_path" 2>/dev/null || true)"
      new_lines="$(grep -cE 'forbid\(|rules:|severity' <<<"$new_content" 2>/dev/null || true)"
      old_lines="${old_lines:-0}"
      new_lines="${new_lines:-0}"
      if [[ "$new_lines" -lt "$old_lines" ]]; then
        echo "Loosening a guard is a spec change. Say which invariant is being relaxed and why (docs/04-hooks-and-ci.md §2.2)." >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
