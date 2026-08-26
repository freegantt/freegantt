# Temp plan — close S1 (S1.8 → S1.11)

**Written:** 2026-08-25 · **Baseline:** `main` @ `f68ee77` · **Scope:** the last four steps of issue #1, and the five S1 acceptance boxes in `plans/03-slices.md`.
**Source specs:** issue #1 body, the [S1 conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) comment, and the S1.8/S1.9/S1.10/S1.11 API-design comments.
**Status of this file:** working document. It is not a spec. The per-step READMEs are. Delete this file when S1.11 closes.

---

## 1. Verified state of the repository

| Fact | Evidence |
|---|---|
| `pnpm verify` is green | run at `f68ee77`, exit 0 (format, typecheck, lint, boundaries, guards, 35 dom + pure tests, vendor-names, disables, build) |
| S1.4, S1.5, S1.6, S1.7, S1.7b have shipped | `src/layout/viewport/`, `src/layout/row-height-index.ts`, `src/view/scroll-attachment.ts`, `src/view/pane-size-attachment.ts`, `eslint/rules/no-time-to-pixel-math.cjs` |
| Four steps are open | issue #1 §3 — S1.8, S1.9, S1.10, S1.11 |
| 0 of 5 acceptance boxes are ticked | `plans/03-slices.md` §S1 |
| The S1 gate does not exist | `node scripts/slice-gate.mjs` prints "no automated checklist defined yet for slice S1" |
| `freegantt/no-flow-layout-rows` does not exist | `ls eslint/rules/` — `docs/02` §3.10 marks it `PLANNED (S1)` |
| I9 is `PLANNED (S1)`; I12 is `AUTO-PARTIAL` | `docs/01-invariant-guard-matrix.md:28,31` |
| There is no event bus | no `on(` / `emit(` anywhere in `src/`; `Gantt` has one method, `destroy()` |
| `Gantt` exposes no live config key | `src/api/gantt.ts` |
| CI runs no e2e job, and every CI trigger is off | `.github/workflows/ci.yml:5-8` — `push` and `pull_request` are commented out. `.githooks/pre-push` runs `pnpm test:e2e` instead (§7 Phase 5, `docs/04` §3.1) |
| `src/view/gantt-shell.ts` is 144 lines | close to the ~150-line soft cap (R1) |
| Two harness pages own pane CSS | `harness/index.html` and `harness/scroll-sync.html` both set `overflow: auto` and hand-write `.fg-*` rules (#41) |

---

## 2. Settle these six contradictions before code starts

The API-design comments were written before S1.5 and S1.7 shipped. Six lines in them name things that do not exist, or promise things a later step cut. An agent that copies them will write dead code.

- **C1 — `ScrollSource` is cut.** The S1.8 comment writes `scroll?: ScrollSource` in `GanttShellOptions`. S1.5 cut `ScrollSource` (S1.5 README §10). Use `ScrollModel`, which is what `GanttShellOptions` uses today.
- **C2 — `xOnly()` is cut.** The S1.11 comment's four-line demo calls `scroll.xOnly()`. S1.5 cut `xOnly()`/`yOnly()`. The D9 demo shares one `ScrollModel` on both axes, which is what `harness/scroll-sync.ts` already does. If the demo needs an x-only link, that is the caller that brings `xOnly()` back, and it needs its own decision record first.
- **C3 — `no-flow-layout-rows` has no scope.** `docs/02` §3.10 scopes the rule to `src/view/grid/**` and `src/view/timeline/**`. Neither directory exists, and S1.8 puts the pane code in `src/view/pane-layout.ts`. Rescope the rule to `src/view/**` and `src/render/dom/**` when it lands, and correct `docs/02` §3.10 in the same commit.
- **C4 — the token rename has one owner.** `--fg-row-label-width` becomes `--fg-grid-pane-width`. The S1.8 comment does it; the S1.10 table repeats it. S1.8 owns it. S1.10 only lists the finished name.
- **C5 — the x-axis gutter defect closes at S1.8.** D-S1.7-11 records it: the row-label gutter sits inside the single scroller, so the last `gutter` px of the timeline is unreachable at a non-zero `max.x`. S1.8 must close it with a named test, not as a side effect of the pane split. S1.9 is the first step that can make `max.x` non-zero, so a silent regression here stays invisible until S1.9.
- **C6 — S1.7 §9 promises `gantt.scale =` and `gantt.scroll =` at S1.8.** The S1.9 design cut both: `Gantt` never re-exposes `scale` or `scroll`, or one key gets two write paths (`plans/02` §1.1). They are cut, not deferred. `gantt.reveal(entryId)` and `gantt.overscan`, from the same ledger row, move to S1.9. Correct `plans/s1.7-windowed-frame/README.md` §9 in S1.8's spec edits.

C1, C3, C4, C5 and C6 are written into [`plans/s1.8-pane-layout/README.md`](s1.8-pane-layout/README.md). C2 goes into the S1.11 README. Also correct the issue #1 comments, so the next reader does not re-derive them.

---

## 3. Order, and why

`S1.8 → S1.9 → S1.10 → S1.11`, which is the issue's own order. The reasons are not the same for each edge:

- **S1.8 first** because it changes `RenderBackend.mount()` and deletes `rowLabelWidth`. Every later step writes to the surfaces it creates. S1.9, S1.10 and S1.11 all get more expensive if they land first.
- **S1.9 after S1.8** because anchored zoom needs a timeline pane whose coordinate frame starts at its own `0`. `zoomTo` computes `instantForX(scroll.x + anchorX)`. With the gutter still inside the scroller, that `anchorX` is wrong by the gutter width.
- **S1.10 after S1.9** because the theming step must not have to guess how many header bands a preset draws. Two-band presets land at S1.9.
- **S1.11 last** because it only measures. It adds no behaviour of its own.

One branch and one PR per step. Never push a step commit straight to `main`.

---

## 4. S1.8 — pane layout, splitter, `GanttShell` as composition root

**Branch:** `s1.8-pane-layout` · **Closes:** #41 · **Acceptance:** `[S1-A2]` (I9)

### Phase 0 — the settled spec · **written**

[`plans/s1.8-pane-layout/README.md`](s1.8-pane-layout/README.md) is the spec for this step, and it supersedes this section wherever the two disagree. Its §0 holds three open scope calls that need an answer before code starts: whether `gantt.reveal(entryId)` lands here, what happens to the three items S1.7 §9 handed to S1.8, and the `gridWidth` / `--fg-grid-pane-width` spelling.

Two corrections it makes to this file: the gutter defect (C5) is proven by measuring `timelinePane.scrollWidth` against `frame.contentWidth`, **not** by an e2e test with a hand-set non-zero `max.x` — that test would fake a state the library cannot reach until S1.9. And S1.7 §9's promise of `gantt.scale =` / `gantt.scroll =` at S1.8 is a sixth contradiction (**C6**): the S1.9 design cut both, because `Gantt` re-exposing its models gives one key two write paths.

### Phase 1 — the guardrail, before the code it guards

`eslint/rules/no-flow-layout-rows.cjs` plus its rule test and a red fixture (`plans/04` §3.2/§3.3). Scope it per C3. Add it to `eslint/rules/index.cjs` and to `eslint.config.js`.

### Phase 2 — `src/view/pane-layout.ts`

The three panes and one number. No geometry, no scale, no data, no frame. Soft cap ~150 lines.

### Phase 3 — the render surfaces

`RenderBackend.mount(surfaces: RenderSurfaces<THost>)`. Delete `RenderBackend.rowLabelWidth`, the `getComputedStyle` read of `--fg-row-label-width` in `render/dom`, both `marginLeft` offsets, and the subtraction in `GanttShell.#applyPaneMeasurement()`. The grid pane's row layer gets exactly one `translateY(-frame.visible.y)` per frame (D-D). This phase closes C5: the timeline pane becomes its own scroller, so its content is `contentWidth` wide, not `gutter + contentWidth`.

### Phase 4 — the event bus, with two events that work

`beforeGridWidthChange` / `gridWidthChange`. Sync veto only. This is the first bus in the codebase, so its shape sets the precedent for S2's changeset events — keep it to an `on` / `off` pair that returns no disposer (conventions §4 bans a bare `() => void` handle), and declare nothing that does not fire (I11).

### Phase 5 — `src/view/splitter.ts`

`attachSplitter(handle, hooks): SplitterAttachment`. Pointer capture always. Escape restores the width at drag start. It writes no state itself.

### Phase 6 — `GanttShell` reduced to a wiring list

`resolveHost` throws `HostNotFoundError` (a new subclass in `src/model/errors.ts`, beside `UnsupportedUnitError`). `#readMetrics()` reads `--fg-row-height` and `measureTimelinePane()` together, invalidated by the pane-size attachment.

### Phase 7 — harness and docs

Both harness pages drop `overflow` and every `.fg-*` rule that the library now ships (#41). Then re-read `harness/main.ts` and `harness/scroll-sync.ts` against CLAUDE.md's harness rule and record any gap against S1.8.

Spec edits: `plans/01` §8.1 (mount takes surfaces, `rowLabelWidth` removed), `plans/01` §8.3 (the grid pane follows by one transform per frame), `plans/02` §3 (the two events), `plans/02` §4 (the token rename), `docs/02` §3.10 (the rule's real scope), `CONTEXT.md` (grid pane, timeline pane, splitter, grid width).

### Tests

Per the S1.8 README §6. The load-bearing two: **`[S1-A2]`** in `gantt-shell.test.ts` — grid row tops and timeline bar tops read from the live DOM, equal to the pixel, at a fractional zoom; and the C5 check — `timelinePane.scrollWidth` equals `frame.contentWidth`, which fails today and passes after the pane split.

---

## 5. S1.9 — presets hour→year, multi-band headers, anchored zoom

**Branch:** `s1.9-presets-and-zoom` · **Acceptance:** `[S1-A3]`, `[S1-A5]`

### Phase 0 — `plans/s1.9-presets-and-zoom/README.md` · **started**

[The file exists as a stub](s1.9-presets-and-zoom/README.md). It holds only §0, the items S1.7 and S1.8 handed forward — `gantt.reveal`, `gantt.overscan`, the first non-zero horizontal scroll range, multi-band presets, and the record that `gantt.scale =` / `gantt.scroll =` are cut. Write the rest of it in the S1.7 form before code starts. It must restate D-F′ as this step's governing decision, because this is the step that makes D-F′ observable.

### Phase 1 — `src/time/presets.ts`

Move the five shipped presets out of `scale.ts`. Add `dayAndWeekPreset`, `weekAndMonthPreset`, `monthAndYearPreset`, the `ShippedPresetId` union, the `presets` record, `PresetRef`, and `resolvePreset`. Add `UnknownPresetError` to `src/model/errors.ts`. Write the `headers` (labelled) versus `tickUnit` (gridded and snapped) split into the `ViewPreset` doc comment, with the rule "`tickUnit` is never coarser than the last header".

### Phase 2 — `startOf` in `time/zone.ts`

Already exported (`src/time/index.ts`). Confirm it steps months and years in the dataset zone, and add the tests the two-band presets need.

### Phase 3 — split `range` from `zoom`

`TimeScaleIntent.zoom: 'fitViewport' | 'preset' | { pxPerMs }`, default `'fitViewport'`. `TimeScaleModel` gets live `preset`, `range` and `zoom` setters. At the defaults the resolved scale must be byte-for-byte what it is today — prove that with a test, because it is the claim that makes this split free.

### Phase 4 — `Viewport.zoomTo` / `zoomBy` (D-F′)

Read the anchored instant off the scale **before** the write. Write `scale.zoom` and `scroll.x` inside one `viewport.batch()`. Never write `range.start`.

### Phase 5 — the public surface

`Gantt` gets `preset`, `range`, `zoom`, `overscan`, `gridWidth`, `zoomTo`, `zoomBy`. It does **not** re-expose `scale` or `scroll`. Document that setting a key on a Gantt that shares a scale retunes every Gantt sharing it.

### Tests

`[S1-A5]` DST axis correctness in the dataset zone. `[S1-A3]` one notification per zoom, and a bar's DOM node identity is unchanged across a preset switch (I8). A fast-check property test: random `zoomBy` sequences keep the anchored instant within 0.5 px of its anchor, and `zoomBy(2)` then `zoomBy(0.5)` returns to the start.

Spec edits: issue #1 §2 (strike D-F, record D-F′), `plans/02` §7 (unknown preset id becomes a typed throw), `plans/01` §5.1, `plans/01` §8.2.

---

## 6. S1.10 — theming tokens, parts vocabulary, a11y foundation

**Superseded.** This phase list is superseded by [`plans/s1.10-theming-and-a11y/README.md`](s1.10-theming-and-a11y/README.md), the settled spec — its §2 decisions (most notably D-S1.10-5, which ships `group`/`listitem`/`img` roles instead of the `grid`/`row`/`rowheader`/`gridcell` pattern this section's Phase 5 still names) supersede everything below. Kept only as a record of the phase this step was planned from.

**Branch:** `s1.10-theming-and-a11y`

### Phase 0 — `plans/s1.10-theming-and-a11y/README.md`

### Phase 1 — the guardrail, first again

`eslint/rules/no-inline-style-outside-geometry.cjs`. It permits `transform`, `width` and `height`, and bans every other `node.style.<prop> =` in `src/render/**` and `src/view/**`. Red fixture, rule test, `docs/02` entry.

### Phase 2 — `src/view/styles.ts`

`ensureBaseStyles(doc)`, idempotent through a `<style data-freegantt-styles>` marker in the document. The document holds the state, not a module variable (I2). Do not add a `styles` option and do not add a second package export — the `exports` map stays sealed.

### Phase 3 — tokens and parts

The `--fg-*` table. Dark mode as a token swap in two places only. Rename `BarFlags` keys to the CSS vocabulary (`conflict`, `cycle`), and generate `data-flag` from the truthy keys, so a new flag never needs a `render/dom` edit. Add the `data-testid` hooks that `[S1-A1]` and `[S1-A4]` will select on.

### Phase 4 — `time/format.ts`

`formatEndInclusive(zone, end)` and `formatDate(zone, i)`. Exactly one function converts half-open to inclusive. `plans/01` §5 has promised this since S0 and no file implements it.

### Phase 5 — a11y

`a11yLabel` as one flat live key. `FrameBar.a11yLabel` composed in `layout/`. Roles: `grid`, `row`, `rowheader`, `gridcell`. `aria-rowcount` is the **total** row count, not the windowed count. One tab stop on the host. No roving tabindex — that arrives with S4's keyboard controller.

Spec edits: `plans/02` §4, `plans/01` §4, `plans/01` §5, `docs/02`.

---

## 7. S1.11 — close the gate

**Branch:** `s1.11-close-the-gate` · **Acceptance:** `[S1-A1]`, `[S1-A4]`, and the four boxes the earlier steps proved

### Phase 1 — `fixtures/large-dataset.ts`

`seededEntries({ count, timeZone, start, seed })`. A seeded LCG, never `Math.random`, never `now()`.

### Phase 2 — the 5,000-entry harness page

`harness/large-dataset.html` + `.ts`, at `zoom: 'preset'` so the content is wider than the pane. This is the only configuration that exercises the horizontal window, so the page is the proof, not a demo.

### Phase 3 — acceptance ids in test titles

Put `[S1-A1]` … `[S1-A5]` in the titles of the tests that prove them. The convention is greppable in both directions: from a box in `plans/03-slices.md` to its test, and from a red test to the box it breaks.

### Phase 4 — `[S1-A4]`, the D9 demo

Four lines, per `plans/02` §5, sharing one `TimeScaleModel` and one `ScrollModel`. Apply C2. If the demo needs a fifth line — a manual `render()`, a resize nudge, a subscription — that is a finding against the API, not something the harness may paper over.

### Phase 5 — something must run e2e, or the gate is a promise · **closed early**

`[S1-A1]` and `[S1-A4]` are Playwright tests and `scripts/slice-gate.mjs` shells out to `pnpm test:e2e` for both, so an unrun e2e suite makes the S1 gate unprovable. `.github/workflows/ci.yml` has no e2e job and every trigger in it is commented out.

**Settled: `pnpm test:e2e` runs in `.githooks/pre-push`, beside `pnpm verify`.** It is not folded into `verify`, because `verify` is kept at CI parity (`docs/04` §3) and e2e is not a CI job. Recorded in `docs/04` §3.1 with the reason, so a reader can tell "in the hook on purpose" from "missing from CI".

Left for S1.11 itself:

1. Confirm the gate's e2e checks pass through the hook path — the same `pnpm test:e2e` the gate calls.
2. When the `push` / `pull_request` triggers come back on, e2e gets its own CI job (`pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e`) and the hook line stays as the local half. Turning the triggers on changes what every push costs, so it is the repository owner's call, not this step's.

### Phase 6 — the gate itself

Add the `S1` entry to `scripts/slice-gate.mjs` with the six checks from the S1.11 comment. `human: []`. Every S1 box is machine-checkable, so no box may be left to a person. Shell out to `pnpm test:e2e`, not to `pnpm playwright test`.

### Phase 7 — the ledger

- Tick the five acceptance boxes in `plans/03-slices.md`.
- Move I9 and I12 in `docs/01-invariant-guard-matrix.md` from `PLANNED`/`AUTO-PARTIAL` to enforced, naming the tests and rules. Correct I12's row: it calls the scroll rule `no-raw-scroll`, and the shipped file is `no-scroll-outside-scroll-model`. Correct `docs/02` B4 the same way.
- Decide #33 (`GanttShell` captures `entries` by reference, so nothing re-renders when the entry list changes). Fix it, or defer it to S2's data core with the reason written down. Do not leave it open and unmentioned.
- Move `plans/need-fixing/architecture-review-pr10-notify-primitive-2026-08-23.html` to `plans/fixed/`, or list what in it is still open.
- Delete `plans/temp_todo_for_1.7.md` and this file.
- Bump `.slice` to `S2` in a separate reviewed commit. The gate script reports; it does not advance.

---

## 8. Definition of done

S1 is finished when all six are true:

1. The five acceptance boxes in `plans/03-slices.md` are ticked, each against a test that carries its id.
2. `node scripts/slice-gate.mjs` prints an S1 gate and every check passes.
3. `pnpm verify` is green.
4. `pnpm test:e2e` is green, and `.githooks/pre-push` runs it on every push.
5. I9 and I12 are enforced by rules that exist, each with a red fixture.
6. `harness/` restates no library default, owns no pane CSS, and re-derives nothing the library computes.

---

## 9. Risks

| Risk | Countermeasure |
|---|---|
| S1.8 grows into one large change: panes, surfaces, a bus, a splitter and a composition root together | Seven phases, each green on `pnpm verify`. The bus (phase 4) can land as its own PR if the diff gets large. |
| The first event bus sets a precedent that S2 must live with | Keep it at two events and one subscribe shape. Review it against `plans/02` §3 before it merges, not after. |
| `zoom: 'preset'` first makes `max.x` non-zero, so every latent x-axis bug appears at S1.9, not S1.8 | S1.8 measures the timeline pane's scrollable width against `frame.contentWidth` (S1.8 README D-S1.8-10). The check holds at `max.x = 0`, so the defect is proven closed one step before anything depends on it. |
| The three new READMEs repeat the issue comments and then drift from them | Each README states that it supersedes its comment, as `plans/s1.5-scroll-model/README.md` §0 already does. |
| The ~150-line soft cap gets treated as a style rule | It is R1's countermeasure. A file that wants to grow past it is a missing seam. Say which seam, in the PR. |
