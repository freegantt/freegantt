#!/usr/bin/env bash
# PreToolUse: block a hand-rolled CI wait and name `pnpm pr-wait` instead. docs/04-hooks-and-ci.md §5.2.
#
# `gh pr checks` carries two status vocabularies on one object. `bucket` is lowercase and coarse
# (`pending`, `pass`, `fail`), and `state` is uppercase and fine (`QUEUED`, `IN_PROGRESS`,
# `SUCCESS`). The human output prints the bucket word. So a loop written from reading that output —
# `until [ "$(gh pr checks N --json state ...)" != "PENDING" ]` — compares a `state` against a
# `bucket` word, never matches, and falls through on its first evaluation while it still prints the
# word `pending`. A wait that exits at once looks exactly like a wait that ran (#354).
#
# `pnpm pr-wait <n>` gives the waiting to `gh pr checks --watch`, then computes the verdict from a
# fresh read, and prints one line that is the answer. It also refuses the ways CI reports nothing
# while looking fine: a draft runs no checks (#255), and an all-skipped board is either the
# `ready_for_review` trigger gap or a real run that is seconds away (#298, #235, #360/#361).
#
# A rule an agent must remember is a rule that breaks on a busy turn, and this one did: the session
# that wrote `pr-wait` still hand-rolled `until gh run view <id> --json status ...; do sleep 20;
# done` afterwards. So the hook holds the rule instead of the document.
#
# Scope is deliberately narrow, because a hook people route around enforces nothing. This blocks the
# *fake* waits only — a loop around a status read, and a `sleep` beside one. `gh run watch` stays
# open: it really does block, and it is the only tool for a `workflow_dispatch` run, which has no
# pull request and so no `pr-wait`. Single reads stay open too — `gh run list`, `gh run view --log`,
# one `gh pr checks --json` — because reading is not the bug. Reporting a read as a verdict is.

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

It hands the waiting to `gh pr checks --watch`, then computes the verdict from a fresh read, and
prints one verdict line. Its last line is the answer: `pr-wait PASS — ...` or `pr-wait FAILED — ...`.
Report that line, never an exit code.

A poll written on the spot reads `state` (QUEUED/IN_PROGRESS/SUCCESS) against the `bucket` word the
human output prints (pending/pass/fail). The comparison never matches, so the loop exits on its
first evaluation and a wait that never waited looks exactly like one that ran (#354).

Single reads are not blocked: `gh run list`, `gh run view <id> --log`, `gh pr checks <n> --json`.
Neither is `gh run watch <id>`, which is the right tool for a `workflow_dispatch` run that has no
pull request. Only the loop and the `sleep` beside a status read are refused.

To write these words into a file, use the Write or Edit tool rather than a shell heredoc.
MESSAGE
  exit 2
}

# A status read: the thing worth waiting on, and the thing polls get wrong.
reads_ci_status() {
  [[ "$command_text" =~ gh[[:space:]]+run[[:space:]]+(view|list|status) ]] ||
    [[ "$command_text" =~ gh[[:space:]]+pr[[:space:]]+checks ]]
}

# `--watch` on the pull request's own checks is exactly what `pr-wait` wraps, verdict included.
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
