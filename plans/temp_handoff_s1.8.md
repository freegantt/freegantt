# S1.8 implementation — handoff (WIP, mid-slice)

Branch: `s1.8-pane-layout` (off local `main` @ `176966e`). Not committed yet as of this handoff —
run `git status`/`git diff` to see the working tree. Delete this file once S1.8 is closed out; it is
a session handoff note, not a spec.

## Why this branch exists

User asked to start `plans/s1.9-presets-and-zoom/README.md`. That spec's own baseline note says code
order must be S1.8 → S1.9 (the pane split gives the timeline pane its own coordinate frame, which
anchored zoom's `instantForX(scroll.x + anchorX)` needs). A haiku subagent verified S1.8
(`plans/s1.8-pane-layout/README.md`) was **fully unimplemented** — zero lines in `src/`, despite the
user's expectation it was already done. User said: implement S1.8 now, stop before starting S1.9.

**Read `plans/s1.8-pane-layout/README.md` in full before resuming** — this note assumes it. Read
`plans/s1.9-presets-and-zoom/README.md` too, once S1.8 actually lands, before starting that slice.

## Design decisions made while implementing (not fully spelled out in the spec's API section)

- **DOM structure**: `PaneLayout` builds `host (flex) → [gridPane (flex column, fixed width) →
  [spacer, rowLayer], splitter, timelinePane (flex:1, overflow:auto)]`. `Panes.grid` is the
  **rowLayer** itself (not the outer gridPane wrapper) — this is what `RenderSurfaces.grid` mounts
  into and what render/dom writes rows and the `translateY(-visible.y)` transform onto. The spacer
  lives inside the gridPane wrapper (a sibling of rowLayer, not inside `Panes.grid`), sized from
  `--fg-header-height`. This satisfies "the grid pane's row layer follows the scroll owner" (spec
  §3.4) while keeping `Panes` to exactly the three fields the spec's interface lists.
- **CSS classes added** (for harness/S1.10 stylesheet hooks): `.fg-grid-pane`, `.fg-grid-spacer`,
  `.fg-rows` (now the row layer, same class name as before — just a different owner), `.fg-splitter`,
  `.fg-timeline-pane`. `.fg-header`/`.fg-bars` unchanged, now children of the timeline pane instead of
  the old single host.
- **`--fg-splitter-width`** fallback chosen as `4` (not stated in the spec; spec only says the token
  exists). **`--fg-header-height`** fallback `20` (spec-stated, matches old harness hardcode).
- **`no-flow-layout-rows` rule**: implemented as a syntactic (non-type-aware) rule banning
  `offsetHeight`/`clientHeight` member reads and `getBoundingClientRect()` calls, scoped to
  `src/view/**` and `src/render/dom/**`, **with a documented filename exemption** for
  `pane-layout.ts` and `pane-size-attachment.ts` (both legitimately read `clientWidth`/`clientHeight`
  to measure the *pane's own box*, a different concept from *row* height per CONTEXT.md's "Pane size"
  vs "Row" entries — banning that would break the existing, already-necessary synchronous first
  measurement pattern). Did **not** implement the harder "assignment to `style.height` not sourced
  from `frame.rows[i].height`" half — too fragile syntactically; this is a documented residue, same
  AUTO-PARTIAL shape as the existing `no-time-to-pixel-math` rule. **This file was not written yet as
  of this handoff — see TODO below.**
- Chose **not** to add a literal fixture file under `eslint/rules/fixtures/` for this rule; matched
  the precedent of `no-scroll-outside-scroll-model` (another syntactic, non-type-aware rule), whose
  red/green cases live entirely in its own `.test.cjs` `invalid`/`valid` arrays. `scripts/run-rule-
  tests.mjs` (part of `pnpm guards`) runs every `eslint/rules/*.test.cjs`, which is what actually
  wires this into CI — `scripts/guard-red-test.mjs` is dependency-cruiser-specific and unrelated
  despite the spec's TODO line naming it.

## Files already written this session (in `src/`, on this branch, uncommitted)

- `src/model/errors.ts` — `HostNotFoundError` added. `src/model/index.ts` — exported.
- `src/render/backend.ts` — `RenderSurfaces<THost>`, `mount(surfaces)`, `rowLabelWidth` deleted.
- `src/render/dom/index.ts` — rewritten: grid/timeline surface split, no gutter offset, row width
  100%, grid layer's own `translateY(-visible.y)` per frame. `src/render/dom/index.test.ts` — updated
  to match (mounts two elements, asserts grid/timeline split and the transform).
- `src/render/null/index.ts` + `.test.ts` — new `mount(surfaces)` signature, `rowLabelWidth` dropped.
- `src/view/pane-layout.ts` + `.test.ts` — new, per above design.
- `src/view/splitter.ts` + `.test.ts` — new, `attachSplitter`/`SplitterHooks` per spec §3.2.
- `src/view/event-bus.ts` — new, `EventBus<TEvents>`/`GanttEventMap`/`GridWidthChange` per spec §3.3.
  **No standalone test file written** (not explicitly required by spec §6; covered indirectly once
  `api/gantt.test.ts` is extended — not yet done, see TODO).
- `src/view/gantt-shell.ts` — rewritten as the composition root per spec §3.5: constructs
  `PaneLayout`, mounts backend into `{grid, timeline}`, wires `attachScroll`/`attachPaneSize` to
  `panes.timeline`, wires `attachSplitter` to `panes.splitter`, adds `gridWidth` get/set (routes
  through the same `#commitGridWidth` cancelable sequence as a drag), `on`/`off` delegating to a
  private `EventBus`. `resolveHost` throws `HostNotFoundError` now, not a bare `Error`.
- `src/view/index.ts` — exports `GanttEventMap`/`GridWidthChange` types.
- `src/api/gantt.ts` — `Gantt.gridWidth` get/set, `on`/`off`, `GanttOptions.gridWidth`.
- `src/api/index.ts` — exports `FreeGanttError`, `HostNotFoundError`, `GanttEventMap`,
  `GridWidthChange`.

## NOT yet done — pick up here

In roughly the order the spec's own TODO (`plans/s1.8-pane-layout/README.md` §8) lists them:

1. **`CONTEXT.md`** — 7 new glossary entries (Grid pane, Timeline pane, Splitter, Grid width, Pane
   layout, Render surface, Event bus) + edit the existing **GanttShell** entry to say the shell
   *composes* the split, `PaneLayout` *holds* it. See spec §7 for exact wording guidance and D-S1.8
   decisions for content. Do this **before** anything below reads as finished — naming skill step 1.
2. **`eslint/rules/no-flow-layout-rows.cjs`** — not written yet. Design decided above; write it
   mirroring `eslint/rules/no-scroll-outside-scroll-model.cjs`'s shape (filename-exemption pattern).
   Plus `no-flow-layout-rows.test.cjs`. Register both in `eslint/rules/index.cjs` and add
   `'freegantt/no-flow-layout-rows': 'error'` to the shared `src/**/*.ts` rules block in
   `eslint.config.js` (same block as the other `freegantt/*` rules — do NOT add a separate scoped
   block; the rule self-scopes by filename, matching its siblings).
3. **`docs/02-lint-rules.md` §3.10** — correct scope text (was `src/view/grid/**`+`src/view/timeline/
   **`, neither existed; now `src/view/**` + `src/render/dom/**`), drop the `PLANNED (S1)` tag, note
   the exemption and the "assignment to style.height" residue.
4. **`docs/01-invariant-guard-matrix.md`** I9 row — status `PLANNED (S1)` → `AUTO-PARTIAL` (mirrors
   I12's own AUTO-PARTIAL shape), name the residue.
5. **`src/view/gantt-shell.test.ts`** — needs a full rewrite pass, NOT just incremental edits: DOM
   shape changed (`.fg-bar`/`.fg-row` etc. now live under `.fg-timeline-pane`/`.fg-grid-pane`
   respectively, not directly under `host`). Existing assertions like
   `host.querySelectorAll('.fg-bar')` still work (querySelectorAll searches descendants), so most
   assertions likely still pass unchanged — but verify by running `pnpm test:dom` rather than assuming.
   Must ADD: `[S1-A2]` pixel-equality test (grid row tops == timeline bar tops at a fractional zoom,
   read from live DOM); D1 regression test (`timelinePane.scrollWidth === frame.contentWidth` ±1px,
   per D-S1.8-10 — note: reads `paneLayout`/`panes.timeline` off the shell, may need a way to reach it
   from the test, e.g. via `host.querySelector('.fg-timeline-pane')`); `resolveHost` now throws
   `HostNotFoundError` with `.code === 'host-not-found'` — the existing "throws naming the selector"
   test should still pass (message unchanged) but consider asserting the typed error/code too.
6. **`src/api/gantt.test.ts`** — extend per spec §6: `beforeGridWidthChange` returning `false` leaves
   `gantt.gridWidth` and the panes where they were; a non-vetoed change fires `gridWidthChange`
   exactly once with `{from, to}`; `off` stops a handler; setting `gantt.gridWidth` directly fires the
   same pair.
7. **Harness** (`harness/index.html`, `harness/scroll-sync.html`) — remove `overflow: auto`, rename
   `--fg-row-label-width` → `--fg-grid-pane-width`, and remove every CSS rule the library now owns
   structurally (the old `.fg-rows`/`.fg-bars` `position:absolute;inset:0;top:20px` rules — those
   elements are no longer positioned that way; `PaneLayout` now owns that structure inline). Decide
   what visual styling (colors, fonts, `.fg-tick`/`.fg-bar` cosmetics) the harness keeps until S1.10
   ships a real stylesheet — likely most of it stays, just the *structural* positioning rules go.
   Check `harness/main.ts`/`harness/scroll-sync.ts` too per CLAUDE.md's harness-review rule (skim
   already done this session — they looked clean, no `src/`-restating gaps found, but re-check after
   the HTML edit in case new gaps appear).
8. **`e2e/pane-resize.spec.ts`** — extend for U1/U4 (drag re-fits the axis with no other call; two
   panes stay aligned after a drag). Also **fix the existing test**: `contentSizerRight()`'s formula
   `rowLabelWidth + contentWidth - 1` is now just `contentWidth - 1` (no gutter in the timeline pane
   sizer any more, per D-S1.8-2) — and the sizer now lives inside `.fg-timeline-pane`, not directly
   under `#gantt`, so the `Array.from(host.children).find(...)` traversal needs to look inside the
   timeline pane instead.
9. **Rename ledger** (spec §3.7 C) — grep each to zero once everything above lands: `rowLabelWidth`,
   `ROW_LABEL_WIDTH_PROPERTY`, `ROW_LABEL_WIDTH_POLICY`, `--fg-row-label-width`, `mount(this.#host)`,
   `measureTimeline(` (not `measureTimelinePane`), `gridWidthAt`, `onPropose`, `ScrollSource`. (Spot-
   checked already: none of these appear in the `src/` files rewritten this session.)
10. **Prose sites** (spec §3.7 D) — `src/view/scroll-attachment.ts:23`'s "`element` is the timeline
    pane" comment and `render/dom` gutter comments: verify current wording still reads true (mostly
    should, since scroll-attachment.ts wasn't touched this session and its comment was already
    forward-looking) — just confirm, no change expected.
11. **Spec-doc edits landed with this step** (spec §7): `plans/01-domain-architecture.md` §8.1 (mount
    takes `RenderSurfaces`) and §8.3 (grid pane follows by transform); `plans/02-public-api.md` §3
    (event table gains the grid-width pair), §4 (token rename + `--fg-splitter-width`/`--fg-header-
    height` added), §7 (`HostNotFoundError` named); `plans/s1.7-windowed-frame/README.md` §9 (tick the
    3 rows: `reveal`→S1.9, `overscan`→S1.9, `scale=`/`scroll=`→cut).
12. **Once everything above is green**: `pnpm verify` and `pnpm test:e2e`, then commit (branch
    `s1.8-pane-layout`, currently uncommitted) and open a PR per this project's branch-per-slice
    workflow (see memory `freegantt-pr-workflow.md`). **Do not start S1.9** until this PR is merged
    (or at least until the user says otherwise) — that was the explicit scope boundary for this
    session.

## Known open question to flag to the user, not resolved silently

`no-flow-layout-rows`'s exemption for `pane-layout.ts`/`pane-size-attachment.ts` is a judgment call
this session made unilaterally (the spec's D-S1.8-8 doesn't mention it — it just says "scope becomes
`src/view/**` and `src/render/dom/**`," full stop, silent on the pane-measurement conflict this
session discovered). Worth a one-line callout in the PR description so a reviewer can confirm the
call rather than discover it in a diff.
