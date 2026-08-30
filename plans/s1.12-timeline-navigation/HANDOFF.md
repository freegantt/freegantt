# S1.12 handoff — 2026-08-28

Picking this back up: read `plans/s1.12-timeline-navigation/README.md` first (the settled spec),
then this file for where implementation actually stands. `.slice` is already `S1.12`;
`scripts/slice-gate.mjs` already has the `S1.12 → S3` gate entry and it passes (`[S1-A6]`–`[S1-A10]`).

## Fixed this session — timeline pane failed to shrink on zoom-out

**Consumer report:** "the container doesn't shrink when you change zoom levels." Confirmed and
fixed. Also checked the today line report ("we don't see a today line yet") — not a bug, see below.

**Root cause:** `render/dom/index.ts`'s `headerLayer` (`.fg-header`) never got an explicit width and
`.fg-header` had no `overflow` rule (default `visible`). A boundary tick's cell is rendered at one
full calendar-unit width (`ticks()`, `time/scale.ts`) — for a coarse preset (`weekMonthYear` and up)
over a dataset shorter than that unit, that cell can be many times wider than `frame.contentWidth`.
With nothing clipping it, the oversized tick `<div>` inflated the timeline pane's native
`scrollWidth` far past what `frame.contentWidth`/`contentSizer` said the content should be — the pane
looked "expanded" and never shrank back down on zoom-out. `harness/data.html`'s dataset
(`sampleEntryInputs.slice(0, 8)`, ~3 weeks) reproduces it directly: `scrollWidth` jumped from 1158px
to 6041px stepping from `weekAndMonth` to `weekMonthYear` and stayed there through `year`, on a 990px
pane.

**Fix**, two lines:
- `src/view/styles.ts` — `.fg-header` gains `overflow: hidden`.
- `src/render/dom/index.ts` `sync()` — `headerLayer.style.width = \`${frame.contentWidth}px\`` every
  frame, so the clip lands on the content boundary instead of on whatever width the header's box
  defaulted to (the pane's client width, not the content's — which is also why a normal scrolled
  dataset didn't show this bug: ticks tile edge-to-edge with content there, so the unclipped overflow
  happened to coincide with the real content edge).

**Test:** `e2e/timeline-content-width.spec.ts` (new) — asserts `.fg-timeline-pane`'s `scrollWidth`
never exceeds `clientWidth` (±1px) at any `zoomOut`/`zoomIn` step on `harness/data.html`'s short
dataset. Verified red on the pre-fix code (`scrollWidth` 1158 vs an expected ≤991), green after.
Also manually verified the fix doesn't regress the normal case: scrolled a multi-year dataset to
start/middle/end at the `day` preset (content wider than pane) and confirmed header ticks stay
visible and correctly positioned throughout (screenshot-checked).

**Today line — not a bug.** `harness/zoom.html`'s default `sample` dataset starts 2026-09-01; "today"
(2026-08-28, this session's date) is three days before that, so `computeFrame` correctly withholds
the `TodayLine` decoration per D-S1.12-14 ("`now()` falls inside `scale.range`"). Switching to the
`multi-year` dataset (spans the current date) shows the line correctly. Nothing to fix here — flagging
so the next agent doesn't re-diagnose it.

**Not run this session:** the pre-existing item 1 below (test files still on `tickWidthPx`, `tsc`
fails on five test files) and five e2e failures pre-dating this session's change, confirmed
pre-existing by stashing just this fix and re-running: `harness.spec.ts` "grid pane rows are actually
painted after scrolling" and "no row-label gutter", and `pane-resize.spec.ts`'s three tests (window
resize re-fit, splitter drag re-fit, pixel alignment after drag). These look like the same class of
not-yet-triaged breakage item 1 already calls out — worth folding into that pass rather than
re-diagnosing from scratch.

## Done — all of `src/`, typechecks and lints clean

Ran `npx tsc --noEmit -p .` (zero errors outside `*.test.ts`) and `npx eslint` on every touched
file after each edit. §8's `time/`, `layout/`, `view/`/`render/`, and `api/` checkboxes are all
ticked in the README.

- **`src/time/scale.ts`** — `tickWidthPx` → `preferredTickWidthPx`, `minTickWidthPx?` added;
  `HeaderFormat` gained a `locale` param; new `DateFormat` union; new `minPxPerMsForPreset`.
- **`src/time/zone.ts`** — `weekOfYear` (D-S1.12-13).
- **`src/time/format.ts`** — rewritten: `resolveDateFormat` (memoized via a module-level `WeakMap`
  keyed by the options object's identity, nested under a `zone|locale` string — the I2-legal shape
  for a stateless-formatter cache, see the comment there and `time-scale-model.ts`'s `internals`
  WeakMap for precedent); `formatDate`/`formatEndInclusive` gained a `locale` param;
  `formatWeekNumber`; `MONTH_ABBR` deleted.
- **`src/time/presets.ts`** — rewritten: every shipped band's `format` is now an
  `Intl.DateTimeFormatOptions` object (frozen module-level constants — freezing is required, or the
  no-module-level-state lint fires); `hourDayWeek`/`dayWeekMonth`/`weekMonthYear` added;
  `ShippedPresetId` widened to 11; new `ZOOM_PRESETS` (finest-first, 9 rungs, D-S1.12-5).
- **`src/time/index.ts`**, **`src/layout/index.ts`**, **`src/api/index.ts`** — new exports wired
  through (`minPxPerMsForPreset`, `weekOfYear`, `resolveDateFormat`, `formatWeekNumber`,
  `DateFormat`, `ZOOM_PRESETS`, the three new presets).
- **`src/layout/frame.ts`** — `LayoutInput.locale`/`.todayLine`; `computeFrame` resolves each
  header band's format via `resolveDateFormat` and emits a `TodayLine` decoration when `now()` is
  inside `scale.range`.
- **`src/layout/viewport/time-scale-model.ts`** — `#resolvePxPerMs` now floors via
  `minPxPerMsForPreset` and ceilings via a new `MAX_CONTENT_PX = 16_000_000` constant, applied to
  all three fit modes (D-S1.12-2, D-S1.12-4).
- **`src/layout/viewport/viewport.ts`** — `zoomPresets` get/set, `canZoomIn`/`canZoomOut`,
  `zoomIn`/`zoomOut` (step `zoomPresets` by reference-equality index, re-anchor in one `batch()`),
  `zoomToSpan(span: TimeSpan)`, `panToInstant(i, align)`.
- **`src/view/gantt-shell.ts`** — `locale`/`todayLine` options + live get/set; delegates
  `zoomPresets`/`canZoomIn`/`canZoomOut`/`zoomIn`/`zoomOut`/`zoomToSpan`/`panToInstant` straight to
  `#viewport`; `render()` threads `locale`/`todayLine` into `computeFrame` and calls
  `#paneLayout.setHeaderBandCount(frame.header.bands.length)` every render.
- **`src/view/pane-layout.ts`** — `--fg-header-height` reading deleted; the spacer is now an empty
  shell filled by `setHeaderBandCount(n)`, which renders one `.fg-band` per header band (no-op when
  the count is unchanged).
- **`src/view/styles.ts`** — `.fg-header`/`.fg-band`/`.fg-tick`/`.fg-grid-spacer` rewritten per
  D-S1.12-9 (`--fg-band-height` token, sticky header, D-S1.12-15); `.fg-today-line` +
  `--fg-today-line-color` token added to both light and dark palettes.
  **Watch out:** a backtick inside a CSS comment *inside* the `BASE_STYLESHEET` template literal
  will terminate the literal early and produce a confusing parse error one line down — happened
  once while writing this, fixed by dropping backticks from comments in that file.
- **`src/render/dom/index.ts`** — `.fg-today-line` element created in `mount()`, toggled via
  `el.hidden` (not `style.display` — the `no-inline-style-outside-geometry` lint only allows
  transform/width/height inline) and positioned via `transform` in a new `syncDecorations()`.
- **`src/api/gantt.ts`** — `locale`, `todayLine`, `zoomPresets`, `canZoomIn`/`canZoomOut`,
  `zoomIn`/`zoomOut`, `zoomToSpan` (loose input), `panToDate`/`panToToday` (loose input); `range`
  setter now takes `'fitDataset' | { start: InstantInput; end: InstantInput }` and converts via
  `time/toInstant(dataset.timeZone, …)` in a new private `#toRange` — **`GanttShell.range` itself
  was deliberately left on branded `TimeSpan`**; only the `Gantt` (api/) layer does loose-input
  conversion, per D-S1.12-8's "api/ maps fields; it never does date math of its own" and CLAUDE.md.

## Not started — pick up here next

1. **Existing tests reference the old field names/shapes and need updating**, per §6's own
   instruction that "the existing assertions pass unmodified except those asserting the pre-floor
   `'pane'` density, each of which gets a one-line note naming D-S1.12-2":
   - `src/layout/viewport/time-scale-model.test.ts`, `src/render/dom/index.test.ts`,
     `src/render/null/index.test.ts`, `src/time/presets.test.ts`, `src/time/scale.test.ts` all still
     write `tickWidthPx:` — rename to `preferredTickWidthPx:` (TS compile errors today, not just
     assertion failures).
   - `npx vitest run` currently shows 11 failing tests across `time-scale-model.test.ts`,
     `viewport.test.ts`, `gantt-shell.test.ts`, `pane-layout.test.ts`, `api/gantt.test.ts`,
     `time/scale.test.ts` — some are the expected pre-floor-density assertions that need the
     D-S1.12-2 one-line note; **`viewport.test.ts`'s "a throwing run still flushes" and
     `time-scale-model.test.ts`'s "no observer sees an intermediate state mid-batch" were NOT
     triaged** — check whether those are also floor-driven (the day preset's new `minTickWidthPx:
     32` changes what pxPerMs a given pane/range resolves to in fixtures that don't expect it) or
     an actual regression before assuming either way.
   - `pane-layout.test.ts:26`'s `--fg-header-height` spacer test needs replacing with a
     `setHeaderBandCount` test per §6 ("`pane-layout.test.ts:26` changes accordingly" per
     D-S1.12-9).
2. **New tests from §6** — gate ids `[S1-A6]`–`[S1-A10]` now exist in `e2e/zoom.spec.ts` and the matching
   vitest titles. Remaining coverage still useful: pixel-identical header/spacer heights in jsdom
   (e2e covers that); a11yLabel locale (header labels are covered).
3. **Harness (§3.7, D-S1.12-16)** — done, and extended beyond the spec's own ask. `fixtures/multi-year-dataset.ts`
   exists (60 entries, ~3 years, seeded LCG like `seeded-dataset.ts` but with wider gaps). `harness/zoom.html`/
   `zoom.ts` carry the full §3.7 toolbar (zoom in/out, preset, fit, locale, Today, today-line toggle, sample/
   multi-year dataset switch) and still expose `window.__gantt` unchanged, so `e2e/zoom.spec.ts` keeps passing.
   Every harness nav's "Zoom & presets" label is now "Timeline & navigation" (`index.html`, `zoom.html`,
   `data.html`, `diagram.html`, `doc.html`, `large-dataset.html`, `scroll-sync.html`).
   - The consumer asked for the navigation surface on every demo page, not just `zoom.html` — a new
     `harness/timeline-toolbar.ts` (`mountTimelineToolbar`) holds the shared zoom-in/zoom-out/preset/Today
     wiring so `index.html`/`main.ts` and `data.html`/`data.ts` mount the same core toolbar without copying
     it three times; `zoom.html` alone opts into the extra `fit`/`locale`/`todayLine`/dataset-switch controls
     via the function's options. `data.ts`'s import handler remounts the toolbar after it rebuilds `gantt`
     (same pattern as `zoom.ts`'s dataset switch), since a fresh `Gantt` instance needs a fresh toolbar bound
     to it.
   - **Found and fixed while wiring this up:** `e2e/zoom.spec.ts`'s two pre-existing assertions counted
     `.fg-band` unscoped, which used to mean "header bands" but now also matches the D-S1.12-9 grid-pane
     spacer's mirrored empty `.fg-band`s — so the default 1-band `day` preset was reading as 2. Rescoped both
     assertions to `.fg-header .fg-band`. This is not one of the "not yet triaged" items below; it's a direct
     consequence of D-S1.12-9's spacer change and was verified against a clean checkout of `index.html`/
     `main.ts` to confirm it wasn't caused by the toolbar addition.
   - Verified with Playwright: no console/page errors on any of the three pages after clicking zoom in/out,
     preset select, Today, and (on `zoom.html`) the fit/locale/today-line/dataset controls.
   - **Not done:** the CLAUDE.md-mandated full `harness/main.ts`-and-every-page review against the harness
     rule (this pass only touched what §3.7 and the toolbar request needed) — still open, see below.
4. **§7 spec edits** — landed: `CONTEXT.md`, `plans/01` §5.1, `plans/02` §2/§4/§5,
   `plans/s1.9-presets-and-zoom/README.md` §8, `plans/s1.8-pane-layout/README.md` §177,
   `plans/s1.10-theming-and-a11y/README.md` §270, `docs/adr/0001` (Intl.DateTimeFormat line).
5. **Gate** — `S1.12 → S3` is green (`[S1-A6]`–`[S1-A10]` exist and pass).

## A design note worth re-checking

`zoomIn`/`zoomOut` only reassign `preset` (D-S1.12-6) — they never touch `fit`. Under the default
`fit: 'pane'`, this only visibly changes anything once the new preset's `minTickWidthPx` floor
exceeds the pane-fit density, which is precisely the D-S1.12-2 floor doing double duty as the zoom
mechanism. That reading was inferred from the spec text (§2 D-S1.12-2/6/7 together) rather than
stated as one sentence anywhere — `[S1-A7]` now covers step/anchor/no-op in vitest. The public
`zoomIn` JSDoc states the honest contract: it steps the preset only; under `fit: 'pane'`, density
stays pane-fill until the floor bites. Option B (also write preferred density) stays closed (D-S1.12-6).
