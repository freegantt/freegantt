---
name: pk-branch-review
description: "Full branch review in one pass — naming, simplicity, SOLID, architecture, API surface — into one HTML report in plans/reviews, then a fresh sub-agent verifies every finding."
disable-model-invocation: true
---

# Branch review

Two passes. Pass 1 finds everything and writes the report. Pass 2 checks each finding with fresh eyes.

## Pass 1 — find everything in one review

Review this branch on all axes below in the same pass. Do not hold the API axis back for later.

- **Naming** — call the Skill tool with "naming". Read each call site aloud with real arguments.
- **Simplicity and reuse** — call the Skill tool with "simplify".
- **Standards and spec** — call the Skill tool with "code-review".
- **Architecture** — call the Skill tool with "improve-codebase-architecture".
- **API surface** — answer these questions about the changed surface:
  - Does an app author read the call site as the job it does?
  - Does the branch add a knob, a hook, or a handle that an app author must set to get the default behaviour?
  - Can the code say what a comment says, and delete the comment?
  - Does a new kind, field, or plugin extend through a seam, or does it need an `if` chain?
  - Does the change move this code toward a ball of mud?
  - Is each new type and module SOLID, extensible, and easy to use?

Keep the project rules in view. `CLAUDE.md` holds the hard rules. `CONTEXT.md` holds the glossary. `plans/00`–`04` hold the spec. Review `harness/main.ts` on every branch, changed or not.

Write one HTML report for all findings. Use the HTML scaffold from the `improve-codebase-architecture` skill, and override that skill on three points:

1. Save the file in `plans/reviews/`, not the temp directory. Name it with today's date and a short name for the branch or changeset, such as `2026-09-08-s5-256-write-shape.html`.
2. Give every finding a stable id (`F1`, `F2`, …), the files it cites, and the line numbers it cites. Pass 2 answers by id.
3. Skip that skill's grilling loop. This review reports; it does not redesign.

Commit the report. Push it.

## Pass 2 — a fresh sub-agent verifies the findings

Start pass 2 after the commit lands. Dispatch one `reviewer` sub-agent for it. The sub-agent starts cold, and that is the point: it must not inherit your reading of the code. Call the Skill tool with "subagents" to write the dispatch.

A review's account of the code is a claim, and a verified finding does not verify its proposed fix. On #244 all 18 findings were real, but one described the code wrongly, and the true fix was smaller.

The dispatch gives the sub-agent:

- The absolute path of the report, the branch name, and the fixed point of the diff (`git diff <fixed-point>...HEAD`).
- The job: open every file each finding cites, and decide whether the finding describes that code correctly.
- One verdict per finding id: `Confirmed`, `Mis-described` (the problem is real, the account is wrong — state the correct account), `Wrong` (no problem here), or `Unproven` (nobody can tell without running the code).
- The limit: it reports only. It never edits code. It never edits the report.
- The environment rules, quoted, because a sub-agent inherits none of them:
  - The working tree is shared with other sessions. Do not stash. Do not switch branches. Do not reset.
  - To settle a question about behaviour, write a throwaway test, run it, then delete it.
  - To run the gate, use `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`, and quote the `verify:full` verdict line. Never report `EXIT: $?`.

When the sub-agent reports, update the report file yourself:

- `Confirmed` — record the verdict on the finding.
- `Mis-described` — replace the account with the correct one, and keep the finding.
- `Wrong` — strike the finding, and say who struck it and why.
- `Unproven` — say what run or test would settle it.

Commit the updated report. Push it.
