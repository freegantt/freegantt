# S1.12 follow-up — header readability, today line, redundant units

Filed after S1.12 shipped (commits through `f2ab918`), before S3 starts. Triggered by user
testing `harness/zoom.html`: "today line still doesn't show up" + "headings in timeline were
impossible to read." Root-caused live with Playwright against the dev server (`pnpm dev`,
`/zoom.html`). This doc is the record of what was found and fixed; re-read it before touching
`src/time/presets.ts`, `src/layout/frame.ts`'s band-building code, or `src/view/styles.ts`'s
`.fg-tick` rule.

## Findings (root causes, not symptoms)

1. **Today line "not showing" was never a rendering bug.** `todayLine` defaults to `true`
   everywhere and the decoration is emitted correctly (`layout/frame.ts`). Every harness demo's
   `sampleEntryInputs` (`fixtures/sample-dataset.ts`) starts 2026-09-01 — a date chosen once and
   frozen for deterministic unit tests (dozens of tests assert exact `2026-09-*` instants; do
   **not** make that fixture relative to `now()`). Whenever "today" falls outside the dataset's
   `fitDataset` range, the line is correctly absent by design (D-S1.12-14: only draws inside
   `scale.range`). The user's own diagnosis, confirmed: they couldn't see the line because the
   header labels were also unreadable, not because it was broken. **No code change was the fix
   here** — this is a demo-data/observability gap, not a library bug. Left as-is; noted so nobody
   re-diagnoses it as a real bug later. (Superseded by pass 2, below — this gap is now closed with
   a dedicated fixture, not left as-is.)

2. **Header labels repeated the same year/month at every band.** Every shipped multi-band preset
   used the *same* `Intl.DateTimeFormatOptions` object (usually `DAY_FORMAT`, year+month+day) on
   more than one band, so e.g. `weekAndMonth`'s month band said "Sep 2026" and the week band
   directly under it said "Sep 1, 2026" — same year and month, spelled out twice, once per row,
   forever. Fixed generically, not per preset: `time/format.ts` gained
   `dedupeHeaderFormats(headers)`, which walks a preset's `headers` (coarsest-first, its own
   documented order) and strips `year`/`month` from a later band's format once an earlier band
   already states it. Wired into `layout/frame.ts`'s band-building loop. A callback format
   (`formatWeekNumber`) passes through untouched — only `Intl.DateTimeFormatOptions` fields are
   ever inspected. **Customization knob**: `ViewPresetHeader.repeatCoarserUnits?: boolean` (default
   `false`/unset = dedupe applies) opts one band out; both the type and `formatHour` are exported
   from `api/` for custom-preset authors. Memoized per `headers` array identity (`WeakMap`) so the
   stripped format object keeps one identity across frames — `intlFormatter`'s own cache is keyed
   on that identity, so this does not rebuild an `Intl.DateTimeFormat` every frame.

3. **A coarse band's label can render entirely off-screen — this *was* "year never renders at the
   top."** A tick's `x` is the calendar boundary's true content-pixel position. For a coarse unit
   (year, sometimes month), that boundary is very often behind the visible pane — the calendar
   year started before the dataset's own first entry, or the user scrolled past it — while most of
   the tick's *cell* is still on screen. The old code positioned the label at that true (possibly
   negative/off-screen) `x` unconditionally, so the label simply never painted even though the
   `FrameHeaderBand` and its tick were both present in the frame (confirmed via Playwright: DOM had
   the "2025" tick, `getBoundingClientRect()` showed most of it left of the header's own
   `overflow: hidden` clip edge). Fixed in `layout/frame.ts`: each tick's rendered `x` is now
   clamped to `max(tick.x, visible pane's left edge)`, with `width` reduced by the same amount
   (never below 0) — a "sticky label within its own cell" behavior, standard in calendar/Gantt
   headers. The tick's `instant` (what drives the label's actual text) is untouched; only where it
   paints moves. This is a real, general fix — it doesn't just help the year band, it helps every
   band whenever its own boundary is scrolled past. (Refined in pass 2, below — the initial version
   of this fix had its own bug.)

4. **Hour labels always showed a leading zero, in the environment's default locale.** Simply
   setting `hour: 'numeric'` on the `Intl.DateTimeFormatOptions` object was not enough:
   `en-US`'s CLDR data zero-pads its own 24-hour ("h23"/"h24") numeric pattern regardless of the
   `'numeric'` vs `'2-digit'` style — verified directly against Node's ICU
   (`{hour:'numeric', hour12:false}` still renders `"09:00"` in `en-US`; `en-GB`/`de-DE`/`fr-FR`/
   `ja-JP` all correctly render `"9:00"`). No `Intl.DateTimeFormatOptions` combination gets an
   unpadded 24-hour clock in every locale. Fixed by adding `formatHour` (a `HeaderFormat`
   callback, same escape-hatch precedent as `formatWeekNumber`) to `time/format.ts`, built off
   `zone.ts`'s `toPlain` and manual `${hour}:${minute}` string building. `hourPreset` and
   `hourDayWeekPreset` now use it instead of an Intl options object.

5. **Minimum tick widths were below what their own labels need, so labels overlapped/garbled
   instead of clipping.** Measured (Playwright + Canvas `measureText`, `system-ui` at 10–16px) the
   worst-case label width for every shipped preset's *finest* band (the one `minTickWidthPx`
   actually floors — coarser bands are proportionally wider at the same `pxPerMs`, so they were
   never the risk) — see the git history of this doc's commit for the raw numbers. Two things
   changed as a result:
   - `dayPreset`/`weekPreset`/`monthPreset`/`hourPreset`/`hourDayWeekPreset`'s `minTickWidthPx` (and
     `preferredTickWidthPx`, which must stay ≥ its own floor) were raised to fit their real
     worst-case label at a 12px tick font, plus small padding. `dayWeekMonthPreset`'s floor moved
     from 20→28 for the same reason (small bump, since dedupe already shrank its day band's label to
     a bare number). Presets whose finest band's label shrank thanks to dedupe (`dayAndWeek`,
     `weekAndMonth`, `monthAndYear`, `weekMonthYear`) needed no change — their existing floors
     already covered the now-smaller label.
   - `.fg-tick` in `view/styles.ts` gained `box-sizing: border-box`, `padding: 0 4px`,
     `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis` — structural/robustness
     defaults (not typography: font-family/size still stay consumer-owned per D-S1.10-6/D-S1.11-8),
     so a label that's still too wide for its cell (a custom preset with an aggressive
     `minTickWidthPx`, a mid-resize frame, an unusually verbose custom format) clips with an
     ellipsis instead of overflowing into its neighbour and garbling both — which is what made the
     headers "impossible to read" in the first place, independent of any single preset's numbers.
   - Every harness `*.html` page's own `.fg-tick { padding-left: 2px; white-space: nowrap; height:
     20px; line-height: 20px; }` was trimmed to just `font-size: 10px` — the rest was already
     restating what the base stylesheet now owns (the height/line-height lines were *already*
     restating `var(--fg-band-height, 20px)` before this pass; CLAUDE.md's "harness code that
     re-derives what the library already computes is an API gap" applies here even though it
     predates this specific change).

## Files touched (pass 1)

- `src/time/scale.ts` — `ViewPresetHeader.repeatCoarserUnits?: boolean`.
- `src/time/format.ts` — `dedupeHeaderFormats`, `formatHour`.
- `src/time/index.ts`, `src/api/index.ts` — export both, plus `ViewPresetHeader`/`TickStep` types
  (a custom-preset author needs the header type to use `repeatCoarserUnits`).
- `src/time/presets.ts` — `formatHour` replaces the old `HOUR_FORMAT` object; revised
  `minTickWidthPx`/`preferredTickWidthPx` on `hour`/`day`/`week`/`month`/`hourDayWeek`/
  `dayWeekMonth` presets (see finding 5).
- `src/layout/frame.ts` — deduped formats wired into band-building; sticky-label clamp (finding 3).
- `src/view/styles.ts` — `.fg-tick` padding/overflow/ellipsis.
- `harness/*.html` (5 files) — trimmed redundant `.fg-tick` rules.
- Tests: `src/time/format.test.ts` (new `dedupeHeaderFormats` suite), `src/layout/viewport/
  time-scale-model.test.ts` (several pane-width fixtures bumped past `dayPreset`'s new, larger
  floor — see inline comments at each changed assertion for the arithmetic).
- `etc/freegantt.api.md` regenerated (`api-extractor run --local`) for the new public surface
  (`formatHour`, `ViewPresetHeader`, `TickStep`).

`pnpm verify` is green end to end as of this doc.

## Pass 2 — e2e coverage, tick borders, two real bugs found along the way

Commit `f3efab7`. Picks up the "Not done" list below the pass-1 line.

- **e2e tests added**: `e2e/header-readability.spec.ts` covers findings 2, 3, 4, 5 against
  `harness/zoom.html`, following `e2e/zoom.spec.ts`'s `window.__gantt` pattern. `test:e2e` stays
  excluded from `pnpm verify`/the push gate, per the existing precedent.
- **Real bug found while writing the finding-5 overlap test**: the finding-3 sticky-label clamp
  (`layout/frame.ts`) clamped *every* tick left of the visible edge to the same x, not just the one
  tick whose cell actually straddles that edge. With the overscan buffer rendering several ticks
  before the true visible edge, this collapsed multiple ticks onto the same pixel column — visible
  as several stacked day labels at `dayWeekMonth`'s tight 28px floor. Fixed: the clamp now only
  applies when `tick.x < labelLeftClamp && tick.x + tick.width > labelLeftClamp` (the tick's cell
  spans the clamp line); a tick fully behind it keeps its own true `x`.
- **`.fg-tick` gained `border-left: 1px solid var(--fg-header-divider-color)`**, so adjacent ticks
  in one band read as separate columns — matches `.fg-band`'s existing `border-bottom` between
  bands.
- **New `fixtures/demo-dataset.ts`**: `sampleEntryInputs` stays frozen at 2026-09-01 (finding 1,
  above — dozens of unit tests depend on those exact instants). `demoEntryInputs` reshapes it onto
  the real calendar, starting 3 weeks before whatever "now" is when the module loads (through a few
  months after), so `todayLine`/`panToToday` have something real to show. Wired into
  `harness/main.ts`, `zoom.ts`, `scroll-sync.ts`, `data.ts` in place of `sampleEntryInputs`; unit
  tests and `sampleEntries` are untouched. **Verified correct**: with the dev server's real clock at
  2026-08-29, `.fg-bar[aria-label]` on every one of these pages reads "Discovery, Aug 8, 2026 – Aug
  13, 2026" for the first entry — Aug 8 is exactly 21 days before Aug 29. A full-page screenshot of
  `zoom.html` on load confirms it visually too. If this still looks like it "starts on today" in a
  real browser, it is very likely a stale tab that loaded before this fixture existed, or before a
  later `pnpm dev` restart — hard-refresh and re-check before re-opening this as a bug.
- **Real bug found once `demoEntryInputs` made the today line actually reachable**: it stopped
  partway down the pane on any dataset taller than one screenful, at whatever height the pane
  happened to be when the page first laid out. `.fg-today-line`'s CSS gave it `top: 0; bottom: 0`,
  but its parent (`timelineHost`, i.e. `.fg-timeline-pane`) is *both* the positioned ancestor an
  absolutely positioned child measures against *and* that same element's own `overflow: auto`
  scroll container — so `bottom: 0` resolved against the pane's own laid-out box (its visible
  clientHeight), never its scrollable content height. Fixed in `render/dom/index.ts`'s
  `syncDecorations`: the line now gets an explicit inline `height`,
  `Math.max(frame.contentHeight, frame.visible.height)` (the taller of the two, so a short dataset
  still fills the visible pane and a tall one gets its own full content height) — `height` is one
  of the geometry properties this codebase allows inline (D-S1.10-6). `.fg-today-line`'s CSS
  dropped `bottom: 0` accordingly. Covered by `src/render/dom/index.test.ts` (unit, both the short-
  and tall-dataset cases) and `e2e/today-line.spec.ts` (a real browser, scrollable pane). Both
  regression tests were checked against the pre-fix code and genuinely fail there.

## Tried and reverted in pass 2 — superseded by pass 4, below

**Auto-panning the harness pages to "today" on load** (`gantt.panToToday('center')` right after
construction in `main.ts`/`zoom.ts`) was implemented, screenshotted (it visibly works — the today
line lands centered with data on both sides), and then **reverted** because it broke three existing
e2e tests that have an unstated assumption baked in — the pane opens at `scrollLeft: 0`:

- `e2e/harness.spec.ts` "the timeline pane has no row-label gutter... (D1)" — measures the content
  sizer's extent via `getBoundingClientRect()` deltas, which are viewport-relative; scrolled away
  from 0, the measurement is off by exactly the scroll offset. Fixable (normalize by adding
  `el.scrollLeft`), but not attempted this pass.
- `e2e/zoom.spec.ts` "a preset switch redraws header bands with no bar remount (U1, I8)" — tags the
  first `.fg-bar` in DOM order, then asserts the same node survives a preset switch. Scrolled to
  "today" instead of the dataset start, the tagged bar is a different (deeper) row that fell out of
  the vertical/horizontal render window after the preset change, so the marker was lost. Whether
  this is only a test-assumption problem or an actual reconciler/virtualization interaction worth
  its own investigation was **not determined** — flagging both possibilities.
- `e2e/header-readability.spec.ts` finding 5 (this pass's own new test) also failed non-
  deterministically once the pane's default scroll moved.

**Do not re-add `panToToday` to these harness pages without first fixing or re-deriving the three
tests above** — they encode real assumptions the shared `zoom.html`/`index.html` fixture pages
currently satisfy, and several other tests likely share the same unstated assumption without
having been audited for it. The safer alternative if this is wanted again: give it its own harness
page (not the shared e2e fixture pages), or fix the D1 test's measurement properly first and then
work through the other two one at a time, re-running the full `test:e2e` suite after each.

**Update, pass 4: done — see below.** All three tests were fixed or (for two of them) revealed a
real library bug that pass 4 fixed instead of the test.

## Pass 3 — preferredTickWidthPx invariant, and two pre-existing e2e regressions found along the way

Commits `50c0a1c` (invariant) and `d306bb7` (e2e fixes), both pushed to `jolly-salmon`.

- **`preferredTickWidthPx >= minTickWidthPx` is now enforced**, not just convention. New
  `InvalidPresetError` (`code: 'invalid-preset'`, `src/model/errors.ts`, exported from `model/` and
  `api/`); a `validatePresetTickWidths` check in `src/time/presets.ts` runs from `freezePreset`
  (shipped presets, at module load) and `resolvePreset` (custom presets, at first use). This
  immediately caught a real, pre-existing violation: `dayAndWeekPreset` shipped with
  `preferredTickWidthPx: 24` below its own `minTickWidthPx: 32` since S1.9 — fixed by raising
  `preferredTickWidthPx` to 32. `etc/freegantt.api.md` regenerated for the new export. Unit tests in
  `src/time/presets.test.ts` (shipped-preset sweep + two `resolvePreset` cases for a custom preset).
- **Two e2e specs were failing before this pass touched anything** —
  `e2e/pane-resize.spec.ts` ("resizing the window re-fits the axis (#8)" and "dragging the splitter
  re-fits the axis with no other call (U4)") and `e2e/timeline-content-width.spec.ts`. Root cause:
  both picked viewport widths assuming dayPreset's old `minTickWidthPx: 32` (pre-header-readability);
  the pass-1 fix (finding 5, this doc) raised it to 96, which triples the floored content width at
  any given dataset span. The full demo dataset (~83 days) now floors at ~7968px — far past the old
  3000–3600px test viewports — and `harness/data.html`'s 19-day slice now floors at ~1824px, past its
  default 1280px viewport's ~990px pane. Confirmed pre-existing (not caused by this pass or by pass
  3's own preset change) by reproducing both failures identically on `7518b43` and `f2ab918` in a
  scratch `git worktree`, before editing anything. Fixed by widening each test's `setViewportSize`
  to clear the new floor (measured directly against a running `pnpm dev`, not calculated from the
  preset table by hand — see each test's own updated comment for the numbers and margins). All 25
  e2e specs pass; `pnpm verify` and the pre-push hook (which runs `test:e2e`) are both green.

## Pass 4 — sticky-clamp unit coverage, panToToday/panToDate unit coverage, auto-pan shipped

Commits `f109031` (sticky-clamp unit test), `37b08d9` (panToDate/panToToday/panToInstant unit
tests), `ea06cf5` (auto-pan + the two real bugs it exposed), all pushed to `jolly-salmon`.

- **Sticky-label clamp now has direct `computeFrame` coverage** (pass 3's "not done" item):
  `src/layout/frame.test.ts` gained a fixture built on `hourPreset` at a scale where 1px = 1 minute,
  so tick positions are hand-verifiable integers. Two ticks fully behind the visible edge (kept only
  by the overscan buffer) keep their own true `x`; the one tick whose cell straddles the clamp line
  gets `x` clamped to the visible edge with `width` reduced by the same amount.
- **`panToDate`/`panToToday` now have unit coverage** (pass 2/3's "not done" item): `Viewport.
  panToInstant` gets exact-arithmetic coverage in `src/layout/viewport/viewport.test.ts` (`align`
  'start'/'center', one notification, clamping before `range.start` and past `range.end`); the
  public `Gantt.panToDate`/`panToToday` get delegation coverage in `src/api/gantt.test.ts`,
  including `panToToday` under a faked clock proven identical to `panToDate(now(), align)`.
- **`panToToday('center')` is now wired into `harness/main.ts` and `harness/zoom.ts`**, right after
  construction — the zero-interaction-visibility gap pass 2/3 left open is closed. Going through
  the three tests pass 2 flagged (re-running the *full* `playwright test` suite, several times,
  after each fix, per the doc's own warning that other tests might share the unstated `scrollLeft:
  0` assumption — none turned out to):
  - **`e2e/harness.spec.ts` D1** — fixed exactly as pass 2 suggested: the sizer-extent measurement
    now adds back `el.scrollLeft` (a `getBoundingClientRect()` read is viewport-relative, so a
    scrolled pane moved the sizer's painted rect left by exactly the scroll offset).
  - **`e2e/header-readability.spec.ts` finding 5 — a real library bug, not a test-assumption gap.**
    Scrolling away from 0 makes the sticky-label clamp (finding 3) produce thin straddling
    remainders far more often. `.fg-tick` (`view/styles.ts`) is `box-sizing: border-box` with
    `padding: 0 4px` and a 1px `border-left` — 9px of border-box that no declared `width` below it
    can shrink (verified directly against a live browser: a border-box narrower than its own
    padding+border clamps *up* to that floor, per the CSS box model). A straddling tick clamped to
    a remainder thinner than 9px asked for e.g. `width: 0.5px` in `layout/frame.ts`'s math but
    *rendered* at a fixed 9px regardless, eating into the next tick's true cell — overlapping
    labels, the exact "impossible to read" symptom finding 5 exists to catch. Fixed in
    `layout/frame.ts`: a straddling tick only gets clamped when the remaining room is at least that
    9px floor; thinner remainders fall back to the tick's own true (possibly off-screen) `x`, same
    as a tick fully behind the visible edge — there's no room left to show a label in either way.
  - **`e2e/zoom.spec.ts` U1/I8 — also a real library bug, in `layout/viewport/viewport.ts`.**
    `preset`/`range`/`fit` assignment, unlike `zoomIn`/`zoomOut`/`zoomToSpan`, never re-clamped
    scroll against the freshly resolved `contentWidth` before the next render. A preset that
    shrinks content while scrolled away from 0 (switching `day` → `weekAndMonth` after
    `panToToday`, in the test) computed one frame against a stale, now out-of-bounds `visible.x` —
    every bar culled out of that frame — and the DOM nodes that survived once the browser's own
    native `scrollLeft` clamp corrected the position a frame later were new nodes: a full, unwanted
    remount. Fixed with `Viewport.#reclampToContentWidth()` (push the new `contentWidth` into both
    `#contentSize` and the scroll binding, then `panTo` the current position to force `ScrollModel`'s
    own clamp to run immediately) — mirroring the re-clamp `#stepPreset`/`zoomToSpan` already do
    around their own explicit anchor, now applied to the three setters that previously had none.
  - Re-ran the full `playwright test` suite (all 25 specs) 5+ times after each individual fix and
    again after all three together — stable, no flakiness introduced. `e2e/scroll-sync.spec.ts`'s
    D-S1.5-6 case flaked once during this pass's repeated runs; reproduced identically on the
    pre-pass-4 commit (`37b08d9`) in a scratch `git worktree` with no `panToToday` involved at all —
    confirmed pre-existing and unrelated, not touched.
- `pnpm verify` and `pnpm exec playwright test` are both green as of `ea06cf5`.

## Unrelated, in-flight in this working tree — do not touch as part of this doc's work

A concurrent session was restructuring `harness/doc.html`/`diagram.html` into `harness/docs/`
(plus small nav-link edits across every harness `*.html` and a `vite.config.ts` build-entry
addition) while pass 2 above was in progress. Those changes were deliberately left untouched and
excluded from `f3efab7`'s commit — check `git status`/`git log` before assuming this doc's commit
is the only outstanding work in the tree.
