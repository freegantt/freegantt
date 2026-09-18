# FreeGantt — Hooks, CI, and Guard Tests

The execution layer: which command runs where, what blocks what, and how we keep the guards themselves honest.

**One rule governs this whole document: hooks and CI run the *same* npm scripts.** A hook that runs a slightly different command drifts, and the drift always resolves as "passes locally, fails in CI."

---

## 1. The script surface

Everything is a `package.json` script; hooks and CI only ever call these.

| Script | Command | Typical time |
|---|---|---|
| `format` / `format:check` | `prettier --write .` / `--check .` | <2s |
| `lint` | `eslint .` (type-aware) | ~10s at S2 scale |
| `lint:file` | `eslint --max-warnings 0` on `$1` | <2s |
| `typecheck` | `tsc --noEmit` | ~5s |
| `boundaries` | `depcruise --config .dependency-cruiser.cjs src harness` | ~3s |
| `test:node` | `vitest run --project pure` | seconds |
| `test:dom` | `vitest run --project dom` | seconds |
| `guards` | `vitest run test/guards` + `scripts/guard-red-test.mjs` + `eslint/rules/*.test.js` | ~10s |
| `vendor-names` | `scripts/check-vendor-names.mjs` | <1s |
| `disables` | `scripts/audit-disables.mjs` | <1s |
| `api-report` | `node scripts/api-report.mjs` (`api-extractor run`, `--local` when updating; shipped S2.7, name corrected from the plan's `api:report`) | ~10s |
| `verify` | the check chain in `package.json` — every check except the browser one | ~60s |
| `verify:full` | `node scripts/verify-full.mjs` — the `verify` chain, then `test:e2e`. **The gate** | ~75s |
| `open-pr` | `node scripts/open-pr.mjs` — pushes the branch, opens a draft pull request (§5.2) | ~5s |
| `measure:scale` | `node scripts/measure-scale.mjs` — the scale measurement. **Not a check** (§1.1) | ~40s |

`pnpm verify` is the **browser-free chain**: every check except `test:e2e`. It is a stage of the gate, not the gate.

`pnpm verify:full` is **the gate**. Three callers run it, and none of them runs anything else: an agent proving a change, `.githooks/pre-push`, and CI (§5). It reads its check list from the `verify` script at run time, so no caller can drift from another (§3.2).

### 1.1 `measure:scale` reports a number and judges nothing

Every other script on that table answers pass or fail. `pnpm measure:scale` answers "how much", and that is why no hook and no CI job calls it.

The reason is issue #95's, and it is not squeamishness about slow tests. A frame-time assertion is a claim about the machine that ran it. A CI runner is shared, noisy and not the reference hardware S6's budgets will name, so such a test fails on a busy runner and passes on a quiet one, with the same code. That test teaches a team to re-run the build until it goes green, which costs more than the regression it was meant to catch. S1.11 already rejected CI timing assertions once, for `[S1-A1]`. Budgets arrive when S6 names them and names the hardware (`plans/s6-scale-and-sync/README.md` §5.1).

```bash
pnpm measure:scale              # headless
pnpm measure:scale --headed     # watch it scroll
```

It starts its own dev server on port 5174 — set `FG_MEASURE_PORT` if that port is taken — opens `harness/large-dataset.html`, and scrolls the timeline pane for 240 frames on each axis. Then it scrolls once more at 4x CPU slowdown, which is what turns a median into a cost on a machine with headroom. It prints:

- **Frame time**, as p50 / p95 / max, with a count of frames over 32 ms. Read the tail, not the median: an unthrottled run on a fast machine reports the display's cadence, about 16.7 ms, whatever the work costs.
- **Script milliseconds per frame**, unthrottled and throttled. This is the honest cost number, because it is a CPU accumulator rather than a wall-clock sample.
- **Nodes, listeners and heap** after a forced collection.

It writes two files under `measurements/` (git-ignored): a summary JSON, and a Chromium trace to open in the browser's Performance panel.

**It refuses a port that already answers.** An earlier version did not, silently reused a server left over from the previous run, and produced a page of numbers measured against the wrong code. That is the same false green `scripts/e2e-worktree-port-guard.mjs` exists to refuse (§5), and the fix is the same: fail loudly rather than measure the wrong thing.

**What it cannot do.** A scripted `scrollTop` write is not a real wheel or trackpad scroll. A headless run is not reference hardware. Which call stacks are ours, and whether a layout was forced, is Performance-panel work — which is what the trace file is for, and why #95 asks a person to read it.

---

## 2. Claude Code hooks (`.claude/settings.json`, committed)

Agent-time enforcement. The value here is specific: a violation surfaced **inside the turn that wrote it** gets fixed with full context, while the same violation surfaced in CI twenty minutes later gets fixed by re-derivation. Exit code `2` blocks the tool call and returns stderr to the model, so the message text matters — every guard message cites its spec section (`02-lint-rules.md` §4) precisely so the agent is pointed at the governing text instead of inventing a workaround.

```jsonc
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": ".claude/hooks/check-file.sh", "timeout": 30 }]
    }],
    "PreToolUse": [{
      "matcher": "Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": ".claude/hooks/protect-spec.sh" }]
    }, {
      "matcher": "Bash",
      "hooks": [
        { "type": "command", "command": ".claude/hooks/require-draft-pr.sh" },
        { "type": "command", "command": ".claude/hooks/require-pr-wait.sh" }
      ]
    }]
  }
}
```

### 2.1 `check-file.sh` — PostToolUse

Reads the hook payload from stdin, takes `tool_input.file_path`, and for `src/**/*.ts` runs, in order, stopping at the first failure:

1. `prettier --write` on the file (silent fix — formatting is never worth a turn)
2. `pnpm lint:file <path>` — the full rule set including type-aware rules, scoped to one file
3. `pnpm boundaries` if the edit added an `import` statement (cheap enough, and the ESLint mirror B11 catches most of it already)

Exit `2` with the ESLint output on stderr when any step fails. Non-`src` edits exit `0` immediately — the hook must never tax editing docs or fixtures.

**Deliberately not in this hook:** `tsc --noEmit` (whole-program, too slow per edit) and the test suites. Those belong to §2.3 and CI.

### 2.2 `protect-spec.sh` — PreToolUse

Blocks (exit `2`) with an explanatory message when the edit targets:

| Target | Message |
|---|---|
| `plans/**` | `plans/ is the spec. Locked decisions D1–D12 change by explicit human decision, not as a side effect of implementation. Ask first.` |
| `package.json` → `dependencies` | `Exactly one runtime dependency is allowed (plans/04 §1). Rejected candidates and their reasons are documented there.` |
| `eslint.config.js`, `.dependency-cruiser.cjs` when the diff only *removes* rules | `Loosening a guard is a spec change. Say which invariant is being relaxed and why.` |

The third check is the important one: the failure mode this whole system has to survive is an agent (or a tired human) resolving a guard failure by deleting the guard. It cannot fully prevent that — a determined caller edits the file in a way the heuristic misses — but it converts the easy path into a conversation, and the CI `disables` job plus review catch the rest.

### 2.3 `require-draft-pr.sh` — PreToolUse on `Bash` (#255)

Blocks `gh pr create`, and the `gh api … /pulls` call behind it. Exit `2` returns a message naming `pnpm open-pr`, which opens the same pull request as a draft (§5.2). `gh pr ready`, `gh pr merge`, `gh pr view` and every other subcommand pass through.

Why a hook, and not a line in this document: an agent runs the command it was given, and a rule it must remember breaks on a busy turn. The draft rule decides whether CI spends minutes, so it gets enforcement rather than prose.

It reads the command text, so a heredoc that only *writes* those words is blocked too. The message says to use the Write or Edit tool for that. A false block costs one turn; a missed create spends minutes on unfinished work and asks for a review nobody wanted.

### 2.4 `require-pr-wait.sh` — PreToolUse on `Bash`

Blocks a hand-written CI wait, and names `pnpm pr-wait <n>` instead (§5.2). Exit `2` returns the
reason: a poll written on the spot reads check suites or a status field, then exits before the gate
has run. A wait that never waited looks exactly like one that ran.

Scope is narrow on purpose, because a hook people route around enforces nothing. Only the *fake*
waits are refused: a loop around a status read, a `sleep` beside one, and `--watch` on the pull
request's check suites. Single reads pass — a run list, a log read, one JSON read of the checks. So
does `gh run watch <id>`, which really does block and is the only tool for a `workflow_dispatch`
run, because a dispatch run has no pull request and so no `pr-wait`.

Why a hook, and not a line in this document: the session that wrote `pr-wait` hand-rolled a status
loop afterwards anyway. A rule an agent must remember breaks on a busy turn, and this rule decides
whether a red gate gets reported as green.

Like the draft-PR hook, it reads the command text, so a heredoc that only *writes* those words is
blocked too, and the message says to use the Write or Edit tool for that.

### 2.5 Optional: `Stop` hook

A `Stop` hook running `pnpm verify` when `git status --porcelain src/` is non-empty gives a clean end-of-turn signal. **Recommended off by default** and enabled per-preference: on a fast machine it is 45 seconds of latency at the end of every turn, and the PostToolUse hook plus CI already cover the same ground. Documented here so the choice is deliberate rather than absent.

---

## 3. Git hooks (`.githooks/`, no dependency)

Enabled by `git config core.hooksPath .githooks`, set by a `prepare` script so it applies after `pnpm install`. No husky, no lint-staged — two shell scripts.

| Hook | Runs | Rationale |
|---|---|---|
| `pre-commit` | `format` (auto-fix) on staged files, **except partially staged ones** + `lint` on staged `*.ts` + `vendor-names` | Fast (<5s), catches the trivia; auto-fixes formatting instead of blocking on something `pnpm verify` would just fix anyway |
| `pre-push` | `pnpm verify:full` (`verify`, then `test:e2e`) | The full gate before it becomes anyone else's problem. CI runs the same command on a ready pull request (§5); this half is faster, and it also covers a push that never becomes one |

### 3.0 A partially staged file is never formatted (#203)

`prettier --write` edits the working tree, so the hook must re-stage what it formatted. `git add -- <file>` stages that file **whole**. On a file the author staged in part — `git add -p`, `git apply --cached`, an editor's stage-this-hunk — that commits the hunks they left out, under their message.

So the hook skips any file that is both staged and unstaged-modified, and says which on stderr. That file commits unformatted; `pnpm format:check` in `verify` still catches it. Losing a format pass is a nuisance. Committing someone else's sentence under your name is a correctness failure.

The warning names the **intersection** only, never every dirty file. A warning that fires on most commits is a warning people stop reading.

`--no-verify` exists and is not fought. Since #255 the old rationale holds again ("CI is the authority; hooks buy latency"): the server runs the whole gate on every pull request that asks for review (§5), so a skipped hook costs a red run rather than a silent landing. Two gaps stay local, by design. A draft runs nothing, and a push that never becomes a pull request is never proved on the server.

### 3.1 e2e runs in the gate, and the gate runs on the server too (#255)

`pnpm test:e2e` sits outside `pnpm verify` and inside `pnpm verify:full`. Playwright owns what happy-dom cannot express: a real engine clamps `scrollTop`, fires `scroll`, and lays out. Two of the five S1 acceptance boxes are e2e tests (`[S1-A1]`, `[S1-A4]`), and `scripts/slice-gate.mjs` shells out to `pnpm test:e2e` for both, so an unrun e2e suite makes the S1 gate unprovable.

For a long time nothing ran it on the server. Every trigger in `.github/workflows/ci.yml` was off by decision (D-S1.11-12), so `pre-push` was the only thing between a broken invariant and `main`. That is the half of #255 the `verify:full` wrapper could not close: the wrapper fixed what an agent proves, and left the pull-request page with no signal at all.

The owner took the trigger decision on 2026-09-13, and CI now runs the whole gate — `test:e2e` included — on every pull request that asks for review (§5). `plans/s1.11-close-the-gate/README.md` still records D-S1.11-12 as it stood. A plan records what was decided then; this section records what holds now.

`pre-push` stays, and it stays as the same command. It is the faster half, because a failure surfaces before the push rather than after a wait on a runner. It is also the only half that covers a push nobody opens a pull request for.

`verify` still excludes e2e. It is the browser-free chain the wrapper builds on, and folding e2e in would demand a browser everywhere `verify` runs. The gate is the wrapper, and the wrapper is what every caller runs.

The cost is small: the whole suite runs in seconds, and `playwright.config.ts` starts its own dev server. The failure mode that is *not* a real failure — a missing browser binary — gets its own message pointing at `pnpm exec playwright install chromium`.

Before #255 the hook ran the two halves as two lines, and everyone else ran only `verify`. So the hook and the agent proved different things, and the agent's half was the one that reported completion.

### 3.2 The last line is the verdict (#255)

An exit code only reaches a reader who transcribes it, and the pattern this repo used transcribed the wrong one:

```bash
pnpm verify 2>&1 | tail -4; echo "EXIT: $?"      # `$?` is tail's status. Prints EXIT: 0 over a failure.
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log   # correct — redirect, and read the verdict
```

Two agents hit this on #142. Both reported green, both told the truth, and `e2e/resize.spec.ts` was fully red. The failure surfaced at the push, after the review and after the merge.

Documenting the capture rule is not enough on its own: it is exactly the instruction a tired reader skips. So `verify:full` states its own result **inside the output stream**, where no plumbing strips it. Every run prints exactly one verdict line:

```
verify:full PASS — all 16 checks green, test:e2e included (58s).
verify:full FAILED at check 7 of 16: pnpm test:dom (exit code 1). 9 later checks did not run. (21s)
```

It is the last line the gate itself prints. `pnpm` adds one `[ELIFECYCLE]` line after it on a failure, which is why the capture above reads three lines, not one.

Three properties follow, and they are the reason this is a script rather than a `&&` chain:

- **Every window onto the run carries the verdict.** A redirect, a `tail -3`, or the whole log — all show it. Even the wrong capture above now prints `EXIT: 0` two lines under a line that says `FAILED`.
- **Green needs a positive token.** The completion test is "quote the last line", not "report a number". A run that a signal kills, or a pipe truncates, has no verdict line, so it reads as **unproven** — never as green.
- **The failing check names itself.** `[ELIFECYCLE] Command failed with exit code 1` says a step failed, not which one, and says nothing at all when the run passes.

The wrapper never holds its own copy of the check list. It parses the `verify` script and appends `test:e2e`, so a new CI job joins the gate the moment it joins `verify`. A `verify` step it cannot parse, or a check no script defines, is a loud failure — never a silently skipped check.

---

## 4. Guard tests — testing the guards themselves

The rule that makes this system trustworthy rather than decorative: **a guard with no failing fixture is presumed broken.**

| Guard type | Its own test | Fails the build when |
|---|---|---|
| Custom ESLint rules | `eslint/rules/<id>.test.js` via `RuleTester`, ≥2 valid + ≥2 invalid cases each, invalid cases asserting the exact `messageId` | a rule stops matching, or its message drifts from the spec citation |
| Builtin-restriction configs (B1–B11) | `test/guards/lint-fixtures.test.ts` — runs ESLint programmatically over `test/fixtures/violations/*.ts` and asserts the expected rule id fires on the expected line | a `files:` glob is edited so a rule silently stops covering a directory |
| dependency-cruiser graph | `scripts/guard-red-test.mjs` (`03-boundaries-and-config.md` §1.3) | the graph config is loosened or the tool is misconfigured |
| Purity of the pure layers | `test/setup/assert-no-dom.ts` throwing | a pure module reaches for the DOM |
| The matrix itself | `test/guards/matrix-coverage.test.ts` — parses `docs/01-invariant-guard-matrix.md`, asserts every I1–I14 row names a gate check that runs, and that no row's status is blank; **and** (S1.11, D-S1.11-11) that every `freegantt/*` rule named in the Mechanism column of both §1 and §2 is registered in `eslint/rules/index.cjs`, unless it is honestly marked `PLANNED (Sn)` | an invariant loses its job, a job is renamed, or a row claims a rule is enforced when no rule file exists |
| One gate, every caller | `test/guards/gate-is-one-command.test.ts` — asserts CI runs `pnpm verify:full` and no single check beside it, that `pre-push` runs that same command, that the check list derives from `verify`, and that the workflow asks for `ready_for_review` and skips a draft | a caller starts proving a subset of the gate, or the draft rule stops holding |
| The pr-wait hook | `test/guards/require-pr-wait.test.ts` — six hand-rolled waits are blocked, ten neighbouring commands pass, and the refusal names `pnpm pr-wait` | the hook stops blocking the poll, or starts blocking a log read or `gh run watch` |
| The draft-PR hook | `test/guards/require-draft-pr.test.ts` — five ways to create a pull request are blocked, six neighbouring commands pass, and the hook is registered and executable | the hook stops blocking, or starts blocking `gh pr ready` and its neighbours |
| The S1 → S2 gate itself | `test/guards/slice-gate.test.ts` (S1.11, plans/s1.11-close-the-gate/README.md §3.4) — drives `tagged()` against a temporary fixture: an id present with a passing runner passes; an id absent from source fails; an id present whose declared runner fails also fails | a gate check stays green after its subject is deleted — U2's own scenario |

That last one deserves emphasis: it closes the loop `plans/04` §4 opens ("an invariant without a job is a TODO, tracked in the table itself"). The table stops being prose and becomes a checked artifact.

### 4.1 `scripts/guard-red-test.mjs` — the red-test cases

Each call writes one deliberate violation, asserts the guard it targets — `depcruise` for a boundary
or leaf rule, `eslint` for the two ESLint-only #287 cases below — fails on it, then deletes the file.
A case with no failing fixture is presumed broken (the rule this whole section states):

| Case | Rule it proves |
|---|---|
| `scheduling/ -> render/` | `scheduling-boundary` — D4, `scheduling/` never reaches a DOM layer |
| `interaction/ -> layout/` | `interaction-boundary` — P3's one-arrow widening (`model/` only) stays to one arrow |
| `rollup-is-removable: second importer` | `rollup-is-removable` — the Rollup leaf keeps exactly one legal importer |
| `dataset-change-subscription-is-removable: second importer` | `dataset-change-subscription-is-removable` — same shape, S2/S4 leaf |
| `history-is-removable: second importer` | `history-is-removable` — same shape, undo/redo leaf |
| `extensions/ -> view/` | `extensions-public-only` — D-S5-5's dogfood gate: a built-in feature may see only `api/` and `model/` |
| `render/ -> data/transaction.js` | the `data/dev-mode.ts` leaf widening stays scoped to that one file, not `data/` generally |
| `extensions/ -> data/transaction.js` | same, from the `extensions/` side |
| `harness/ -> src/` (an internal, `import '../src/layout/bars/variants.js'`) | `harness-public-api-only` (#287) — dependency-cruiser blocks a relative reach *past* the published `freegantt` specifier's target |
| `harness/ -> src/api/index.ts` by a relative path, and the same by a type-position inline `import(...)` | `eslint.config.js`'s `harness/`/`e2e/`/`fixtures/` block (#287, review finding F7) — dependency-cruiser matches *resolved* paths, so its one exception (`pathNot: '^src/api/index\.ts$'`, for the `freegantt` alias) can't tell that alias from a relative path naming the same file; this ESLint rule reads the specifier text instead, which is the only place that distinction is visible. `e2e/variant-styles.spec.ts` shipped the type-position case uncaught — belt and braces with the cruiser rule, not a replacement |

### 4.2 Violation fixtures

`test/fixtures/violations/` holds one small file per rule, each a deliberate violation with a header comment naming the rule it must trigger. They are excluded from `tsconfig`'s program and from `src/` globs. The directory doubles as documentation: "what does this rule actually catch?" is answered by reading one file.

---

## 5. CI pipeline

One workflow, one job, one command. `.github/workflows/ci.yml` runs `pnpm verify:full` on `ubuntu-latest`, with `pnpm` on a frozen lockfile and Node pinned by `.nvmrc`.

**Why one job.** GitHub bills a job by the minute and rounds up. The shape before #255 was eleven jobs, and each one paid for a checkout and an install before it did about ten seconds of work — roughly twenty billed minutes for a gate that runs in about one. Steps inside a job are free. The fan-out bought a prettier failure page, and the verdict line already names the check that stopped the run (§3.2).

**Why one command.** The workflow holds no check list of its own. `pnpm verify:full` reads the list out of `package.json` at run time, so a check joins CI the moment it joins `verify`, and CI cannot run a spelling of the gate that nobody runs locally. `test/guards/gate-is-one-command.test.ts` fails the build when the workflow runs a single check beside the gate.

**Triggers.** Pull requests, plus `workflow_dispatch`:

| Event | Runs | Why |
|---|---|---|
| `opened`, `reopened` | Only when the pull request is not a draft | The draft rule (§5.2). Work in progress spends no minutes |
| `ready_for_review` | Yes | Not a default type, so the workflow lists it. This is the first run for most pull requests here |
| `synchronize` (a push to a ready pull request) | Yes | The reviewed commit is the one that must be green |
| A push to `main` | No | It lands a merge this workflow just proved |

`main` moving under a branch is the one case where a green run goes stale. Branch protection's "require branches to be up to date before merging" re-runs the gate exactly then, and never otherwise.

**Caching.** Two caches, and a dependency change is the only thing that busts either:

| Cache | Key | Effect |
|---|---|---|
| `node_modules` | `.nvmrc` + `pnpm-lock.yaml` | A run that changes no dependency installs nothing. Caching the directory, rather than the pnpm store, removes the link step too |
| `~/.cache/ms-playwright` | the Playwright version, read from the install | Chromium downloads only after a Playwright bump. `--with-deps` runs on a miss; the runner image carries the system libraries a hit needs |

`concurrency` with `cancel-in-progress` kills a superseded run, so a second push never pays twice. `timeout-minutes: 20` caps a hung browser.

**Rules for the pipeline itself:**

- **No `continue-on-error`.** A check that can be yellow is a check that is off. The gate has one exit code and one verdict line.
- **A measurement is not a guard.** `size-limit` before S5, and `perf` before S6, measure. They are labeled as measurements where they are declared, not as guards.
- **`api-report` failure is not a bug**, it is a semver decision: the fix is either "revert the surface change" or "commit the updated report and say so in the pull request." The check's message says exactly that.
- **Required check on `main`: `gate`.** One job, so one required check. Later slices add `axe` (S5) and `perf` (S6) as checks inside the gate, never as jobs beside it.

### 5.1 Slice gates

`plans/00` §4 defines a gate between every pair of slices. `scripts/slice-gate.mjs` reads the current slice from a committed `.slice` file and runs that gate's mechanical conditions, printing the human-only items as an explicit checklist rather than silently ignoring them:

```
$ pnpm gate
S0 → S1 gate
  ✔ boundaries lint active and failing on violation (red test)
  ✔ layout tested headlessly (test:node: 14 passed)
  ☐ HUMAN: harness renders fixture bars   ← check before advancing .slice
```

Bumping `.slice` is a reviewed commit. That is the enforcement: you cannot start S2 work without a commit that says the S1 gate was met, and that commit is where a reviewer asks about the `☐` items.

---

### 5.2 Pull requests open as drafts (#255)

`pnpm open-pr` is how a pull request opens here. `.claude/hooks/require-draft-pr.sh` blocks the raw create command (§2.3).

```bash
pnpm open-pr --title "<title>" --body-file <path>   # pushes the branch, then opens a DRAFT
pnpm open-pr --ready                                # the decision to merge — this starts CI
pnpm pr-wait <n>                                    # waits for the gate, states the result in one line
```

The draft is not a formality. It is what the trigger set reads:

- **A draft runs nothing.** Minutes go to work that asks for review, never to work in progress.
- **"Ready" says one thing.** This is up for review, and it is meant to merge. Nobody guesses whether a pull request wants eyes.
- **The push proves the work first.** `open-pr` pushes, so `pre-push` runs the gate before the pull request exists. CI then re-proves it on a clean runner.

So: open every pull request as a draft, and mark it ready only when it is the merge decision. A branch that waits stays a draft, and costs nothing while it waits.

**`pnpm pr-wait` watches workflow runs, not check suites.** Every draft push, and the close event, still creates a workflow run whose `gate` job is skipped. Those rows share the required check name, so `gh pr checks` reports "nothing started" while `gh run list` already shows a live `pull_request` run — or prints `pass` from `--watch` and returns empty JSON on the re-read. Both happened on #420. `pr-wait` lists CI runs for the pull request's head commit (`gh run list --commit <sha> --event pull_request --workflow ci.yml`), ignores skipped and cancelled rows, and gives the waiting to `gh run watch`.

**Do not dispatch a workflow to close a `pr-wait`.** `gh workflow run ci.yml --ref <branch>` is `workflow_dispatch`. That run is on the branch, not the pull request, so it cannot close this wait. Concurrency is keyed on the branch name, so the dispatch also cancels the live `pull_request` run. On #415 that is exactly what happened: `pr-wait` said SKIPPED while the gate was two minutes in, the fallback fired, and concurrency killed the real job. If no live `pull_request` run appears, push a commit so `synchronize` fires, then run `pr-wait` again.

**A `workflow_dispatch` run proves the gate and cannot close a `pr-wait`.** Read its verdict from `gh run list --branch <branch> --workflow ci.yml`, and say plainly that the verdict came from a dispatch run rather than from `pr-wait` — a run with no `pr-wait` verdict line is proven differently, not proven green. To get a `pr-wait` verdict back, push a commit.

---

## 6. What this costs

Worth stating, because a guardrail system that nobody wants to run is a guardrail system that gets bypassed:

| | Time |
|---|---|
| Per agent file-edit (PostToolUse) | ~2s |
| Per commit (pre-commit) | ~5s |
| Per push (pre-push, `verify:full`) | ~75s at S5 scale, e2e included |
| Per ready pull request (CI, one job) | ~3 min wall clock, ~4 billed minutes |
| Per draft pull request (CI) | nothing — the job does not run |
| Build-out cost | ~2 days of S0, of which the 9 custom rules are ~1 day |

The type-aware ESLint pass dominates local lint time and grows with the codebase. If `lint` crosses ~30s, the response is to split the type-aware rules into a separate `lint:types` script run at pre-push and CI only, keeping the per-edit hook syntactic and fast — not to drop rules.
