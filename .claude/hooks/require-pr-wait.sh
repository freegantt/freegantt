#!/usr/bin/env bash
# PreToolUse: block a hand-rolled CI wait and name `pnpm pr-wait` instead. docs/04-hooks-and-ci.md §5.2.
#
# A wait written from `gh pr checks` reads the check-suite rollup. This workflow skips `gate` on
# every draft push, so that rollup is full of SKIPPED rows that share the required check name, and
# a loop over it reports "nothing started" while a live pull_request run is already on the board
# (#415, #420). `pnpm pr-wait` watches the CI workflow run for the pull request head instead
# (`gh run watch`), ignores skipped draft-time jobs, and prints one verdict line.
#
# A rule an agent must remember is a rule that breaks on a busy turn, and this one did: the session
# that wrote `pr-wait` still hand-rolled `until gh run view <id> --json status ...; do sleep 20;
# done` afterwards. So the hook holds the rule instead of the document.
#
# Scope is deliberately narrow, because a hook people route around enforces nothing. This blocks the
# *fake* waits only — a loop around a status read, a `sleep` beside one, and `gh pr checks --watch`.
# `gh run watch <id>` stays open: it really does block, and it is the only tool for a
# `workflow_dispatch` run, which has no pull request and so no `pr-wait`. Single reads stay open
# too — `gh run list`, `gh run view --log`, one `gh pr checks --json` — because reading is not the
# bug. Reporting a read as a verdict is.

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
Blocked: wait for CI with `pnpm pr-wait`, never with a hand-written poll.

  pnpm pr-wait <n>        # or no argument, for this branch's pull request

It watches the CI workflow run for the pull request head (`gh run watch`), ignores skipped
draft-time jobs, and prints one verdict line. Its last line is the answer: `pr-wait PASS — ...` or
`pr-wait FAILED — ...`. Report that line, never an exit code.

Single reads are not blocked: `gh run list`, `gh run view <id> --log`, `gh pr checks <n> --json`.
Neither is `gh run watch <id>`, which is the right tool for a `workflow_dispatch` run that has no
pull request. Only the loop, the `sleep` beside a status read, and `gh pr checks --watch` are
refused.

To write these words into a file, use the Write or Edit tool rather than a shell heredoc.
MESSAGE
  exit 2
}

# A status read: the thing worth waiting on, and the thing polls get wrong.
reads_ci_status() {
  [[ "$command_text" =~ gh[[:space:]]+run[[:space:]]+(view|list|status) ]] ||
    [[ "$command_text" =~ gh[[:space:]]+pr[[:space:]]+checks ]]
}

# `--watch` on the pull request's check suites is the observer that lied on #415 / #420.
if [[ "$command_text" =~ gh[[:space:]]+pr[[:space:]]+checks ]] && [[ "$command_text" =~ --watch ]]; then
  refuse
fi

# A loop around a status read is the hand-rolled poll this whole rule exists for.
if [[ "$command_text" =~ (^|[[:space:]|\&\;\(])(until|while)([[:space:]]|$) ]] && reads_ci_status; then
  refuse
fi

# `sleep` beside a status read is the same mistake without the loop: an arbitrary guess at a wait.
if [[ "$command_text" =~ (^|[|\&\;\(]|[[:space:]])sleep([[:space:]]|$) ]] && reads_ci_status; then
  refuse
fi

exit 0
