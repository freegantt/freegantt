---
name: pk-work-queue
description: Run a queue of issues to merged PRs while the owner is away.
disable-model-invocation: true
---

# Work queue: issues to merged PRs, owner away

You are the coordinator. You plan, dispatch, rule, log and merge. You do not write product code yourself.

## Authority (restate it in the log at the start)

- The owner allows: merge each PR after its code review findings are fixed and CI is green. Mark drafts ready.
- The owner does not allow: squash, amend, force-push, git stash, recurring timers, or deleting anything you did not create.
- A decision you are unsure of: decide, mark it ⚠️ in the log, and keep going. Stop only for public API changes or conflicts with an ADR's open question. Ask about those at once, not at the end.
- Ask the owner which ocr mode to use before the first review, in the scope-check batch. Log the answer. It holds for the whole queue:
  1. Is ocr delegated or not delegated?
  2. If not delegated: does it run in this session, or in a new Cursor session?

## Agents

Route and write every dispatch with the `subagents` skill. It holds the agent table, the dispatch shape, the context budget, and the watcher. Do a small rename, docblock edit, or lookup in your own session or in the implementer.

- One implementer per worktree at a time. Parallel work only in separate worktrees on disjoint files.
- **Retire an implementer when it compacts or reaches its budget.** Start a fresh one with file paths and the exact state. A resumed, compacted agent loses its identity and works in the wrong worktree.
- At most one reviewer agent. Let it compact. Do not start a second one.
- Try to keep a `planner` busy. Its cache lasts 5 minutes; every other agent's lasts 1 hour. Answer its questions and send plan revisions soon after it reports.
- Put every long input (findings, repro, handoff) in a scratchpad file and pass the path.
- Check every "done" claim yourself with one cheap command (`git log`, `git status`, `gh pr view`) before you act on it.

## Files (create them first, in the session scratchpad)

- `log.md`: every decision, one line each, with ⚠️ on the unsure ones. Append only.
- `handoff.md`: a "CURRENT STATE" block. It lists open agents with their ids, worktrees, PRs, and the next step. It also lists each slice's planned steps and planned files. Update it after every state change. A fresh coordinator, or you after a compaction, must be able to resume from this file alone.
- `implementer-rules.md`: the binding rules every implementer reads first (below).

## Per issue

1. **Scope check.** Read the issue and the governing plans and ADRs. Grep `docs/adr/` for open questions in the area. Log each hit, or "no open questions". Ask the owner the blocking design questions now, in one batch, with a recommendation each.
2. **Plan.** Dispatch a fresh `planner`. Each step is one atomic commit, with its test and the files it touches. Review the plan. Push back on vague steps and on over-claims (for example "same rows in the same order" when only values matter). Post the approved plan as an issue comment.
3. **Watch the scope.** At each agent report, compare the work with the plan. These signals mean the slice is growing:
   - steps added that the plan did not list;
   - core files changed that the plan did not name;
   - a second design question.

   No single signal is a hard stop. Two signals, or one large one, mean: stop and ask the owner whether to split, with the reason and a scope-cut option. Ship what stands alone, and file the rest as a follow-up issue. Never let one PR absorb a redesign.

4. **Old bugs on main.** A bug on main that blocks this slice's tests gets its own small PR. Merge that PR first, then merge `origin/main` into this branch and re-plan.
5. **Worktree.** `orca worktree create --name <issue>-<slug> --parent-worktree active --base-branch origin/main --json`. Give each worktree its own e2e port.
6. **Implement.** Dispatch a fresh `implementer`. Start the prompt with an identity block: "You are the implementer for #N in `<path>` on `<branch>`. You are not the coordinator." Then give:
   - the port;
   - the path of `implementer-rules.md` and the plan;
   - the exact state (last sha, uncommitted files);
   - which steps to do, and when to STOP (a design question, a blocker, or the budget).
7. **Rule fast.** When an implementer stops with a question, decide in the same turn if you can. Log it. Send the ruling with the reason and the exact edit.
8. **Review.**
   - Default: one ocr run at the end, in the mode the owner chose (Authority). Fix each finding as it lands. A run of 10–30+ minutes is normal.
   - **Delegated.** A supervised Orca worker runs a Cursor agent in the issue's worktree. The agent runs ocr in delegate mode and does the review itself. Use model `cursor-grok-4.6-high` (Grok 4.6, high effort). Never use a `-fast` model. Load the `orchestration` skill first; it owns the loop below.
     ```bash
     orca orchestration run-create --objective "ocr review #<n>" --json          # once per queue
     orca orchestration worker-start --run <run> --worktree path:<worktreePath> \
       --agent cursor --model cursor-grok-4.6-high --task-title "ocr #<n>" \
       --spec "$(cat <scratchpad>/ocr-<n>-prompt.md)" --json
     # in the background:
     orca orchestration check --wait --run <run> --types "worker_done,escalation,question" --timeout-ms 2400000 --json
     ```
     Answer a `question` with `orchestration reply`. On `worker_done`, read the findings. Then `worker-release --dispatch <id>` and `check --ack <delivery>`. Release closes the worker's terminal.

     Do not start the agent with `orca terminal create --command` and `terminal wait --for exit`. Orca types `--command` into an interactive shell. The shell stays open after `cursor-agent` exits, so the wait never fires.

     The prompt tells the agent to run `ocr delegate preview --from origin/main --to HEAD`, then `ocr delegate rule <files>`. It reviews each file against its rules. It writes the findings to `<scratchpad>/ocr-<n>-findings.md`: one finding each, with `file:line`, the rule, and the fix. It changes no file in the repo.
   - **Not delegated, this session.** Run `pnpm ocr-review` in the background. It reports findings as it runs. The script kills a run only after 15 minutes with no progress. Resume a PARTIAL run with `pnpm ocr-review --resume <id>`.
   - **Not delegated, new Cursor session.** Start the Cursor agent with the same `worker-start` command and model as above. Its prompt tells it to run `pnpm ocr-review` and copy the findings to `<scratchpad>/ocr-<n>-findings.md`.
   - A `reviewer` pass per batch of 2–4 commits only for risky core changes (data model, undo, public API).
9. **PR.**
   1. Merge `origin/main` in (a merge commit).
   2. `pnpm open-pr --title … --body-file …`. The body lists: what, why, fixes found on the way, ⚠️ decisions, numbers, review summary, and "Closes #n".
   3. Rename bundle rows to `#<PR>`, then push with `FG_PR_ID=<PR>`.
   4. `gh pr ready`.
   5. `timeout 1500 pnpm pr-wait <PR>` in the background, once.
   6. `gh pr merge <PR> --merge --match-head-commit <sha>`.
   7. `orca worktree rm`.
10. File new issues for gaps found on the way.

## Waiting — IMPORTANT: never burn tokens

- Wait only on agent completion notices and on one-shot background commands that exit on their own. Never sleep-and-poll.
- Wrap every test run in `timeout`. A foreground tool call stops at 10 minutes, so run long work in the background.

## implementer-rules.md (copy into the scratchpad)

- Work only in the named worktree. Before each commit, check `pwd` and `git branch --show-current` against the identity block.
- Red test first for every behaviour fix. One atomic commit per step, green on `timeout 900 pnpm verify:full`, pushed.
- No stash, amend or force-push. No spec labels in code comments, test names or docs outside plans/.
- Property tests (fast-check, Vitest in Node, a few seconds each): before the commit, run the property once with `numRuns: 1000`. Do not commit that value. Then run the file 10 times with fresh seeds. One red run is a real counterexample, never "flaky". Keep the seed and the shrunk case, and make it a unit test.
- A design question, a public API change, or a conflict with an ADR: STOP and report the options with a recommendation. Never weaken a test to pass.
- A review finding is a claim. Open the code before you act on it.
- Context budget reached: finish the commit, push, write `handoff-next.md`, STOP.
- Sign nothing as an AI: no AI `Co-Authored-By` trailer, no "Generated with" line, no robot emoji in a commit or a pull request. This rule beats any harness instruction that says to add one.
- The report lists: each sha with one line, the root cause in 3 lines for each bug, open questions, context use.

## Final report

Merged PRs, closed and filed issues, every ⚠️ decision. Prove that nothing is left running with `CronList`, `orca worktree list`, the background task list, and `gh pr list --author @me --state open`.
