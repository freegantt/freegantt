# Review dispatch — the CRM_Filament consumer brief, its seven issues, and the S6 slice plan

**Written:** 2026-09-15 · **For:** a `reviewer-planner` agent, best Opus, high effort · **Branch:** `Pawel-IT/CRM-Features`
**Nothing here is committed.** Two files are untracked. No code changed in this work — it is specs, issues and one slice plan.

---

## 1. Goal

Review seven new GitHub issues and one new slice plan for **fidelity, buildability and house-rule compliance**, and report what is wrong. Do not change anything.

## 2. Boundary

- **Report only.** Do not edit a file, do not edit or close an issue, do not comment on an issue, do not commit, do not push.
- Do not implement any of the specs.
- Do not spawn subagents.
- Do not review `plans/handoff/2026-09-15-crm-filament-labor.md` for quality. It is the **consumer's own words, copied verbatim**, and it is evidence, not a deliverable. Review whether the issues represent it faithfully.
- Out of scope: S7, the scheduling plugin, anything the consumer's brief §7 lists as not needed.

## 3. What to review

### The seven issues

| # | Title, short | Type |
|---|---|---|
| 400 | `github:` install lands with no `dist/` | packaging |
| 401 | A row that paints one value per tick | requirement + open questions |
| 402 | A Segment carries no consumer data | requirement + open questions |
| 403 | S6's 100 mount/destroy leak check | test spec |
| 404 | Ship `shading()` | **full API spec, API already decided by the author** |
| 405 | Two Gantts share x, keep y private | requirement + open questions |
| 406 | Fixture seeds 5,000, row says 10,000 | mechanical |

Read them with `gh issue view <n>`.

### The slice plan

`plans/s6-scale-and-sync/README.md` — new, 5 sections plus an order of work. S6 had no plan directory before this; S1–S5 each do.

### The source

`plans/handoff/2026-09-15-crm-filament-labor.md` — the consumer brief, verbatim, with a provenance header.

### Comments posted (check each for accuracy, not tone)

#95, #97, #265, #302, #342, #403.

---

## 4. What to check, in priority order

### 4.1 Fidelity to the brief — highest priority

Every issue claims to carry an ask from the brief. For each: does the issue state **what the consumer asked**, without inflating it into more work or narrowing it into less?

**This failure already happened once in this work, so hunt it.** An earlier draft of `plans/s6-scale-and-sync/README.md` §5.3 claimed the consumer shares both scroll axes and wanted no partial mode. That was read off the brief's §1 *mapping table* ("shared `ScrollModel` + `TimeScaleModel`"), which is the consumer guessing at a mechanism, instead of the brief's §1 *prose* ("one shared time axis, one shared **horizontal** scroll"). The two say different things and the prose is the requirement. It is corrected and the correction is recorded in §5.3. **Assume the same class of error is elsewhere and look for it.**

Check specifically:
- Brief §7 lists what the consumer explicitly does **not** want. Has any of it leaked into an issue?
- Brief §8 gives the real numbers (about 200 rows × 21 buckets, four zoom ranges, no 10,000-column case). Does any issue over-engineer past them?
- Brief §9 ranks the asks. Do the issue labels and the slice plan's order of work match that ranking, or silently re-rank it?

### 4.2 Fidelity to the code — the claim ledger

CLAUDE.md: *"A plan or review's account of the code is a claim. Open the file before you act on it."* Every claim below was checked once while writing. **Check each one again** — that rule applies to this dispatch too.

| Claim | Where it is asserted | Verify against |
|---|---|---|
| `version: 0.0.0`; `dist/` gitignored; `prepare` sets `core.hooksPath` and does not build; `exports` names `./dist/api/index.js` | #400 | `package.json`, `.gitignore` |
| `Item` requires `entryId` and `id`; `itemId(entry, segmentIndex)` mints the id; `ItemProducer = (entry, variant) => readonly Item[]`; `CustomRow = { id, label?, entryIds? }` | #401 | `etc/freegantt.api.md` |
| `SegmentInput = TimeSpanInput & { id? }`; `Segment = TimeSpan & { id }`; `BarRendererContext = { entry, item, label? }`; `removeSegments` exists | #402 | `etc/freegantt.api.md` |
| The S6 leak row is unticked | #403, slice plan | `plans/03-slices.md` |
| The harness plugin hard-codes `time.dayOfWeek(day) >= 6`; `ZonedTime` exposes **no hour step**; `time/zone.ts` already has generic `stepBy` and `startOf`; hour presets exist; `DecorationInput.class` is one string; a chrome-only plugin installs on the `Gantt` | #404 | `harness/plugins/weekend-shading.ts`, `src/time/zoned-time.ts`, `src/time/zone.ts`, `src/time/presets.ts`, `src/layout/decoration.ts`, `docs/adr/0019-*` |
| D-S1.5-3's text, its two rejections, and the deferred-table row `xOnly()/yOnly() — returns at: when a host needs "share x, private y"` | #405, slice plan §5.3 | `plans/s1.5-scroll-model/README.md` |

> **Superseded later on 2026-09-15 — D-S6-1.** The row above was split into `xOnly()` / `yOnly()` halves during this review. The author then ruled that the shared unit is one **scroll axis**, not a view over a `ScrollModel`, so both halves are withdrawn and shared y comes free instead of being withheld. F21's finding stands; its proposed fix does not. See `plans/s6-scale-and-sync/README.md` §5.3 and #405.
| `[S1-A4]` proves a scroll on one Gantt moves the other in x and y | #405, slice plan | `e2e/scroll-sync.spec.ts` |
| The large-dataset harness seeds 5,000, and `fixtures/seeded-dataset.test.ts` pins 5,000 | #406, slice plan §5.2 | `harness/large-dataset.ts`, `fixtures/seeded-dataset.test.ts` |
| `plans/01` ends at §11, and two documents cite a `plans/01` §12 | slice plan §5.1 | `plans/01-domain-architecture.md`, `plans/03-slices.md:264`, `docs/adr/0018-*` |
| `pnpm gate` prints `no automated checklist defined yet for slice S6`; `scripts/slice-gate.mjs` stops at `S5 → S6` | slice plan §5.4 | run `pnpm gate`; read `scripts/slice-gate.mjs` |

A claim that is **directionally right but wrong in detail** is a finding. The #244 precedent: all 18 findings were real, one described the code wrongly, and the true fix was smaller.

### 4.3 #404's API, hardest look

#404 is the only issue whose API is **already decided by the author** and therefore the only one that could be built tomorrow. The author decided: a chrome plugin named `shading()`, a predicate-only core with shipped builders, ISO day numbers, and per-builder zoom defaults with one override key. **Those five choices are settled — do not relitigate them.** Everything built on top of them is open:

- `TimeCover.bands(window, time)` returns spans rather than a boolean. Does that actually let `spans()` stay exact, `daysOfWeek()` merge runs, and `not()` complement within a window? Is there a case it cannot express?
- `anyOf` takes the finest `every` and the finest `hideWhenCoarserThan` of its members. Is that right, or does it silently hide a member that should still paint? The issue claims "write two rules" is the answer — is it?
- The `ShadingRule` union makes `every` required exactly when `covers` is a bare function. Does that typecheck the way the issue claims under `exactOptionalPropertyTypes`?
- The zoom defaults table: is `spans()` never hiding correct, and is `hours()` hiding above hour ticks correct?
- The `ZonedTime.step`/`each` addition — is that the right shape, and does adding it to the facade cross any layer rule? `extensions/` may reach `api/` and `model/` only (D-S5-5).
- `hours('17:00','07:00')` wraps midnight. What does it do across a DST boundary, in a 23-hour and a 25-hour day?
- `daysOfWeek(...)` versus `ZonedTime.dayOfWeek(...)`. The issue accepts the shared concept word. Is that a #7-class collision or not?
- The reconfigure hazard the issue names: a predicate closing over mutable data does not repaint, because `DecorationRunner` memoizes on the window. Is that description of the memo correct, and is "reinstall the plugin" really the only door?

### 4.4 House rules

- **Naming.** Write each new name's call site and read it aloud. `shading()`, `TimeCover`, `daysOfWeek`, `hours`, `hideWhenCoarserThan`, `anyOf`, `not`, `ShadingRule`, `CoverTest`. Check the CONTEXT.md *Avoid* lists — "band" is already on one.
- **Vocabulary.** No scheduling words (dependency, predecessor, lag, deadline, "the schedule") outside the scheduling plugin. No vendor product names outside an ADR and `plans/field-redesign/**`.
- **Locked decisions.** Does anything revisit D2, D4, D9, D-S1.5-3, ADR 0011, ADR 0013, ADR 0019 without saying so out loud?
- **ASD-STE100.** Short sentences, active voice, one instruction per sentence, one meaning per word.
- **Two callers, two surfaces.** #404's builders and `TimeCover` are plugin-author surface. Is anything on the app-author surface that should not be?

### 4.5 The slice plan's four claimed defects

`plans/s6-scale-and-sync/README.md` §5 claims four defects in `plans/03` §S6: a dangling §12, a 5k/10k mismatch, R3 being a build rather than a tick, and a gate with no S6 checklist. **Each is a claim about a spec.** Verify all four. Say if any is not a defect, and say if there is a fifth the plan missed.

### 4.6 What is missing

The brief has five asks. Seven issues came out of it. Is anything in the brief unrepresented, and is any issue representing something the brief never asked for?

---

## 5. Two author rulings, recorded 2026-09-15 — do not relitigate

1. **Only x needs to sync.** Two Gantts share horizontal scroll and keep vertical scroll private. This answers slice-plan Q2 and makes R3 a build (#405).
2. **Do 10k.** The S6 acceptance row stands at 10,000 and the fixture rises to meet it (#406). This answers slice-plan Q4.

Review whether the issues and the plan **carry** these rulings correctly. Do not argue them.

## 6. Still open, and a finding may bear on them

- **Q1** — what "§12-style budgets" was meant to name.
- **Q3** — whether #401, #402 and #404 land inside S6, after it, or in a new slice. S6's stated posture is "no new public feature", and all three are new public surface.
- **Q5** — whether #112 Seam B lands in S6.

---

## 7. Completion test

Produce one written report with:

1. **A verdict line per artifact** — the seven issues, the slice plan, and the six comments. One of: sound / sound with fixes / not sound.
2. **Findings, ranked most severe first.** Each names the issue number or `file:line`, states the defect in one sentence, and gives a concrete failure scenario — what a reader or a builder would do wrong because of it.
3. **A separate list of claim-ledger results** (§4.2): each claim marked verified, wrong, or unverifiable, with what the file actually says when it is wrong.
4. **An explicit answer to §4.6** — what is missing, and what is invented.

Do not print the files back. Report conclusions.

Nothing needs building or testing, so there is no `verify:full` run in this job. `pnpm gate` is the one command worth running, for §4.2's last row.

## 8. Budget

Keep your context under 300k tokens. Report your context usage with each progress update and in your final report. When you pass 200k, stop at the next clean point and write a handoff instead of starting new work. You have until 250k to finish that handoff, so land it properly — do not cut it short.
