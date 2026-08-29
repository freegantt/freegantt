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
   re-diagnoses it as a real bug later.

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
   band whenever its own boundary is scrolled past.

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

## Files touched

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

## Not done — pick up here

- **No e2e tests were added yet** for any of this (today-line visibility at a real scroll
  position, dedupe showing up in the DOM, the sticky-label clamp, tick labels never overlapping at
  any shipped preset). `browser-tests` skill covers how this repo writes them; follow
  `e2e/zoom.spec.ts`'s pattern (`window.__gantt`, `page.evaluate`). Suggested cases:
  - weekMonthYear (or any 3-band preset): assert the coarsest band's first visible tick's
    `getBoundingClientRect()` is inside the pane's own bounds, not just present in the DOM — this
    is the regression test for finding 3.
  - A multi-band preset: assert a finer band's tick text does NOT contain the year/month a coarser
    band's tick already shows, for the regression test for finding 2.
  - hourPreset: assert an hour tick's text has no leading zero for single-digit hours, for finding 4.
  - Two adjacent `.fg-tick` elements' bounding boxes never overlap at the shipped `minTickWidthPx`
    floor, for finding 5 — this is the one place `browser-tests` was explicitly suggested for
    since it needs real measured text, not just JSDOM.
- **Gating decision**: `test:e2e` is already excluded from `pnpm verify`/the push gate (see
  `package.json`'s `verify` script — it was never included, this predates this pass). Follow that
  existing precedent for any new e2e tests here; nothing to change.
- Consider whether `preferredTickWidthPx` deserves its own doc/lint invariant ("must be ≥
  `minTickWidthPx`") now that finding 5 depended on that relationship by hand — currently just
  convention, not enforced. Not done this pass; flagging since a future preset edit could
  reintroduce finding 5 silently if `preferredTickWidthPx` drifts below the floor again.
