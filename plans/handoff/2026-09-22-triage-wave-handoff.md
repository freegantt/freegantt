# Handoff — the 2026-09-22 triage wave

Read this first after the token reset. It says what is done, what is left, where each piece of
information lives, and what the owner still has to decide.

## Update, 2026-09-22 evening: every lane merged

All five lanes are fixed, reviewed and merged. Each worktree is removed. Sections 0, 2, 2.1 and 3
items 1–4 below are history. The work left starts at §3 item 5.

| Pull request | Squash commit | Issues |
|---|---|---|
| #493 | `a0da5197` | #400 closed (the `prepare` build is a stopgap until #442) |
| #494 | `c193958a` | #429 and #407 closed |
| #498 | `9e6c86a2` | #406 closed. #414 part one and the #95 scroll numbers landed. Both issues stay open |
| #499 | `d1d3928d` | #489 closed |
| #501 | `73d1aae5` | #472 and #242 closed |
| #502 | `dc2fbae9` | #335 closed. #101 items 1–2 landed. Item 3 stays open |

**Owner rulings, answered this evening (§4):**
- Item 3, the #489 anchor: a stepped tick counts from the next larger unit. A step that does not fit
  in that unit counts from one fixed origin.
- Item 9a, the #101 presets: hold `fifteenMinute` and `sixHour` until #489. They shipped in #502,
  after #499.
- Item 9, push and pull requests: yes.
- New: `gantt.preset = '<id>'` also finds a preset in this Gantt's own `zoomPresets`. This reverses
  Design #11 for that door.

**Harness rule (owner):** `harness/e2e/` holds pages that exist only for e2e tests. The `harness/`
root holds the themed demo pages.

**Open item from #502:** the four #101 presets show only on the e2e zoom fixture
(`harness/e2e/zoom.ts`). No themed demo page has a picker for them yet.

## 0. Start here

1. **Do not merge any lane branch until its review findings are fixed** (§2.1). The review is
   `plans/reviews/2026-09-22-ocr-delegate-ready-issues.md`.
2. Ask the owner the open questions in §4. Each has a recommendation.
3. Ask the owner: "May I push the five branches and open a pull request for each?" (§4, item 9).
   A pull request may open before the fixes land. It must not merge before them.
4. Then work the list in §3, in order.

## 1. Where the information lives

| What | Where |
|---|---|
| The triage of all open issues (four buckets) | `plans/issue-triage-2026-09-22.md` |
| The fix-now plan and the full decision record | `plans/fix-now-2026-09-22.md` (§4 = steps per issue, §6 = decision record) |
| This handoff | `plans/handoff/2026-09-22-triage-wave-handoff.md` |
| The triage branch | `Pawel-IT/issue-triage`, worktree `/home/pawel/orca/workspaces/freegantt/issue-triage`. Committed locally, **not pushed**. |
| The status of each issue that was worked | A comment dated 2026-09-22 on each issue. Each one gives branch, commit, what is done and the next step. |
| Each ruling | A comment headed "Decision (owner, 2026-09-22)" on its issue |
| The code | Five local worktrees, one per lane (§2). **None is pushed.** |
| The #95 trace | `/home/pawel/orca/workspaces/freegantt/406-scale-10k/measurements/2026-09-22T19-32-23-416Z-scroll-trace.json` (gitignored) |

The session scratch folder (`/tmp/claude-1000/...`) held the gate logs. It may be gone after the
reset. Each gate verdict is copied into the issue comments.

## 2. The five lanes

| Lane | Worktree (`/home/pawel/orca/workspaces/freegantt/…`) | Branch | Commits | Gate |
|---|---|---|---|---|
| A | `400-pack-install` | `Pawel-IT/400-pack-install` | `e0a18972` (#400) | `verify:full PASS — all 17 checks green` |
| B | `406-scale-10k` | `Pawel-IT/406-scale-10k` | `961b0e91` (#406), `81e80c20` (#414 part one), `284907ca` (#95 numbers) | `verify:full PASS — all 16 checks green` |
| C | `429-docs-truth` | `Pawel-IT/429-docs-truth` | `dda983c4` (#429), `aa05cbf2` (#407) | `verify:full PASS — all 16 checks green` |
| D | `472-time-helpers` | `Pawel-IT/472-time-helpers` | `2c145dde` (**WIP**: all of #472, half of #242) | **Not run. The commit does not type-check.** |
| E | `335-coverage-presets` | `Pawel-IT/335-coverage-presets` | `cc18c602` (#335), `661995a3` (#101 items 1–2) | `verify:full PASS — all 16 checks green` |

**Merge-order risks.** Lanes D and E both regenerate `etc/freegantt.api.md`. Lanes A and B both
edit `plans/03-slices.md` and the S6 README. Merge one branch, rebase the next onto `main`, and
regenerate the API report (`pnpm build`, then `pnpm api-report`). Do not hand-merge the report.

### 2.1 Merge block: the OCR review findings

`plans/reviews/2026-09-22-ocr-delegate-ready-issues.md` reviewed each lane commit. **No branch
merges until every finding on its commits is fixed and `verify:full` passes again.** The review
edited no file. Fix each finding in the lane's own worktree, as a new commit on that branch.

| Branch | Issue | Severity | Finding | Fix |
|---|---|---|---|---|
| `Pawel-IT/400-pack-install` | #400 | **High** | `prepare` does not build, so an npm git install still has no `dist/`. The commit message claims it works. | Add the library build to `prepare` (a temporary stopgap, see #442). Re-run the npm `git+file://` experiment. Correct the commit message claim in the pull request body. |
| `Pawel-IT/400-pack-install` | #400 | Medium | `check-pack-install.mjs` hides the vite log when `pnpm pack` or `pnpm add` fails. | Print `error.stderr` in the catch, before the temp folder is removed. |
| `Pawel-IT/472-time-helpers` | #472, #242 | **High** | WIP `2c145dde` does not type-check. `operation` is missing at `src/time/zoned-time.ts:69,70` and `src/api/gantt.ts:414,421,428,928,934`. `src/time/input.test.ts` still expects the old messages. | §3 item 4. Then split the commit into one per issue. |
| `Pawel-IT/335-coverage-presets` | #335 | Medium | The empty-menu `ArrowDown` test dispatches on `document`. `onDomEvent` ignores a target the Gantt does not own, so the test passes without reaching the handler. | Dispatch the key on the open menu or an item in it. Prove it red by breaking the handler. |
| `Pawel-IT/335-coverage-presets` | #101 | Medium | `fifteenMinute` (`tickIncrement: 15`) and `sixHour` (`tickIncrement: 6`) hit #489's gridline shift on pan. | **Owner decision:** hold the two presets until #489's anchor fix, or ship them with the limit written down. Recommendation: hold them. Ship `minute` and `dayLetterAndWeek` now. |
| `Pawel-IT/406-scale-10k` | #95 | Medium | The S6 README table (4.24 ms / 18.85 ms) and the `81e80c20` message (4.43 ms / 20.66 ms) record different numbers for the same run. | Pick one pair, name the run, and make the commit message and README agree. |
| `Pawel-IT/406-scale-10k` | #406 | Low | `harness/large-dataset.html` still says `zoom: 'preset'`. The option is `fit: 'preset'`. | Change the word. |
| `Pawel-IT/429-docs-truth` | #429, #407 | — | No defect. | This branch may merge once pushed. |

#414 part one (`81e80c20`) has no defect, but it shares a branch with #95 and #406. The branch merges
as one after those two fixes.

The issues above carry `fixed needs review`. Leave that label on until the fix lands and a person
reads it.

## 3. Work left, in order

1. **Fix the review findings in §2.1**, one commit per finding group, in each lane worktree. Run
   `verify:full` again on each branch (keep the lane's `FG_E2E_PORT`: A 5181, B 5182, C 5183,
   D 5184, E 5185).
2. **Push and open pull requests** for lanes A, B, C and E, after the owner approves. Merge only
   after step 1 is done for that branch. Follow
   `docs/agents/pull-requests.md`, and use `pnpm pr-wait <n>` for CI. Then comment on each issue
   with the pull request, as `.claude/skills/label-issues/SKILL.md` §4 asks.
3. **#400 follow-up (lane A worktree).** npm runs only `prepare` for a git dependency, never
   `prepack` (`pacote/lib/dir.js`). The ruling says `prepare` also runs the library build (about
   3 s) beside the hooks setup, until the first registry publish (#442). Then run the npm
   `git+file://` experiment again, then `FG_E2E_PORT=5181 pnpm verify:full`.
4. **#242 (lane D worktree).** The steps are on the #242 comment:
   1. Pass `operation` at `src/api/gantt.ts` (~414, 421, 428, 928, 934) and
      `src/time/zoned-time.ts` (~69). The names are settled.
   2. Fix the message assertions in `src/time/instant.test.ts` and `src/time/input.test.ts`.
   3. Regenerate the API report.
   4. Split WIP `2c145dde` into one commit for #472 and one for #242.
   5. Run `FG_E2E_PORT=5184 pnpm verify:full`.
5. **#95.** A human opens the trace (§1) in the DevTools Performance panel and names the three
   largest costs. An agent then measures the two R2 items that are still open: hover, and a bulk
   edit in one transaction.
6. **Write the S6 Q1 ruling into the plans.** Rewrite R1 in `plans/03-slices.md` §S6 and
   `plans/s6-scale-and-sync/README.md` (§4 Q1 answered, §5.1). Change ADR 0018's "§12" reference to
   `plans/01` §10.
7. **Build the ruled issues.** Each has a "Decision" comment and the `ready for agent` label:
   #342 (growth guard, 1 kB), #424 (`collapseStateOf`), #434 (`entryActivate`), #262 (chord
   config key), #317 (local Firefox/WebKit run), #281 (type design pass). #489 waits for the anchor
   answer (§4, item 3). #424, #434 and #262 all touch `src/api/gantt.ts`, so build them in one lane,
   one after another.
8. **Mint `[S6-A1]`–`[S6-A5]`** and add the S6 → S7 entry to `scripts/slice-gate.mjs` (S6 README
   §6, step 2). Also do the S9 gate if the owner says yes (§4, item 2).
9. **The next batch that needs no ruling:** #100 (viewport navigation, about 1 day) and #130 (WBS,
   1–1.5 days). #460 needs the owner to create a PAT secret first.
10. **Issues to file** (the text is in the lane E report and in the triage):
   - #275 item 6: property tests beyond `data/` (wishlist).
   - #101 item 3: quarter, fiscal year and numbered weeks (needs a `time/` design).
   - #94: the week band prints a week-start date above the day cells (`src/time/presets.ts:182,221`).
11. **Small doc fixes that the triage found:**
    - ADR 0011:97 and :200 still call #267 open. #267 is closed.
    - `plans/03-slices.md:277,288` still call #136's design "open". It is settled (issue comment of
      2026-09-02, `plans/01` §4).
    - `plans/issues/open/README.md`: link #281 in the "no issue number yet" entry, and move
      `404-time-shading.md` to `closed/` (#404 is closed). Also link #281 from
      `src/model/dataset.ts:43-50`.
    - `scripts/slice-gate.mjs` `[S1-A4]` label still says `ScrollModel`, which #405 retired.
    - Fold #457 into `plans/03` §S7 and close it. Add #135, #136 and #284 to the S7 scope list.
12. **After each merge:** remove the worktree with `orca worktree rm`
    (`.claude/skills/create-worktree/SKILL.md`, "Clean up when the work merges").

## 4. Open questions for the owner, with recommendations

| # | Question | Recommendation |
|---|---|---|
| 1 | **#414 Q1.** Build the row-plan cache, so a scroll frame costs O(visible rows)? | **Yes.** No write skips the undo stack (see Q-A below), so a cache keyed on the dataset revision, the row source, the collapse set and the plugin-store revision sees every data change. The one change in behaviour: a `filter` or `sort` closure that reads outside state updates only when the page assigns `gantt.rowSource` again. `docs/07` already tells consumers to do that. Add one sentence about closures there. |
| 2 | **S9 gate.** Mint `[S9-A1]`–`[S9-A3]` after the fact? | **Yes.** It takes about 1 hour, and it is the only record of which test proves each S9 row (see Q-B below). |
| 3 | **#489 anchor.** Which unit does a stepped tick count from? | **The next larger unit**, as d3's `every(n)` does: quarters align to the year, 6-hour ticks to the day. Then gridlines stop moving when you pan or change data. |
| 4 | **#473.** Does an EditExtender cascade honour `editable: 'never'`? | **Yes. Refuse, and throw `FieldNotEditableError` for the whole changeset.** The library-side exceptions (construction, `add()`, replay) are all setup writes. A cascade edits an existing value on a caller's behalf, and a lock a plugin can bypass is not a lock. The triage agent recommended the opposite: leave the code and document the exception in ADR 0015. |
| 5 | **#336.** Rename `hierarchyParentId`? | **No. Close as wontfix.** The name points to the seam that produces the value (`ctx.hierarchy.setSource`, ADR 0020). |
| 6 | **#393.** Publish JS constants for the `--fg-*` pixel defaults? | **No. Close as wontfix.** A stylesheet can override a token (ADR 0021), and then the constant is wrong. Add a live getter if a consumer needs a value. |
| 7 | **#253.** `Resolved*` or `*Input`? | **Keep both, and write down which applies when** (`plans/02` §2.1 and `CONTEXT.md`). List the misfits, such as `ResolvedTheme`, for the 1.0 API review. |
| 8 | **#92.** Separate entry points for tree shaking? | **No for now. Close with the evidence:** the plugins already tree-shake (`scripts/bundle-probe.mjs`), and `preserveModules` measured +1.89 kB. |
| 9a | **#101 presets.** `fifteenMinute` and `sixHour` step by more than 1, so they show #489's gridline shift on pan (§2.1). Ship them now with the limit written down, or hold them? | **Hold them until #489's anchor fix.** Ship `minute` and `dayLetterAndWeek` now. |
| 9 | **Push and pull requests.** May the agent push the five branches and open pull requests? | Yes. Until then the close comments cite commits nobody else can see. |

## 5. The owner's questions this session, with the answers

**Q-A. "With the row-plan cache, is there any way a consumer can update a row without going
through the undo stack?"**
No, not today. Every Entry write goes through a transaction and records one undo step
(`src/data/dataset-state.ts`). A plugin-store write takes the same path (the `plugin-store.ts`
header). Every commit bumps `datasetRevision`, and undo and redo are commits too. The only writes
outside History are construction and plugin setup. #419 asks for a door that writes with no undo
step, and it is still in the grill bucket. If #419 ever ships, that door must still bump the
revision, or the cache goes stale.

**Q-B. "Does the gate check what it says it proves?"**
Partly. `scripts/slice-gate.mjs` `tagged(id)` does two things:

1. It fails loudly if no test title in `src/` or `e2e/` carries `[<id>]`, so an id nobody wrote
   cannot pass.
2. It runs only those tests, through vitest or `pnpm test:e2e`.

So the gate proves that the named tests exist and pass. It does not prove that those tests cover
the claim in the label. A person makes that match when tagging, and the slice review checks it.
The gate also lists human checklist items that no script can check.

**Q-C. "I have no experience distributing packages. What do libraries like AG Grid do?"**
They build on pack or publish (`prepack`) and publish a prebuilt `dist/` to the npm registry. A
consumer never builds the library during install. A git dependency is a stopgap until the first
publish (#442). npm runs only `prepare` for a git install, so `prepare` also builds until then.
The build takes about 3 s.

**Ruling after this answer:** the library publishes to the public npm registry (comment on #442).
So the `prepare` build from #400 is a temporary stopgap. Remove it once the consumer installs from
the registry, and give the `prepare` script a comment that says so (comment on #400).

**Q-D. "If a consumer refreshes data, must they remount the chart? Is there no live path that
skips the undo stack?"**

- **No remount is ever needed.** `dataset.entries.update/add/remove` inside
  `dataset.transaction(...)` repaint live. The row-plan cache (question 1) changes nothing here: it
  is keyed on `datasetRevision`, and every commit bumps it.
- The closure caveat is narrower than it sounds. It applies only when a `filter` or `sort` closure
  reads state outside the Dataset, for example a search-box variable. Then the page assigns
  `gantt.rowSource` again. That is one property write, not a remount.
- **But every live write records an undo step today.** `ChangeOrigin` is
  `'user' | 'undo' | 'redo'`. The `'load'` origin is reserved (D-S2-11) and not built, and no public
  call clears or skips History. So Ctrl+Z after a server refresh undoes the refresh.
- That is exactly **#419**, and a server refresh is its main case. **Recommendation: take #419 out
  of the grill backlog and settle it before the first npm publish.** The owner's question is
  recorded on #419.

## 6. The owner's rulings (2026-09-22)

The full table is in `plans/fix-now-2026-09-22.md` §6, and each ruling is a comment on its issue.

- **S6 Q1 (R1 budgets):** budgets with a fixed answer run in CI as a growth check against `main`.
  Frame-time budgets are recorded and checked with `pnpm measure:scale` before a release (#95).
- **#342:** the guard is growth against `main`, 1 kB brotli per pull request per entry, with a
  ledger line for accepted growth. The owner asked triage to pick the value. Core measures 81.63 kB
  today, and 84.87 kB with the plugins.
- **#400:** `prepack` builds. `prepare` also builds, for npm git installs.
- **#424:** `collapseStateOf(id)` → `'collapsed' | 'expanded' | 'leaf'`. An unknown id answers
  `undefined`.
- **#434:** `entryActivate`, plus the `activate` capability (default `true`). The causes are
  `'click' | 'key'`. `'dblclick'` is an opt-in option, only with a clean precedence against the
  cell editor.
- **#262:** a config key beside `viewportGestures`. The obligation chords cannot be turned off.
- **#489:** snap is opt-in, and when on the default is `'tick'`. The consumer can choose the snap
  target with tick tools (next tick, tick width) and a custom snap rule.
- **#317:** Firefox and WebKit run locally first. CI stays on Chromium.
- **#281:** run the type design pass now, before release.
- **#442:** publish to the public npm registry. The `prepare` build (#400) is temporary.
- **#93:** closed for now.

## 7. The status of every issue

Seven issues closed this session, each with a comment: #102 and #128 (`wontfix`), #267, #438,
#439, #463, and #93 (the owner closed it for now). Thirty-nine issues are open.

| State | Issues |
|---|---|
| Worked in a lane: done, not pushed (`fixed needs review`, `ready for agent`) | #429, #407, #335, #101 (items 1–2), #406, #472, #400 (plus the `prepare` follow-up) |
| Worked in a lane: partly done (`ready for agent`) | #242 (WIP), #414 (part one done, the cache waits on question 1), #95 (numbers done, the human trace read is open) |
| Ruled, ready to build (`ready for agent`) | #342, #424, #434, #262, #317, #281 |
| Ruled, one answer left | #489 (anchor, question 3) |
| Waiting on a ruling (§4) | #473, #336, #393, #253, #92 |
| Act now, not started | #100, #130, #460 (the PAT comes first) |
| Waits on S7 | #136, #135, #284, #457 (fold into `plans/03` and close) |
| Needs a design grill | **#419 first (before the npm publish, see Q-D)**, #222, #423, #425, #428, #465, #94, #449, #426 |
| Release | #442 (#400 and #460 feed it) |
