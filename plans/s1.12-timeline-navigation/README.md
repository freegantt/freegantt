# S1.12 — Timeline density, zoom navigation, and date formatting

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.12 · **Baseline:** `s1-timelineadd` @ `6e6299b`
**Position: runs next.** S2 has landed; S3 has not started. This step runs between them — `.slice` is `S1.12`, and its exit gate (`S1.12 → S3`, `scripts/slice-gate.mjs`) must pass before S3 begins. `plans/03` carries the same ordering between §S2 and §S3.
**Status: settled spec.** Ready to implement; §8 is the work list.
**Builds on:** [`plans/s1.9-presets-and-zoom/README.md`](../s1.9-presets-and-zoom/README.md) (presets, anchored zoom, `reveal`) and [`plans/s1.10-theming-and-a11y/README.md`](../s1.10-theming-and-a11y/README.md) (tokens, Parts, the base stylesheet).
**Closes:** the S1 scope items `plans/03` §S1 claimed but never delivered — a legible time axis at any density, discrete zoom navigation, and multi-band headers that actually render as multiple bands.

> **§0 is settled.** Every scope call below is answered. Four were the consumer's own calls, recorded verbatim in §0.

---

## 0. Scope calls — confirmed

| # | Question | Answer |
|---|---|---|
| **Q1** | **What happens when the pane is too narrow to give each tick a legible width?** | **Clamp the density; the timeline scrolls.** `fit: 'pane'` stops at the preset's `minTickWidthPx`; content becomes wider than the pane. The preset a caller asks for is the preset they get — the library never re-picks it behind their back. §2 D-S1.12-2. *Rejected: auto-coarsening the preset to keep content equal to pane width.* |
| **Q2** | **What shape does the date-formatting API take?** | **`Intl.DateTimeFormatOptions`**, with the existing `HeaderFormat` callback kept as the escape hatch. §2 D-S1.12-11. |
| **Q3** | **Does the formatting go through `temporal-polyfill`?** | **No — through `Intl.DateTimeFormat` directly.** Temporal's `toLocaleString(record, locales, options)` is itself an `Intl.DateTimeFormat` wrapper taking the same options bag, so the output is identical and the polyfill import stays confined to `time/zone.ts` per ADR 0001. The polyfill *is* used for the one thing `Intl` cannot do: week numbers (D-S1.12-13). |
| **Q4** | **Where does `locale` live — `Dataset` or `Gantt`?** | **`Gantt`.** Locale is presentation, like `theme` and `gridWidth`; the zone is data (D6). Two Gantt instances on one Dataset may render different languages, and locale never reaches `toJSON()`. §2 D-S1.12-12. |
| **Q5** | **Today marker and weekend shading — here or S5?** | **Today line here; weekend shading holds for S5.** A current-date indicator is core timeline furniture and pairs with `panToToday()`. `plans/03` §S5's plugin-dogfood gate keeps weekend shading as its example. §2 D-S1.12-14, §7. |
| **Q6** | **Do pointer/keyboard zoom gestures land here?** | **No — S3's, and `plans/03` §S3 gains an explicit TODO so it is not lost.** This step ships the imperative surface those gestures will call; `src/interaction/` stays empty. §2 D-S1.12-17. |
| **Q7** | **Is this a new slice, or does S1 reopen?** | **S1 reopens as S1.12.** The work is unambiguously S1 scope (`plans/03` §S1: "time axis with headers and presets… zoom"), and the S1→S2 gate is re-run on completion. §2 D-S1.12-1. |
| **Q8** | **Does `harness/zoom.html` become a demo, or does a new page appear?** | **It becomes the demo and keeps its fixture role.** It is currently a headless e2e fixture linked from the index nav as if it were a demo. One page serves both. §2 D-S1.12-16. |

---

## 1. User stories

- **U1.** I load a three-year dataset at the `day` preset. Ticks stay legible; the timeline scrolls horizontally instead of compressing days to sub-pixel width.
- **U2.** I click `[+]` and `[−]`. The axis steps between presets — `monthAndYear` → `weekAndMonth` → `dayAndWeek` → `day` — and the instant under my cursor stays put.
- **U3.** I pick `dayWeekMonth`. Three header bands render at full height each, and the grid pane's header spacer matches to the pixel.
- **U4.** I set `gantt.locale = 'de-DE'`. Every header label and every screen-reader date re-reads in German, live, with no remount.
- **U5.** I write `format: { month: 'short', year: 'numeric' }` on my own preset's band. I never write a month-name table.
- **U6.** I call `gantt.panToDate('2026-09-14')` — or `new Date()`, or an epoch number. All three work; I never construct a branded `Instant`.
- **U7.** I click `Today`. The view pans to the current date, and a today line marks it.
- **U8.** I scroll down through 5,000 rows. The header stays pinned at the top of the timeline pane.
- **U9.** I call `gantt.zoomToSpan({ start: '2026-09-01', end: '2026-10-01' })`. That month fills the pane exactly.

---

## 2. Decisions

### D-S1.12-1 — The scope is S1's; the position is between S2 and S3

Two separate questions, answered separately, because conflating them is what makes the numbering look odd.

**Whose scope is it?** S1's. `plans/03` §S1's scope line reads "Time axis with headers and presets… Zoom: preset switching + `range: 'fitDataset'`; anchored zoom." Its five acceptance boxes cover none of tick legibility, discrete zoom, or multi-band rendering. The gap is S1's, so the step is numbered S1.12 and a reader asking "why is the axis like this" finds the answer under S1, where they will look.

**When does it run?** Next — after S2, before S3. S2 landed at `6e6299b`; S3 has not started. So `.slice` moves from `S3` back to `S1.12`, and `scripts/slice-gate.mjs` gains an `S1.12` entry whose gate is named `S1.12 → S3`. That is the mechanical statement of the ordering: the script tells anyone which gate is live, and it fails until `[S1-A6]`–`[S1-A10]` exist as passing tests.

**S1's own five acceptance boxes stay ticked.** They describe work that did land. Un-ticking them to signal this debt would make S1's record dishonest about `[S1-A1]`–`[S1-A5]`; the debt is recorded instead as its own scope block in `plans/03` between §S2 and §S3, carrying the five new ids (§7).

The S1→S2 gate is unaffected and needs no re-run: nothing in this step touches `data/`, and S2's own gate conditions do not depend on the axis.

*Rejected:* numbering it S2.x or S8. Both file timeline work under a slice whose goal is something else, and `plans/03`'s slice list is this codebase's map.

### D-S1.12-2 — `minTickWidthPx` floors every fit mode; content scrolls rather than squishes

`TimeScaleModel.#resolvePxPerMs` is the one place `pxPerMs` is resolved. It gains a floor:

```
minDensity = preset.minTickWidthPx / tickMsAt(range.start)
resolved   = max(requestedDensity, minDensity)
```

applied to **all three** fit modes. `'preset'` is already above the floor by construction (`minTickWidthPx ≤ preferredTickWidthPx`), so the clamp is a no-op there. `'pane'` is where the squish lives. An explicit `number` — what `zoomTo`/`zoomBy` write — **must** be floored too, or `zoomOut()` walks straight back into the squish the floor exists to prevent.

The clamp needs no change to `Viewport.zoomTo`. That method writes `scale.fit`, then reads `this.timeScale.contentWidth` and `xForInstant` back off the *resolved* scale — never off the value it requested. A clamped resolve therefore keeps the anchor mathematically correct for free, and repeated `zoomBy(0.5)` at the floor is a correct no-op.

**Known imprecision, accepted:** a calendar month is 28–31 days, so a floor measured at `range.start` (the same measurement `pxPerMsForPreset` already makes) is up to ~10% loose for February at the `month` tick unit. Measuring the narrowest cell in range would need a walk of every tick to resolve one number. Documented, not fixed.

*Rejected:* auto-coarsening the preset to fit the pane (Q1). It makes `gantt.preset` a value the library overwrites, which forces an intent-vs-resolved split through the whole public surface, and it means resizing a window silently re-labels the axis.

### D-S1.12-3 — `tickWidthPx` renames to `preferredTickWidthPx`

Two tick widths on one preset need two names that cannot be confused. `tickWidthPx` today means "the density this preset implies on its own" (`scale.ts`, `pxPerMsForPreset`); `minTickWidthPx` means "below this, the labels stop being legible." Left as `tickWidthPx` beside `minTickWidthPx`, the first name reads like it should already *be* a minimum.

```ts
export interface ViewPreset {
  id: string;
  tickUnit: TimeUnit;
  tickIncrement: number;
  headers: readonly ViewPresetHeader[];
  /** The density this preset intends: one tick occupies this many px when nothing else decides. */
  preferredTickWidthPx: number;
  /** The density floor: below this, this preset's labels stop being legible. Defaults to
   *  `preferredTickWidthPx` when omitted, which makes a custom preset never compress. */
  minTickWidthPx?: number;
  snap?: { unit: TimeUnit; increment: number } | 'tick' | 'none';
}
```

Twenty-three references across nine files — `time/scale.ts`, `time/presets.ts`, four test files, `render/dom` and `render/null` test fixtures, `harness/doc.html`, and `plans/01` §5.1. Wider than it first looks, but every site is a literal in a preset object or an assertion against one. This is the same class of rename as `zoom` → `fit` and `TimeScaleIntent` → `TimeScaleModelOptions` (issue #84), for the same reason: a name that covers two concepts is a bug, not a style nit (CLAUDE.md, cautionary example #7).

**Behaviour change, deliberate:** the shipped `day` preset gets `minTickWidthPx: 32`. Today's sample fixture (72 days in a ~900px pane) resolves to ~12px/day and squishes; after this step it resolves to 32px/day and scrolls. That is the point of the step, and `[S1-A6]` asserts it.

### D-S1.12-4 — A content-width ceiling, not a max tick width

`zoomIn`/`zoomBy` need an upper bound or `contentWidth` eventually exceeds the browser's maximum element size (~33.5M px in Chromium; less elsewhere) and the timeline silently stops scrolling. That bound is mechanical, not semantic — it is about the DOM, not about legibility — so it is **one constant in `layout/`**, not a third per-preset knob:

```ts
/** Content wider than this stops being addressable by browser scroll geometry. Chromium clamps
 *  around 33.5M px; this leaves headroom for the narrowest reported limit. */
const MAX_CONTENT_PX = 16_000_000;
```

Applied in the same `#resolvePxPerMs`: `pxPerMs ≤ MAX_CONTENT_PX / spanMs`. Floor and ceiling therefore live in one function, each justified by a different thing.

*Rejected:* `maxTickWidthPx` per preset. Nothing about a preset decides when a browser runs out of pixels, and authors of custom presets would have to guess a number that is really a platform constant.

### D-S1.12-5 — The ordered preset set is `zoomPresets`; "ladder" is already taken

`ladder` names the **Customization ladder** (`plans/02` §4, CONTEXT.md's *Token* and *Part* entries — level 1 CSS properties, level 2 parts, level 3 renderers). A second meaning fails the naming skill's check 4.

```ts
/** The ViewPresets `zoomIn`/`zoomOut` step through, finest first. Live. Default: the eight-rung
 *  shipped set. A caller may state any PresetRefs, including custom ViewPreset objects. */
get zoomPresets(): readonly ViewPreset[];
set zoomPresets(refs: readonly PresetRef[]);
```

Default, finest first:

```
hour · hourDayWeek · day · dayAndWeek · dayWeekMonth · weekAndMonth · weekMonthYear · monthAndYear · year
```

Call site: `gantt.zoomPresets = ['day', 'weekAndMonth', myQuarterPreset]` — "the gantt's zoom presets". True sentence; `zoomPresets` returns no other concept on a search.

### D-S1.12-6 — `zoomIn`/`zoomOut` step the preset; nothing else ever changes it

```ts
zoomIn(anchorX?: number): void;    // next finer entry in zoomPresets; no-op at the finest
zoomOut(anchorX?: number): void;   // next coarser; no-op at the coarsest
get canZoomIn(): boolean;
get canZoomOut(): boolean;
```

Each sets `preset` to its neighbour and re-anchors inside one `Viewport.batch()`, reading the instant under `anchorX` before writing — the same read-before-write contract `zoomTo` already documents (D-S1.9-5). `anchorX` defaults to pane centre.

This is the *only* thing that changes `preset` other than a caller's own assignment, which is what makes Q1's answer hold: the preset never moves unless someone asked.

`canZoomIn`/`canZoomOut` exist so a toolbar can disable a button without reimplementing the position lookup. `can*` is established vocabulary (`canUndo`, `plans/03` §S2).

*Rejected:* `zoomIn()` as a continuous `zoomBy(1.5)` with the preset following the resolved density. That is auto-coarsening under another name and contradicts Q1.

### D-S1.12-7 — There is no `zoomToFit()`

It would set `fit = 'pane'`, which is already a plain assignment — a method that does only that is the second write path `plans/02` §1.1 forbids ("Reconfiguration is just assignment"). The harness toolbar's `Fit` button writes `gantt.fit = 'pane'` directly.

Note the honest consequence: with the D-S1.12-2 floor in force, `fit: 'pane'` on a long dataset does **not** show everything — it shows as much as stays legible and scrolls for the rest. That is Q1's answer, not a defect, and §5 records it as the foot-gun it will read as.

`zoomToSpan` does survive as a method, because it writes density *and* scroll position atomically and cannot be expressed as one assignment:

```ts
/** Resolves the density that makes `span` exactly fill the pane, then pans so `span.start` sits at
 *  the pane's left edge — both inside one batch, one notification. Floored by D-S1.12-2, so a span
 *  too long to be legible fills the pane only as far as the floor allows. */
zoomToSpan(span: { start: InstantInput; end: InstantInput }): void;
```

### D-S1.12-8 — `panToDate` / `panToToday`, never `scrollTo*`

CONTEXT.md's **Pan** entry: *"Moving the shared viewport — `ScrollModel.panTo`… Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12)."* And **Reveal**'s _Avoid_ list names `ScrollTo` explicitly. A public `gantt.scrollToDate()` would break both.

```ts
/** Pans so `date` sits at `align` within the pane. Loose input (plans/02 §2): a string, a Date, an
 *  epoch number or an Instant all work, read through the Dataset's zone. */
panToDate(date: InstantInput, align?: 'start' | 'center'): void;   // default 'start'
/** `panToDate(now(), align)`. `time/` owns the clock read (I10). */
panToToday(align?: 'start' | 'center'): void;
```

Call sites: `gantt.panToDate('2026-09-14')` — "pan the gantt to this date." `gantt.panToToday()` — "pan the gantt to today." Both true.

**Loose input is the rule, not a courtesy** (CLAUDE.md: *"Input is loose (`string` ids, `InstantInput` dates) on every way in"*). Every date-taking entry point added here takes `InstantInput` and reads it through `time/toInstant` with the Dataset's zone: `panToDate`, `zoomToSpan`, and `Gantt.range`.

`Gantt.range` currently takes `'fitDataset' | TimeSpan` where `TimeSpan` holds branded `Instant`s — so a consumer cannot write `gantt.range = { start: '2026-01-01', end: '2027-01-01' }` today. It becomes `'fitDataset' | { start: InstantInput; end: InstantInput }`, read at the setter. The getter keeps returning the resolved `TimeSpan`, matching how `Dataset` already reads `EntryInput` once at ingest.

### D-S1.12-9 — Header height comes from band count, in CSS; the grid spacer mirrors the bands

The bug: `.fg-header { height: var(--fg-header-height, 20px) }` with `.fg-band { flex: 1 1 0 }` (`view/styles.ts:80-81`). `flex-basis: 0` governs main-axis sizing, so N bands split one fixed 20px header — 10px each at two bands, 6.7px at three. The shipped `weekAndMonth` preset is already affected.

`harness/zoom.html` hand-writes `.fg-band { height: 20px }` — a rule no other harness page carries — which is the consumer working around this, and `flex: 1 1 0` makes it ineffective anyway. `e2e/zoom.spec.ts` only asserts band *count* (`toHaveCount(2)`), so nothing catches it. Per CLAUDE.md's harness rule this is a recorded API gap; S1.9's TODO claimed the opposite ("reviewed, nothing hand-rolled"), and §7 corrects that line.

Fix, entirely in the base stylesheet:

```css
.fg-header      { height: auto; position: sticky; top: 0; z-index: 1; }
.fg-band        { flex: 0 0 var(--fg-band-height, 20px); }
.fg-tick        { height: var(--fg-band-height, 20px); line-height: var(--fg-band-height, 20px); }
.fg-grid-spacer { display: flex; flex-direction: column; }
```

The grid pane's spacer **renders one empty `.fg-band` per header band** instead of being sized imperatively. Both panes then resolve their header height from one CSS expression against one token, so they cannot drift — the same by-construction guarantee I9 asks for on row tops. It also means a consumer's own `.fg-band { border-bottom: … }` styles both panes continuously, which is what a reader would expect.

`PaneLayout`'s `readPixelProperty('--fg-header-height')` call and its `HEADER_HEIGHT_POLICY` are deleted; `pane-layout.test.ts:26` changes accordingly.

*Rejected:* a `--fg-band-count` custom property written by the shell each render. It looks like a consumer token in the `plans/02` §4 table but must never be set by one, and it introduces a per-render style write to replace structure that CSS can express on its own.

### D-S1.12-10 — `--fg-header-height` retires; `--fg-band-height` replaces it

The old token names a value that is now derived (bands × band height). Keeping it would mean two properties fighting over one measurement. `--fg-band-height` (fallback 20) names what a consumer can actually decide: how tall *one* band is.

This is a breaking change to a documented level-1 token (`plans/02` §4). Pre-1.0, and recorded in §7 with the one-line migration: `--fg-header-height: 40px` on a two-band preset becomes `--fg-band-height: 20px`.

### D-S1.12-11 — A date format is `Intl.DateTimeFormatOptions`; the callback stays as the escape hatch

```ts
/** What a header band states to turn an Instant into its label. Options are resolved through
 *  `Intl.DateTimeFormat` in the Gantt's locale and the Dataset's zone; a callback is the escape
 *  hatch for anything Intl has no field for (see `formatWeekNumber`). */
export type DateFormat = Intl.DateTimeFormatOptions | HeaderFormat;

/** Widened with `locale` (S1.12). Adding a parameter is source-compatible with existing callbacks. */
export type HeaderFormat = (i: Instant, zone: string, locale: Intl.LocalesArgument | undefined) => string;

export interface ViewPresetHeader extends TickStep {
  format: DateFormat;
}
```

`time/format.ts` grows the resolver and the cache, and loses its hand-rolled `MONTH_ABBR` table:

```ts
/** An `Intl.DateTimeFormat` per (locale, zone, options), memoized — constructing one per tick per
 *  frame is the allocation this cache exists to prevent. */
export function resolveDateFormat(
  format: DateFormat, zone: string, locale: Intl.LocalesArgument | undefined,
): (i: Instant) => string;

export function formatDate(zone: string, i: Instant, locale?: Intl.LocalesArgument): string;
export function formatEndInclusive(zone: string, end: Instant, locale?: Intl.LocalesArgument): string;
```

`presets.ts` loses `pad2`, `plainDateFormat`, `hourFormat`, `monthFormat` and `yearFormat` — every shipped band becomes an options object. Two hand-rolled formatting vocabularies (`format.ts`'s `Sep 1, 2026` and `presets.ts`'s `2026-09-01`) collapse to one.

`formatEndInclusive` keeps its job unchanged: it is still the one place half-open `end` becomes an inclusive display value, and no `end - 1` appears anywhere else (CLAUDE.md).

*Rejected:* token pattern strings (`'MMM YYYY'`). The library would own a parser and a per-locale month/day table — reimplementing, worse, what `Intl` already ships, and `plans/04` §1's dependency rule blocks pulling in a date library to avoid writing it.

### D-S1.12-12 — `locale` lives on the `Gantt`

```ts
// GanttOptions, and live on Gantt
locale?: Intl.LocalesArgument;   // undefined = the runtime default
```

Locale is presentation — the ADR 0005 split, "what a value *is*" versus "where a Gantt *shows* it." The zone is data and stays on `Dataset` (D6). Consequences, all wanted: locale never enters `toJSON()` so D7 needs no ruling; two Gantt instances on one Dataset can render two languages; a `TimeScaleModel` shared across datasets has no locale to reconcile.

It reaches `computeFrame` through `LayoutInput.locale`, beside the `timeZone` already there, and feeds header labels and `a11yLabel` alike — so screen-reader dates become locale-correct as a side effect.

*Rejected:* `Dataset.locale`, and a Dataset-default-with-Gantt-override pair. The second is two write paths for one value (`plans/02` §1.1).

### D-S1.12-13 — Week numbers come from the polyfill, through `formatWeekNumber`

`Intl.DateTimeFormatOptions` has no week-number field, and a week band labelled `W37` is standard Gantt furniture. `temporal-polyfill`'s `/fns/ZonedDateTime` exports `weekOfYear`, which is exactly the ISO-week arithmetic that is hard to hand-roll and that ADR 0001 took the dependency for.

```ts
// time/zone.ts — the polyfill's only importer, unchanged (ADR 0001)
export function weekOfYear(zone: string, i: Instant): number;

// time/format.ts
/** `W37`. The escape-hatch callback shipped as a named value, because Intl has no week field. */
export const formatWeekNumber: HeaderFormat;
```

Exported from `api/` — unlike the individual preset constants, which CONTEXT.md's **Preset reference** entry keeps internal — because a custom-preset author cannot produce a week number any other way.

### D-S1.12-14 — The today line reuses the decoration seam that already ships

`src/layout/frame.ts:72` already declares `TodayLine { kind: 'todayLine'; x: number }`, `frame.ts:88` already unions it into `FrameDecoration`, and `GeometryFrame.decorations` (`frame.ts:138`) already exists — `computeFrame` simply always emits `[]` (`frame.ts:249`). So this needs no new type: a producer in `computeFrame`, a renderer in `render/dom`, one token.

```ts
// GanttOptions, live on Gantt. Default true.
todayLine?: boolean;
```

- `computeFrame` emits a `TodayLine` when `todayLine` is on **and** `now()` falls inside `scale.range`; otherwise nothing. `now()` lives in `time/instant.ts` and is the only legal clock read (I10).
- `render/dom` renders `.fg-today-line`, positioned like any other content-space geometry.
- One token: `--fg-today-line-color`, the key S1.10 §270 cut *"until the render surface that needs it ships."* This is that surface.
- **No timer.** The line is recomputed from `now()` on each frame and moves on the next render, not on a clock tick. A self-refreshing line needs a timer, and a timer needs a lifecycle the reconciler is explicitly not allowed to grow (CLAUDE.md: *"Needing lifecycle hooks means the design is wrong"*).

Weekend and non-working-time shading stays S5's plugin-dogfood example (`plans/03` §S5), narrowed to shading alone — §7.

### D-S1.12-15 — The sticky header closes an S1.8 debt

`plans/s1.8-pane-layout/README.md` §177: *"The header still scrolls away vertically… `position: sticky; top: 0` fixes it, and that is one line in the stylesheet S1.10 ships."* S1.10 did not ship it; `view/styles.ts:80` still says `position: relative`. It ships here, in the D-S1.12-9 rule block, and `[S1-A9]` asserts it.

### D-S1.12-16 — `harness/zoom.html` becomes the demo and keeps its fixture role

It is linked from `index.html`'s nav as "Zoom & presets" but has no controls — it mounts a Gantt and assigns `window.__gantt` so `e2e/zoom.spec.ts` can drive the imperative surface. A reader clicking it finds a paragraph explaining it is a test fixture.

It gains a real toolbar (§3.7) and keeps `window.__gantt`, so the two existing e2e assertions keep passing unchanged. The nav label becomes "Timeline & navigation".

A new fixture, `fixtures/multi-year-dataset.ts` (`multiYearEntryInputs`, ~3 years, ~60 entries), exists so the density floor is visible: at the `day` preset it scrolls; at `monthAndYear` it fits.

### D-S1.12-17 — Gestures stay S3; `plans/03` §S3 gains the TODO

`src/interaction/` stays empty. This step ships the imperative surface a gesture controller will call — `zoomIn`, `zoomOut`, `zoomBy(factor, anchorX)`, `panToDate` — and the harness drives it from a toolbar.

`plans/03` §S3 scope gains, verbatim (§7):

> - Timeline navigation gestures (deferred here from S1.12, D-S1.12-17): ctrl/⌘+wheel anchored zoom calling `zoomBy(factor, offsetX)`; shift+wheel horizontal pan; `PageUp`/`PageDown`/`Home`/`End`/arrow keys for pan. These write nothing to the dataset, so the arm-threshold, escape-cancel and one-transaction-per-gesture invariants do not apply to them — they are read-only viewport gestures over the S1.12 surface.

---

## 3. API

### 3.1 `src/time/scale.ts`

`ViewPreset.tickWidthPx` → `preferredTickWidthPx`; `minTickWidthPx?` added (D-S1.12-3). `ViewPresetHeader.format` widens to `DateFormat`; `HeaderFormat` gains a `locale` parameter (D-S1.12-11). `pxPerMsForPreset` reads the renamed field.

```ts
/** The density floor this preset implies: one tick occupies at least `minTickWidthPx`. Falls back to
 *  `preferredTickWidthPx`, so a custom preset that states nothing never compresses. */
export function minPxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number;
```

### 3.2 `src/time/presets.ts`

Three three-band presets join the shipped set, and every shipped band's `format` becomes an options object:

| Preset | Headers (coarsest first) | `tickUnit` | preferred / min px |
|---|---|---|---|
| `hourDayWeek` | week, day, hour | `hour` | 40 / 24 |
| `dayWeekMonth` | month, week, day | `day` | 32 / 20 |
| `weekMonthYear` | year, month, week | `week` | 64 / 40 |

`ShippedPresetId` widens to eleven ids. `presets` and `resolvePreset` are unchanged in shape.

### 3.3 `src/time/format.ts` and `src/time/zone.ts`

`DateFormat`, `resolveDateFormat`, `formatWeekNumber`, locale-aware `formatDate`/`formatEndInclusive` (D-S1.12-11); `weekOfYear` in `zone.ts` (D-S1.12-13). `MONTH_ABBR` deleted.

### 3.4 `src/layout/viewport/time-scale-model.ts`

`#resolvePxPerMs` gains the floor and the ceiling (D-S1.12-2, D-S1.12-4). No signature changes; `TimeScaleFit` is untouched.

### 3.5 `src/layout/viewport/viewport.ts`

```ts
zoomIn(anchorX?: number): void;
zoomOut(anchorX?: number): void;
get canZoomIn(): boolean;
get canZoomOut(): boolean;
zoomToSpan(span: TimeSpan): void;         // resolved Instants; api/ reads InstantInput
panToInstant(i: Instant, align: 'start' | 'center'): void;
get zoomPresets(): readonly ViewPreset[];
set zoomPresets(presets: readonly ViewPreset[]);
```

Each anchored method reads the anchor instant before writing and commits inside one `batch()`, exactly as `zoomTo` does.

### 3.6 `src/layout/frame.ts`, `src/view/`, `src/api/`

`LayoutInput` gains `locale` and `todayLine`; `computeFrame` emits the `TodayLine` decoration and passes `locale` to every `resolveDateFormat` call and to `a11yLabel`. `GanttShell` and `Gantt` delegate the new surface straight through, as they already do for `preset`/`range`/`fit`.

```ts
// Gantt — new public surface
get locale(): Intl.LocalesArgument | undefined;      set locale(l: Intl.LocalesArgument | undefined);
get todayLine(): boolean;                  set todayLine(on: boolean);
get zoomPresets(): readonly ViewPreset[];  set zoomPresets(refs: readonly PresetRef[]);
get canZoomIn(): boolean;
get canZoomOut(): boolean;
zoomIn(anchorX?: number): void;
zoomOut(anchorX?: number): void;
zoomToSpan(span: { start: InstantInput; end: InstantInput }): void;
panToDate(date: InstantInput, align?: 'start' | 'center'): void;
panToToday(align?: 'start' | 'center'): void;
// changed: accepts loose input, returns resolved
set range(r: 'fitDataset' | { start: InstantInput; end: InstantInput });
```

### 3.7 Harness

`harness/zoom.html` + `zoom.ts` become the demo (D-S1.12-16):

```
[−] [+]   preset: [ dayWeekMonth ▾ ]   fit: [ pane ▾ ]   locale: [ de-DE ▾ ]
[◀] [Today] [▶]   dataset: ( sample | multi-year )   [x] today line
```

`[−]`/`[+]` call `zoomOut`/`zoomIn` and disable off `canZoomOut`/`canZoomIn`. Every control is a plain assignment or a one-line call — a toolbar that has to compute anything is a library gap to record, not to fix in the harness.

`fixtures/multi-year-dataset.ts` is new. `harness/index.html`'s nav label changes.

---

## 4. Public surface

`api/index.ts` gains: `Gantt.locale`/`.todayLine`/`.zoomPresets`/`.canZoomIn`/`.canZoomOut`, `Gantt.zoomIn`/`.zoomOut`/`.zoomToSpan`/`.panToDate`/`.panToToday`, the matching `GanttOptions` keys, `DateFormat`, `formatWeekNumber`, and the three new `ShippedPresetId` values.

**Changed:** `ViewPreset.tickWidthPx` → `preferredTickWidthPx` (+ optional `minTickWidthPx`); `ViewPresetHeader.format` widens to `DateFormat`; `HeaderFormat` gains a third parameter; `Gantt.range`'s setter accepts loose input; `--fg-header-height` → `--fg-band-height`.

**Unchanged:** `zoomTo`/`zoomBy`/`reveal`/`preset`/`fit`/`overscan`, and the `scale`-versus-`preset`/`range`/`fit` exclusivity from issue #84.

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| `gantt.fit = 'pane'` no longer shows the whole dataset | Correct, and deliberate (Q1). The floor wins; the timeline scrolls. Documented on the `fit` doc comment and in `plans/02` §4. |
| A custom preset omits `minTickWidthPx` and never compresses | The documented default (`= preferredTickWidthPx`). Stated on the field, and `presets.test.ts` asserts it. |
| `zoomIn()` at the finest preset silently does nothing | `canZoomIn` is the check, and the harness toolbar disables off it. A no-op is not an error — `reveal` on an already-visible entry is the same shape. |
| `zoomBy(1000)` blows past the browser's scroll limit | `MAX_CONTENT_PX` (D-S1.12-4), applied in the same resolve as the floor. |
| Formatting allocates an `Intl.DateTimeFormat` per tick per frame | `resolveDateFormat` memoizes per `(locale, zone, options)`. A property test asserts identity across frames. |
| A consumer sets `--fg-header-height` and nothing happens | Retired (D-S1.12-10). Migration line in `plans/02` §4; the token table lists `--fg-band-height` only. |
| The today line looks stale after the page is open past midnight | It updates on the next render, not on a clock tick (D-S1.12-14). Stated in the `todayLine` doc comment. |
| Month cells at the density floor are ~10% narrower in February | Accepted imprecision, documented on `minPxPerMsForPreset` (D-S1.12-2). |
| Two Gantts share a `TimeScaleModel` but set different `locale`s | Works, and is the point of D-S1.12-12 — the axis geometry is shared, the labels are not. |

---

## 6. Tests

`pure` (Node, no DOM) except where noted.

- **`time/presets.test.ts`** — eleven ids resolve; each three-band preset's `tickUnit` is no coarser than its finest header; `minTickWidthPx` defaults to `preferredTickWidthPx`; every shipped band's `format` is an options object or `formatWeekNumber`.
- **`time/format.test.ts`** — `resolveDateFormat` returns the same function for the same `(locale, zone, options)` and a different one otherwise; `de-DE` and `ja-JP` produce different labels for one instant; `formatWeekNumber` matches ISO week numbers across a year boundary; `formatEndInclusive` still reads back one millisecond early.
- **`time/zone.test.ts` (extended)** — `weekOfYear` across a year boundary and across a DST transition; `startOf`/`stepBy` for the units the three-band presets add.
- **`layout/viewport/time-scale-model.test.ts` (extended)** — the floor binds under `'pane'` for a span too long to be legible and leaves a short span untouched; an explicit `fit` number below the floor resolves to the floor; `MAX_CONTENT_PX` caps an absurd density; **the existing assertions pass unmodified except those asserting the pre-floor `'pane'` density**, each of which gets a one-line note naming D-S1.12-2.
- **`layout/viewport/viewport.test.ts` (extended)** — `zoomIn`/`zoomOut` step exactly one entry of `zoomPresets` and deliver one notification; both are no-ops at the ends and `canZoomIn`/`canZoomOut` agree; a fast-check property test: `zoomIn` then `zoomOut` returns preset and scroll x to their starting values; `zoomToSpan` makes the span exactly fill the pane, or hits the floor; `panToInstant` places the instant at the pane's left edge and at its centre.
- **`layout/frame.test.ts` (extended)** — `decorations` carries one `TodayLine` when `now()` is inside range and is empty otherwise; header labels change with `locale`; `a11yLabel` changes with `locale`.
- **`view/styles.test.ts` / `view/pane-layout.test.ts` (dom)** — `--fg-band-height` is in the token table and `--fg-header-height` is not; the grid spacer renders one `.fg-band` per header band; header and spacer heights are pixel-identical at one, two and three bands.
- **`api/gantt.test.ts` (dom)** — `panToDate` accepts a string, a `Date`, an epoch number and an `Instant` and lands at the same position for all four; `gantt.locale = 'de-DE'` re-labels with no bar remount (I8); `todayLine = false` removes `.fg-today-line`.
- **e2e (`e2e/zoom.spec.ts`, extended)** — the two existing assertions unchanged (D-S1.12-16); `[S1-A6]` the multi-year fixture at `day` scrolls rather than compressing; `[S1-A7]` `[+]`/`[−]` step the axis with the anchored instant fixed; `[S1-A8]` a three-band preset renders three full-height bands aligned with the grid spacer; `[S1-A9]` the header stays pinned after scrolling 2,000 rows; `[S1-A10]` `Today` pans to the today line.

---

## 7. Spec edits — landed **with** this step

- `plans/03` — a scope block between §S2 and §S3, "S1.12 — runs next", carrying minimum tick width, the zoom-preset set and discrete zoom, three-band presets, date formatting with locale, the today line, and the navigation verbs, plus acceptance `[S1-A6]`–`[S1-A10]`. §S1 gains one pointer line to it; its own five boxes stay ticked (D-S1.12-1).
- `.slice` → `S1.12`; `scripts/slice-gate.mjs` gains the `S1.12 → S3` gate over the five new ids.
- `plans/03` §S3 — the D-S1.12-17 TODO block, verbatim.
- `plans/03` §S5 — the plugin-dogfood example narrows to weekend shading alone; "jump-to-today" is struck, having shipped here.
- `plans/01` §5.1 — `ViewPreset`'s block updated for `preferredTickWidthPx`/`minTickWidthPx`/`DateFormat`; a paragraph on the density floor and the content ceiling.
- `plans/02` §2 — `locale`, `todayLine`, `zoomPresets` in the options example; `range`'s loose input.
- `plans/02` §4 — the token table: `--fg-band-height` replaces `--fg-header-height` (with the migration line), `--fg-today-line-color` added, `.fg-today-line` joins the closed Part vocabulary.
- `plans/02` §5 — the stale `zoom: 'preset'` in the shared-axis example is corrected to `fit: 'preset'` (drift since issue #84; fixed while this section is open).
- `plans/s1.9-presets-and-zoom/README.md` §8 — the Harness line's "reviewed, nothing hand-rolled" is corrected: `.fg-band { height: 20px }` in `harness/zoom.html` was a hand-rolled workaround for D-S1.12-9's bug, and went unrecorded.
- `plans/s1.8-pane-layout/README.md` §177 — the sticky-header carry-forward is ticked, landed here.
- `plans/s1.10-theming-and-a11y/README.md` §270 — the `todayLineColor` row is ticked; the remaining cut keys stay cut.
- `CONTEXT.md` — new: **Zoom presets**, **Date format**, **Today line**, **Tick width** (preferred versus minimum). Edited: **ViewPreset** (`preferredTickWidthPx`, `minTickWidthPx`, `DateFormat`), **Fit** (the floor), **Tick** (the floor), **Pan** (`panToDate`/`panToToday` as its public verbs), **Token** (`--fg-band-height`), **Part** (`fg-today-line`).
- `docs/adr/0001` — one line: formatting goes through `Intl.DateTimeFormat`, not the polyfill's `toLocaleString`, so the single-import-site consequence still holds; `weekOfYear` is the one new polyfill call, and it is in `zone.ts`.

---

## 8. TODO

Guardrails and glossary first, then the engine, then the seam, then the public edge.

### Glossary and specs
- [ ] `CONTEXT.md` entries per §7, before any code carries the new names
- [ ] `plans/03` §S1 / §S3 / §S5 edits

### `time/`
- [x] `preferredTickWidthPx` rename + `minTickWidthPx`; `minPxPerMsForPreset`
- [x] `DateFormat`, `resolveDateFormat` with its cache; `HeaderFormat` gains `locale`
- [x] `weekOfYear` in `zone.ts`; `formatWeekNumber` in `format.ts`; `MONTH_ABBR` deleted
- [x] `hourDayWeek`, `dayWeekMonth`, `weekMonthYear`; every shipped band's `format` → options object

### `layout/`
- [x] The density floor and `MAX_CONTENT_PX` in `#resolvePxPerMs`
- [x] `zoomPresets`, `zoomIn`/`zoomOut`/`canZoomIn`/`canZoomOut`, `zoomToSpan`, `panToInstant` on `Viewport`
- [x] `LayoutInput.locale`/`.todayLine`; `computeFrame` emits the `TodayLine` decoration and threads `locale`

### `view/` and `render/`
- [x] The D-S1.12-9 stylesheet block; `--fg-band-height`; `--fg-header-height` and `HEADER_HEIGHT_POLICY` deleted
- [x] Grid spacer renders one empty `.fg-band` per header band
- [x] Sticky header (D-S1.12-15)
- [x] `.fg-today-line` in `render/dom`; `--fg-today-line-color`

### `api/`
- [x] `Gantt` + `GanttOptions`: `locale`, `todayLine`, `zoomPresets`, `zoomIn`/`zoomOut`/`canZoomIn`/`canZoomOut`, `zoomToSpan`, `panToDate`, `panToToday`; `range` takes loose input

### Harness
- [x] `fixtures/multi-year-dataset.ts`
- [x] `harness/zoom.html` + `zoom.ts` toolbar; `window.__gantt` kept; nav label updated in every page
- [x] Toolbar also mounted on `index.html`/`main.ts` and `data.html`/`data.ts` (shared `harness/timeline-toolbar.ts`), beyond §3.7's `zoom.html`-only ask
- [ ] Review `harness/main.ts` and every harness page against CLAUDE.md's harness rule; record any gap against S1.12 and fix it in `src/`

### Review and gate
- [ ] The §7 spec edits, landed with this step
- [ ] Re-run the S1→S2 gate (`scripts/slice-gate.mjs`)

---

## 9. Deferred, with the caller that brings it back

| Deferred | Returns at | Needs |
|---|---|---|
| ctrl/⌘+wheel zoom, shift+wheel pan, keyboard pan | S3 | `interaction/`'s controller base; recorded in `plans/03` §S3 (D-S1.12-17) |
| Weekend / non-working-time shading | S5 | the plugin dogfood gate it is the example for (`plans/03` §S5) |
| A self-refreshing today line | when a caller needs one | a timer and the lifecycle the reconciler may not grow (D-S1.12-14) |
| `align: 'end'` on `panToDate` | when a caller asks | `'start'` and `'center'` cover the toolbar and the "show me this date" case; a third alignment is a policy nobody has requested |
| A per-band `minTickWidthPx` (rather than per-preset) | when a band's labels need a floor its tick unit does not imply | today `tickUnit` is never coarser than the finest header, so the tick floor is already at least as strict |
| Quarter as a `TimeUnit` | when a consumer asks for a fiscal-quarter band | `TimeUnit` is a closed union; adding one means `zone.ts`'s stepping table, not a preset |
