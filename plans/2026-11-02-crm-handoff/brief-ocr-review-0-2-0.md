# Brief: ocr review of the 0.2.0 release branch

You review. You do not change `src/`, `harness/`, `e2e/` or docs. Read `docs/agents/review.md` first and follow it.

## Run

1. Work in your own worktree, on a branch that tracks `origin/Pawel-IT/Sscheduling-Work`. Run `git fetch origin` first.
2. Run `pnpm ocr-review` in the background, as `docs/agents/review.md` says. It diffs against `origin/main`. A run of 30+ minutes is normal. If it reports PARTIAL, resume with `pnpm ocr-review --resume <id>`. If it reports STALLED, resume once, then report.
3. Read every finding with `ocr session comments <id>`.

## Verify each finding

A finding is a claim. Open the file and check it against the code at `origin/Pawel-IT/Sscheduling-Work`. Mark each one:

- **CONFIRMED**: the defect is real. Say the failure in one line (input → wrong result).
- **PLAUSIBLE**: it could be real, but you can't show it in under 10 minutes.
- **REJECTED**: it's wrong. Say why in one line.

Also check the project's own rules on the diff, as `CLAUDE.md` names them: the harness stop rule (`harness/` code that works around `src/`), spec labels in code comments or test names, sentence length, and the layer boundaries.

## Report

Write `plans/2026-11-02-crm-handoff/review-0-2-0.md`. List the findings most severe first, with file:line, verdict, and the failure line. Put a short summary at the top, and say which findings must block the 0.2.0 release. Commit only that file to your branch and push it. Then send one `worker_done` with the summary and the path. Do not open a pull request.
