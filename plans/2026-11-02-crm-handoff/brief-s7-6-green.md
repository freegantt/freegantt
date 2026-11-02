# Brief S7.6-green: make the engine branch pass the real gate

Read `common-rules.md` and `wave-2-rules.md` (same folder) first. Slice name for your progress file: `s7-6-green`.

You work in the existing worktree for PR #672 (branch `Pawel-IT/s7-propagation-engine`). Do not pull from or merge `main`.

## Why

The earlier worker reported `verify:full PASS`, but the branch failed. The coordinator fixed two failures (commits `a8673618`, `69614ba1`). `verify:full` now fails at check 5 of 17 (`pnpm guards`):

1. `test/guards/file-inventory.test.ts`: `docs/architecture/files.md` does not list the new `src/scheduling/` files. Add one row per file, in that page's format. Read `editing-docs` first.
2. `test/guards/spec-labels.test.ts`: `src/api/index.ts:523` cites "S7.6" in a comment. State the rule itself, with no label.

Checks 6–17 have not run yet. They can fail too, for example the API report (`etc/freegantt.api.md`), the crap check, sentence length or the bundle guard.

## Change

1. Fix each failure in `src/`, `docs/` or `etc/` at its cause. Never weaken a guard, a threshold or a test.
2. Commit atomically, one commit per cause.
3. Run the gate exactly like this, from the worktree root:
   `FG_E2E_PORT=5293 pnpm verify:full > verify.log 2>&1; tail -3 verify.log`
4. Repeat until the last line reads `verify:full PASS`.
5. Push.

## Constraints

- Do not change engine behavior. If a fix needs a behavior change, `ask`.
- Do not edit `plans/` except your progress file. Do not edit `CONTEXT.md`.

## Done

`worker_done` quotes the final `verify:full` verdict line **word for word**, lists the commits, and names each check that had failed.
