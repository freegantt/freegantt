# Issue triage — 2026-09-22

This file sorts the 46 open issues into four buckets. Agents checked each issue against the code at
`ee9d35e6`. They did not trust the issue text alone.

| Bucket | Count | Meaning |
|---|---|---|
| [Stale](#1-stale--close-them) | 6 | The code already fixes it, other work replaces it, or it has no task. |
| [Act now](#2-act-now) | 12 | The scope is clear, no decision is open, and each fits in one day or less. |
| [One ruling, then small](#3-one-ruling-then-small) | 14 | An owner decision blocks it. After the decision, the work is small. |
| [A ton of work](#4-a-ton-of-work) | 14 | Multi-day work, an open design grill, or a wait on S7. |

This file is a snapshot. It goes stale when the issues change. Delete it at the next triage.

## 1. Stale — close them

**All six are closed (2026-09-22)**, each with a comment that gives the evidence. The triage branch
fixes the `docs/09` paragraph for #438. #102 and #128 carry `wontfix`.

| # | Title | Why it is stale | Next step |
|---|---|---|---|
| #102 | Zoom/axis ideas that need a new locked decision | A parking lot with no task. Its own text says "start nothing". `plans/00-overview.md:99` already records item 4. | Close. Move item 2 into #93. Record items 1 and 3 in the S1.12 §9 deferred table. |
| #128 | Tools | A list of outside links. `plans/issues/open/README.md` already drops it for "no actionable scope". | Close. |
| #267 | A renderer reads a declared Field by casting entry.meta | ADR 0011 retired `meta`, and ADR 0017 added `entry.read(key)`. `harness/planner.ts:65` reads a Field with no cast. #284 owns the typing that is left. | Close, citing ADR 0017 and #284. ADR 0011:97 and :200 still call #267 open. Fix those two lines. |
| #438 | zoomIn/zoomOut change the scale with no change notification | Zoom fires `navigationChange`. #461 added `visibleSpan` to the payload (`src/view/event-bus.ts:83`). | Fix `docs/09-integration-pitfalls.md:66-70`, which still says "carries no time span". Then close (about 30 minutes). |
| #439 | Chart pane width comes from the bars present | The owner's probe did not reproduce it. The reporter sent the real symptom to #436, and PRs #454 and #458 fixed it. | Close, citing the probe and #436. |
| #463 | Seven foot-gun rows stay open | PRs #481, #483, #485, #486 and #487 merged. Sub-issues #474–#480 are closed. | Close, citing `plans/handoff/2026-09-21-foot-gun-rows-463-build-log.md`. |

## 2. Act now

`plans/fix-now-2026-09-22.md` plans the first six to fix (#400, #406, #414 part one, #95, #407,
#429). Suggested order for the rest: quickies first, then the chains.

| # | Title | Effort | Next step |
|---|---|---|---|
| #429 | harness/hierarchy.ts keeps a second copy of the row-source state | about 1 hour | `buildRowSource()` (`harness/hierarchy.ts:138-163`) rebuilds the source. Spread `gantt.rowSource` as `harness/main.ts:225-236` does. Then delete the caveat in `docs/07-row-source-updates.md:142-146`. |
| #406 | The large-dataset fixture seeds 5,000 entries, not 10,000 | 1–2 hours | Raise `harness/large-dataset.ts:13` to 10,000. Update the labels in `scripts/slice-gate.mjs:83`, `harness/large-dataset.html:44`, `e2e/large-dataset.spec.ts`, `fixtures/seeded-dataset.ts` and `plans/03-slices.md:56`. |
| #95 | Profile the large-dataset harness in DevTools | 2–3 hours after #406 | Run `pnpm measure:scale`. A human reads the trace. Post the numbers on the issue. |
| #407 | Consumer brief's nine API claims are unchecked | about 2 hours | Four names in the brief no longer exist (`Segment`, `selectedSegmentIds`, `ScrollModel`, `interactions`). Redo the §1 table in `plans/handoff/2026-09-15-crm-filament-labor.md` against `etc/freegantt.api.md`. |
| #472 | Add a public TimeSpan overlap helper | 2–3 hours | Add an overlap function in `src/time/`. Export it from `src/api/index.ts`. Add a "Visible hours" readout to `harness/gantt-toolbar.ts`. |
| #335 | Close the test-coverage holes from #275 items 5–6 | 3–4 hours | #224 is closed, so item 5 is free. Add the tooltip-miss, empty-menu and `when: false` tests. Split item 6 (waits on S7) into a wishlist issue. |
| #400 | A github: install lands with no dist/ | 3–4 hours | Half done: the version is 0.1.0, and `prepare` is safe. Add a `prepack` build. Add a CI job that packs, installs and compiles `import { Gantt }`. Give `publishConfig` and the release workflow to #442. |
| #242 | InvalidInstantError stays message-shaped | 4–6 hours | The split is moot: #143 added `InvertedSpanError`. Give `InvalidInstantError` (`src/model/errors.ts:160`) `reason` and `operation` fields. Name the operation at each `toInstant` call (`src/api/gantt.ts:414,421,428,928,934`). |
| #101 | Axis presets: quarter, sub-hour rungs, day-letter band, fiscal year | 3–4 hours (items 1–2) | Ship the minute, 15-minute, 6-hour and day-letter presets. Split fiscal year and numbered weeks into a new issue, because they need a design. |
| #460 | Sync docs/ into freegantt/docs | about half a day | A human creates the PAT secret first. Then add a push-to-main workflow that mirrors `docs/`. Decide whether `docs/agents/` stays out. This also answers #442 decision 4. |
| #100 | Viewport navigation: shift, fit-selection, period views | about 1 day | Wheel and pinch zoom have shipped. Add `shiftNext`/`shiftPrevious` and a zoom-to-entry-ids call to `Viewport` and `Gantt`. Build the period helpers on `zoomToSpan` and `panToDate`. |
| #130 | feat: WBS System | 1–1.5 days | `plans/issues/open/130-wbs.md` finished the grill, and #213 and #214 are closed. One gap: `ComputeContext` cannot say where a root sits among the roots. Add that read, update the plan's P1 section, then build `wbs()`. |

## 3. One ruling, then small

Each row needs one owner decision. The work after the decision is short. Answer the rulings in one
sitting of about 1 hour. That moves most of these rows into "Act now".

| # | Title | The ruling | Effort after |
|---|---|---|---|
| #424 | A row cannot ask whether it is collapsed | Pick option 2 (a `collapseStateOf`-style read with all three states). Say what a stale id returns. | 2–3 hours |
| #473 | An EditExtender's cascade writes a Field declared editable: 'never' | Does a cascade honour `'never'`? The recommended answer is no: a library-side write may write a locked Field (`write-rule.ts:61-62`). Record that in ADR 0015. | 2–4 hours |
| #336 | Rename hierarchyParentId | Is there a better name? Run the naming skill. If no name wins, close as won't-fix. | about 2 hours |
| #393 | Publish JS constants for the --fg-* pixel defaults | Publish them or not? ADR 0021 lets a stylesheet override a token. After an override, a JS constant reports a value that no longer applies. | 2–3 hours |
| #342 | Bundle size budget is parked at 300 KB | Choose the budget numbers and the guard shape (fixed ceiling or ratchet). Put it in S6 R5 so the decision comes before the first publish. | about half a day |
| #281 | A flat declared Field key does not type-check | Accept runtime-only, or run a type design pass? Link #281 from `src/model/dataset.ts:43-50` and `plans/issues/open/README.md`. Both still say "no issue number". | 1 hour, or 1–2 days |
| #253 | `Resolved*` and `*Input` name the same idea two ways | Pick option 1, 2 or 3. `Resolved*` now has about 150 uses with more than one meaning (`ResolvedTheme` is an answer, not a filled-in form). | 2 hours (write the rule), or 2–3 days (rename) |
| #262 | Core binds 18 keyboard chords with no off switch | Pick shape A, B or C. The issue recommends A: a config key beside `viewportGestures`. | about 1 day |
| #434 | A row click cannot reach a consumer | Decide two things: does `Capabilities` get `activate`, and does `'dblclick'` ship? | about 1 day |
| #489 | Snap and the grid derive tick boundaries from different anchors | Decide the snap default and one tick anchor (range start or epoch). The issue names the wrong drag path. It is `snapInstant` (`src/layout/gesture-draft.ts:84,234`). Also, gridlines shift during a pan when `increment > 1`. | about 1 day |
| #414 | A scroll frame costs O(entries), not O(visible rows) | Is a per-frame resolve intended (D-S4-19/20)? One part needs no ruling: `placeFrame` rebuilds `entryById` every frame (`src/layout/frame.ts:545`). That fix takes 1–2 hours and can ship now. | 1–2 days |
| #93 | Gap to the right of the Gantt at some zoom levels | Reproduce on current main first. The default `fit: 'pane'` cannot gap now. Then grill "fill the pane" against D-F′ for the other fits. Take #102 item 2 into the same grill. | about half a day |
| #317 | e2e has only ever run Chromium | #255 no longer blocks it. Run `playwright test --browser=firefox` and `--browser=webkit` once to size the failures. Then pick option 1, 2 or 3. | 1 hour of config, plus 1–3 days of engine fixes |
| #92 | Tree Shake | Add subpath entries (`freegantt/dataset`), yes or no? The plugin half is proven by `scripts/bundle-probe.mjs`. If no, close. | 2–3 days if yes |

## 4. A ton of work

### Waits on S7

The scheduling slice does not exist yet (`src/scheduling/index.ts` is `export {}`). Leave these
parked. Put each in the S7 scope list in `plans/03-slices.md`.

| # | Title | Effort | Note |
|---|---|---|---|
| #136 | S7: link-emission seam for GeometryFrame.links | 3–5 days | The design is settled (issue comment of 2026-09-02, `plans/01` §4). `plans/03-slices.md:277,288` still calls it "open". Fix those two lines now. |
| #135 | S7: convenience helper that installs first-party plugins | about 2 hours after S7 | Waits on `entryDependencies()` and `scheduling()`. |
| #284 | Type plugin Field keys through an empty interface merge | about 1 day | The route is settled in ADR 0019. The first user is `scheduling:progress`. |
| #457 | Can scheduling run in a Web Worker? | 1–2 weeks, if needed | A feasibility note. Measure after S7 (D2). Fold it into `plans/03` §S7 and close. |

### Needs a design grill first

| # | Title | Effort after the grill | The open question |
|---|---|---|---|
| #222 | The library ships no toolbar | 3–4 days | Q1: a plugin or a `GanttOptions` key? Q2: which container does it render into? A snap change event does not exist yet. |
| #419 | A write door that records no undo | 1–2 days plus an ADR | Seven open questions. Start with "is the door the `'load'` origin?" |
| #423 | A row that paints one value per tick | 4–7 days | Five open questions. It also conflicts with "No zoom-dependent values, ever" (`plans/03-slices.md:321`). |
| #425 | A vertical drag moves a bar to another row | 3–5 days | Is it a capability or the default? What is the event shape? |
| #428 | duration is not special: a Field aggregates through a named Aggregator | 3–5 days, or a new plan | The author's comment of 2026-09-18 asks for a larger compute-Field rework. Should #428 close in favour of a new issue? |
| #465 | A window-scoped value has nowhere to go | 3–5 days | Five questions, first the seam. Answer it before any grid export ships. |
| #94 | Research: take a timeline/axis library? | 2–4 days for a port | Five open questions. One real bug is inside: the week band prints a week-start date over the day cells (`src/time/presets.ts:182,221`). File it as its own small issue. |
| #449 | No way to compose a Gantt-wide bar decoration with a variant's paint | 2–4 days | Three directions, none worked out. No consumer asked. Park it as wishlist. |
| #426 | A custom hierarchy source declares the Field keys it reads | about 1 day | No consumer and nothing waits on it. The sketch is out of date: a custom source now enters through `ctx.hierarchy.setSource`. Answer it together with #428. |

### Release work

| # | Title | Effort | Note |
|---|---|---|---|
| #442 | Get the library ready for a public npm release | 2–3 days plus ten owner decisions | About a third is done (PR #443). Hygiene work can ship now: gitignore `.agents/skills/`, add `SECURITY.md`, fix the README status line (`README.md:8` says S4). #400 and #460 feed it. |

## Old triage docs

- `plans/reviews/2026-09-06-issue-wave-status.md` is deleted. Of the issues it tracked, only #222
  and #242 are still open. This file carries both.
- No other triage doc was in `plans/` or `docs/`.
