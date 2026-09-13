#!/usr/bin/env bash
# PreToolUse: block `gh pr create` and name `pnpm open-pr` instead. docs/04-hooks-and-ci.md §5.2.
#
# `gh pr create` opens a ready pull request by default, and CI runs on `ready_for_review` (#255).
# So the raw command spends minutes on unfinished work, and it asks for a review nobody wanted
# yet. `pnpm open-pr` opens the same pull request as a draft, and prints the one command that
# makes it ready. A rule an agent must remember is a rule that breaks on a busy turn, so this
# hook holds it instead.
#
# `gh pr ready`, `gh pr merge`, `gh pr view` and every other subcommand stay open. Only the two
# ways to create one are blocked: the subcommand, and the REST call behind it.

set -euo pipefail

command_text="$(node -e '
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => {
    try {
      process.stdout.write(JSON.parse(data).tool_input?.command ?? "");
    } catch {
      process.stdout.write("");
    }
  });
')"

refuse() {
  cat >&2 <<'MESSAGE'
Blocked: open pull requests with `pnpm open-pr`, never with `gh pr create`.

  pnpm open-pr --title "<title>" --body-file <path>

It pushes the branch (pre-push runs the gate), opens the pull request as a DRAFT, and prints the
`gh pr ready <n>` command that starts CI. Every pull request on this repo starts as a draft: CI
runs on `ready_for_review`, so "ready" means it is up for review and meant to merge (#255,
docs/04-hooks-and-ci.md §5.2).

Marking one ready is not blocked — `gh pr ready <n>` is the command for it.
To write these words into a file, use the Write or Edit tool rather than a shell heredoc.
MESSAGE
  exit 2
}

if [[ "$command_text" =~ (^|[|\&\;\(]|[[:space:]])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$) ]]; then
  refuse
fi

if [[ "$command_text" =~ gh[[:space:]]+api ]] && [[ "$command_text" =~ /pulls([[:space:]]|$|\") ]]; then
  refuse
fi

exit 0
