# S1.7 — Windowed frame, header bands, and the `Viewport` fan-in

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.7 · **Issue:** #1 · **Baseline:** `main` @ `012a29d`
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, `batch()`, D-F′.
**Supersedes:** the [S1.7 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400110762) where the two disagree; §2 records every decision that moved and why.

This directory is the settled spec for S1.7, in the same form as [`plans/s1.5-scroll-model/README.md`](../s1.5-scroll-model/README.md).

> **§0 is settled.** Three questions were scope calls, not engineering calls. All three are confirmed as recommended — everything in this document, including the seam change to `attachScroll` (D-S1.7-1) and every rename site inventoried in §3.8, is settled.

---

## 0. Scope calls — confirmed

| # | Question | Answer |
|---|---|---|
| **Q1** | **Does `Viewport` land at S1.7 or S1.8?** The S1.7 issue comment and #8's prerequisite list both say S1.7. `plans/s1.5-scroll-model/README.md` §5 and §10 said `Viewport` lands at S1.8 — written before the step was renumbered. | **Confirmed: S1.7**, as specified here. The S1.5 README's three "S1.8" pointers for `Viewport` are fixed to "S1.7" (§8, applied). |
| **Q2** | **Does `gantt.reveal(entryId)` land here?** Every other prerequisite exists at the end of this step (`Viewport`, `frame.rows`, `RowHeightIndex`). | **Confirmed: No — S1.8.** `reveal` centres an entry in a pane whose height is measured once at construction and never again until S1.7b (#8). Landing it before the measurement is real ships a verb that is right in unit tests and wrong in a resized browser. |
| **Q3** | **Pull `TimeScaleIntent.zoom` forward from S1.9?** Today `range: 'fitDataset'` resolves `pxPerMs` to fit the pane, so `contentWidth ≡ paneWidth`, so `max.x` is always `0` — horizontal windowing has no live caller until a `zoom` key exists (the review's Spec c2). | **Confirmed: No.** S1.7 ships horizontal culling in `layout/`, fully unit-tested, and does not wire it to the element (D-S1.7-11). Pulling `zoom` forward drags D-F′ and anchored zoom with it, and the coordinate seam it needs is S1.8's pane split. |

**Not a question: the S1.5 attachment seam changes, and the ledger is written.** `attachScroll` owns its `ScrollModel` binding today (S1.5 §3.3); the fan-in requires `Viewport` to own both bindings, so the attachment loses its binding and its reaction (D-S1.7-1). Leaving it would put two reactions back in the shell — the god object `Viewport` exists to prevent — and implement the local clamp twice. A seam change is only settled when every site that spells the old name is listed, so **§3.8 is that list**: 9 code files, 6 test files, 5 spec files, 1 ADR, 1 issue. It is checked off in §8 like any other work.

One defect found while writing this spec, listed here because it changes what "done" means rather than how it is built:

> **The culling window ignores the local clamp.** `gantt-shell.ts:146-151` feeds the *raw shared* `scroll.state.position` into `computeFrame`, while `scroll-attachment.ts:40-48` correctly writes the *locally clamped* position to the element. Two Gantts sharing a `ScrollModel` with different row counts: the shorter one culls rows around y = 4000 (which do not exist) while its element sits at y = 1000 — it renders an empty pane. It is invisible today only because nothing culls horizontally and the e2e asserts scroll offsets, not row contents. Fixed by D-S1.7-2, tested by U3. **If you would rather track it as its own bug, say so and it comes out of this spec's TODO into its own issue** — but the fix is one line in the object this step introduces, so it is cheaper here.

---

## 1. User stories

Written for the person using a Gantt, not the person building one. Each maps to an acceptance check in §8.

- **U1.** I open a plan with 5,000 rows and it scrolls like a short one. My browser's find-in-page only finds what is on screen, because that is all that exists.
- **U2.** I flick the scroll wheel and the rows are already there — no blank strip at the leading edge that fills in a frame later.
- **U3.** I have two charts on one shared scroll, and one has far fewer rows. When the tall one scrolls past the short one's last row, the short one shows its last rows. It does not go blank.
- **U4.** My month header labels sit on the first of the month, not on whatever date the plan happens to start on.
- **U5.** I resize the window while zoomed. The chart redraws once. It does not flash an intermediate frame where the header has moved and the bars have not.
- **U6.** (developer) I hand the Gantt a preset and get a header. I never write a loop over ticks, and I never turn a row index into a pixel.

---

## 2. Decisions

Settled in review. Each states the alternative it beat.

### D-S1.7-1 — `Viewport` owns both bindings; the shell holds one reaction

`GanttShell` today holds a `ScaleBindingHandle` *and* a `ScrollAttachment` that owns a second binding, each with its own `() => this.render()`. Add pane-size measurement (#8) and anchored zoom (S1.9) and that is three models, three handles and three reactions in the shell — R1's god object, arriving on schedule.

`Viewport` is a per-Gantt object holding the two *shared* models. It binds both, reacts to both, and calls the shell's `onChange` **once**:

```
attachPaneSize ──── setPaneSize ────┐                   ┌── TimeScaleModel.paneWidth
                                    ├── Viewport ───────┼── ScrollModel.pane / content
GanttShell.render ── setContentSize ┘                   └── visible (locally clamped)
                                         │
                                         └── ONE onChange ── GanttShell.render()
```

Consequences, all of them deliberate:

- **`attachScroll` loses its binding and its reaction.** It becomes what its name says — a wiring between one element and one model — with no opinion about when a render happens. Its new shape is in §3.6.
- **The render → element-write ordering (D-S1.5-7) moves out of the attachment and into the shell**, where it is one readable sequence instead of an ordering hidden inside a reaction. `render()` ends with `scrollAttachment.writePosition()`.
- **`Viewport` is per-Gantt, the models are shared.** Two Gantts sharing one `ScrollModel` have two `Viewport`s. This is what makes the local clamp (D-S1.7-2) expressible at all: it is a per-Gantt question about a shared value.

*Rejected:* leaving the scroll binding in the attachment and having `Viewport` bind only the scale. The shell then keeps two reactions, the "one reaction per zoom" guarantee of conventions §5 becomes unimplementable, and the local clamp is written in two places that can disagree.

### D-S1.7-2 — The local clamp has exactly one owner, and the culling window uses it

`Viewport.visible` is the culling window, and its origin is the **locally clamped** position:

```ts
visible = {
  x: Math.min(scroll.state.position.x, myMax.x),
  y: Math.min(scroll.state.position.y, myMax.y),
  width: pane.width,
  height: pane.height,
};
```

`myMax` is `max(0, content − pane)` from *this* Gantt's own pushed extents — the same rule `scroll-attachment.ts` computes today, moved up one level so the window and the element write cannot disagree. The attachment reads `viewport.visible` instead of recomputing it.

This is the fix for the defect in §0: the shared position is "where the user asked to be" (D-S1.5-2), and a pinned chart must render **what it can show**, not what was asked for.

*Rejected:* clamping inside `ScrollModel`. It cannot — `max` there is the *loosest* bound across bindings (D-S1.5-1); the tight, per-Gantt bound is only knowable per Gantt, which is precisely what `Viewport` is.

### D-S1.7-3 — `visible` is in timeline-content coordinates, and the shell stops doing gutter math

`layout/` knows one coordinate system: timeline content, origin at `scale.range.start`, which is what every `FrameBar.x` and `FrameHeaderTick.x` is already in. `visible` is in that system, in `LayoutInput`, in `GeometryFrame` and on `Viewport` — one rectangle, one meaning, per conventions §1.

The row-label gutter is the *backend's* offset (`render/dom/index.ts:123,135` — `margin-left`), and the backend already sizes its own content sizer with it (`:157`). So the shell's two gutter adjustments go away:

| `gantt-shell.ts` today | S1.7 |
|---|---|
| `#contentSize = { width: rowLabelWidth + frame.contentWidth, … }` | `{ width: frame.contentWidth, height: frame.contentHeight }` |
| `setPane({ width: host.clientWidth, … })` | `setPaneSize({ width: drawableWidth, height: clientHeight })` |

Both `content` and `pane` shed the same gutter, so `max.x` is unchanged — this is a simplification, not a behaviour change. `RenderBackend.rowLabelWidth` keeps exactly one consumer in `view/`: `#drawableWidth()`. S1.8 deletes that one too, when the timeline pane becomes its own scroller and the gutter leaves the scrollable content entirely.

*Rejected:* keeping the shell in element-content coordinates and converting at the `LayoutInput` boundary. That is two rectangles called `visible` — the #7 failure, one step after the conventions comment forbade it.

### D-S1.7-4 — `ticks(step, span)` takes a stepping spec, not a preset

The issue comment proposed `ticks(preset, span)`. It cannot serve header bands: a band steps at **its own** `header.unit`/`increment`, not at the preset's `tickUnit`. A single-header preset hides this because the two agree today; a two-band preset (S1.9) exposes it immediately.

```ts
export interface TickStep { readonly unit: TimeUnit; readonly increment: number }
export interface ViewPresetHeader extends TickStep { format: HeaderFormat }

ticks(step: TickStep, span: PixelSpan): readonly Tick[];
```

Call site, read aloud: `scale.ticks(band, visibleSpan)` — "ticks for this band across the visible span". Gridlines later pass `{ unit: preset.tickUnit, increment: preset.tickIncrement }`.

**`Tick` gains `width`** — the distance to the next boundary. A band cell is drawn with it, and only `time/` can compute the last cell's width without a sentinel tick or an off-by-one at the window edge. It is one subtraction at the place that already has both instants.

**The span is required.** An optional window keeps the whole-range walk alive as a supported call, which is how `MAX_TICKS = 100_000` survives to S3 with a test pinning it. `MAX_TICKS` stays, as what it actually is: a guard against a preset that does not advance.

**Intersection is band-cell intersection, not point intersection.** `ticks` emits the tick whose cell `[x, x + width)` covers `span.x` even when that tick's own `x` is left of the span, and stops at the first tick with `x >= span.x + span.width`. Otherwise the leftmost visible band cell has no label.

### D-S1.7-5 — `startOf` is a prerequisite, not a nicety

Windowed ticks must start at a *boundary*, not at `range.start` plus n steps. `startOf(zone, i, unit)` joins the existing `STEPPERS` registry as a second operation on the same table (`UNITS: Record<TimeUnit, { step, floor }>`), so "supported unit" stays one list — #32's fix, kept. It also fixes month and year ticks landing mid-month, which U4 is about and which S1.9's presets depend on.

### D-S1.7-6 — `header.bands` lands now, with one band

`FrameHeader.ticks` becomes `FrameHeader.bands`, emitted one per `preset.headers` entry, coarsest first. Today every shipped preset has exactly one header, so the rendered output is byte-identical and the seam changes **once** instead of at S1.7 and again at S1.9. S1.9 then ships multi-band presets as pure data with no seam change.

Band height and the stacking of two header rows are `render/` + theming concerns and stay at S1.9/S1.10; the backend renders N band rows and N is 1.

### D-S1.7-7 — `Overscan` names its axes, and is live on `Viewport` only

```ts
export interface Overscan { verticalRows?: number; horizontalPx?: number }
```

Mixed units, on purpose: the vertical axis buffers in **whole rows** because it culls through the height index (and must keep doing so when S5 makes row heights vary); the horizontal axis has no rows to count, so it buffers in px. The names carry the axis *and* the unit, so no reader has to hold the prose in their head. Default `{ verticalRows: 2, horizontalPx: 128 }`.

Live setter on `Viewport.overscan`, per "every config key is live-reconfigurable". **It is deliberately not a `GanttOptions` key at S1.7**: `Gantt` has no live setters at all yet (`scale`/`scroll` are the declared gap from S1.5 §5), and adding a public key whose setter arrives a step later is the gap widening, not closing. `Gantt.overscan` lands with the other setters at S1.8.

### D-S1.7-8 — `model/errors.ts`, and the runtime carve-out stated out loud

Conventions §3. `UnsupportedUnitError` is S1.7's thrower, so the `FreeGanttError` base lands here with it. `stepBy` and `ticks()` both still throw bare `RangeError` (`time/scale.ts:69,97`) — the earlier draft's claim that they no longer throw was wrong; #32 collapsed two lists into one registry, it did not remove the throw.

`model/` is specified as "types only: zero runtime beyond id/brand helpers". An error base is a **second** runtime carve-out, and it goes there because `view/` may not import `time/` and `render/` may import only `layout/` — `model/` is the only module every thrower can reach. The alternative is a per-layer error base, which is how one code vocabulary stops being one. `CLAUDE.md` and `plans/01` §1.1 are edited to say so (§8).

### D-S1.7-9 — `no-time-to-pixel-math` lands first, and its honest scope is written down

Guardrails before the code they guard (`plans/04` §3.2/§3.3). `docs/02` §3.2 fully specifies this rule and §5 lists it active from S0; **`eslint/rules/` contains no such file** — the time→px half of I12 has never been enforced, and S1.11's gate line assumes a rule that does not exist. It lands here, red fixture included, allowlist `src/time/scale.ts`, because this step is where the first horizontal px math outside `time/` would otherwise appear.

What it adds over the shipped `no-instant-arithmetic` — worth stating, because the overlap is large enough that someone will ask:

| Case | `no-instant-arithmetic` | `no-time-to-pixel-math` |
|---|---|---|
| `instant * pxPerMs` | flags | flags |
| `duration.value * pxPerMs` | misses (not `Instant`-typed) | flags |
| `const pxPerMs = width / (end - start)` | flags the inner subtraction | flags the declaration idiom |
| a conversion laundered through an untyped local | misses | misses — documented residue (`docs/01` §3) |

Type-aware linting is already wired for `src/**/*.ts` (`eslint.config.js:88-104`), so this costs no new infrastructure.

### D-S1.7-10 — `Viewport` is internal, and ships `batch()` with no caller

`Viewport` is not re-exported from `api/`. Nothing in the public surface needs it until `gantt.scale =` / `gantt.scroll =` land at S1.8; exporting it early is a public name we would then have to keep.

`Viewport.batch(run)` **does** ship now: it is the coalescing primitive conventions §5 specifies, it is the mechanism behind D-S1.7-1's "one reaction" guarantee, and it is ~10 lines (`scale.batch(() => scroll.batch(run))` plus its own hold flag). Its first caller is S1.9's `zoomTo`. This is the one thing in this spec built ahead of its caller, and it is called out rather than smuggled in.

### D-S1.7-11 — Horizontal culling is implemented in `layout/`, and not wired to the element until S1.8

`computeFrame` culls bars and band ticks horizontally, and it is unit-tested against a stated `visible`. `GanttShell` passes `visible.x` from `Viewport` like everything else — and today that value is always `0`, because `range: 'fitDataset'` fits `pxPerMs` to the pane, so `contentWidth ≡ paneWidth` and `max.x ≡ 0` (the review's Spec c2). Nothing is faked and nothing is dead: the code path is exercised by tests now and by the browser the moment a `zoom` key makes `contentWidth` exceed the pane (S1.9).

There is also a real x-axis defect underneath, which this step **does not** fix and must not pretend to: the row-label gutter sits *inside* the single scroller, so the element's content is `gutter + contentWidth` wide while only `contentWidth` of it is timeline. At a non-zero `max.x` the last `gutter` px of the timeline would be unreachable. The fix is the pane split (S1.8), not a conversion factor in `view/`. Recorded in §10.

*Rejected:* deferring horizontal culling wholesale to S1.8. The `layout/` half is 6 lines and its tests are the ones that pin the behaviour; writing it later means writing `visible.width` twice.

---

## 3. API

### 3.1 `src/model/errors.ts` — the second runtime carve-out

```ts
export class FreeGanttError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
/** `code: 'unsupported-unit'` — a preset or a caller stepped by a unit `time/` has no stepper for. */
export class UnsupportedUnitError extends FreeGanttError {}
```

### 3.2 `src/model/dataset.ts` — moved, not invented, and renamed off the naming skill's own checklist

`DatasetLike` moves from `view/gantt-shell.ts:15` to `model/`, because `layout/` needs it for `Viewport.bind` and may not import `view/` — and it stops being `DatasetLike` on the way. The naming skill's five checks say why:

1. **Glossary term.** CONTEXT.md's term is **Dataset**. There is no glossary entry for "a structural-typing escape hatch that stands in for one" — `Like` names the mechanism, not the concept.
2. **Call site.** `bind(dataset: DatasetLike, onChange)` reads "bind a dataset-like value" — hedged, and false: what gets bound *is* a dataset, `api/dataset.ts`'s `Dataset` class included.
3. **Search test.** A reader searching "Dataset" for every use of the concept should not have to also search "DatasetLike" to find the type most call sites actually want.
4. **One word, one meaning.** `model.Dataset` (the shape) and `api.Dataset` (the class that satisfies it) are the same concept at two altitudes, not two concepts sharing a word — CONTEXT.md already sets this precedent for `Gantt`: "the class; it is also the name of the concept."
5. **Category word.** `Like` is not one of the category words (attachment/binding/handle/…) that check 5 allows at the end of a name; it is a hedge stapled onto the domain noun, which is what the check rejects.

So `model/dataset.ts` exports `Dataset` (types only, zero deps), unchanged shape — `{ readonly entries: readonly Entry[]; readonly timeZone: string }`. `api/dataset.ts`'s class states the relationship instead of leaving it structural-by-coincidence:

```ts
import type { Dataset as DatasetContract } from '../model/index.js';
export class Dataset implements DatasetContract { /* unchanged body */ }
```

`ScaleBinding` becomes `Dataset & { readonly paneWidth: number }` — one pair, not three copies of `{ timeZone, entries }` (#40).

### 3.3 `src/time/` — windowed, aligned ticks

```ts
import type { PixelSpan } from '../model/index.js';

export interface TickStep { readonly unit: TimeUnit; readonly increment: number }
export interface ViewPresetHeader extends TickStep { format: HeaderFormat }

export interface Tick {
  instant: Instant;
  x: number;
  /** To the next boundary at this step — what a band cell is drawn with (D-S1.7-4). */
  width: number;
}

interface TimeScale {
  // …unchanged…
  /** Ticks whose cell `[x, x + width)` intersects `span`, aligned to `step`'s boundary in the
   *  dataset zone. Whole-range callers pass `{ x: 0, width: contentWidth }` — and are greppable. */
  ticks(step: TickStep, span: PixelSpan): readonly Tick[];
  /** Px extent of the whole range at this zoom — what `ScrollModel` binds as its content width. */
  readonly contentWidth: number;
}

/** `time/zone.ts`: floors an instant to a unit boundary in the dataset zone. */
export function startOf(zone: string, i: Instant, unit: TimeUnit): Instant;
```

`contentWidth` moves onto `TimeScale` itself; `computeFrame` stops re-deriving it from two `xForInstant` calls (`frame.ts:171`).

### 3.4 `src/layout/frame.ts` — bands, overscan, `visible`

```ts
import type { Rect } from '../model/index.js';

export interface FrameHeaderTick { x: number; width: number; label: string }
/** One row of the header, emitted per `preset.headers` entry, coarsest first. */
export interface FrameHeaderBand { unit: TimeUnit; increment: number; ticks: readonly FrameHeaderTick[] }
export interface FrameHeader { bands: readonly FrameHeaderBand[] }

export interface Overscan { verticalRows?: number; horizontalPx?: number }

export interface GeometryFrame {
  // …unchanged…
  /** Was `viewport`. The culled region in timeline-content coordinates (conventions §1, D-S1.7-3). */
  visible: Rect;
  header: FrameHeader;
  contentWidth: number;
  contentHeight: number;
}

export interface LayoutInput {
  // …unchanged…
  visible: Rect;
  /** Default `{ verticalRows: 2, horizontalPx: 128 }`. Live — see `Viewport.overscan`. */
  overscan?: Overscan;
}
```

**Refined by the 2026-08-25 review — `heights` left `LayoutInput` (`plans/01` §4).** The shipped shape
was `heights?: RowHeightIndex` on the input, with a doc comment telling the caller to build one index,
cache it by entry count and row height, and invalidate it itself — implementation knowledge pushed
across the seam, and four bookkeeping fields in `GanttShell` to obey it. `computeFrame(input, heights?)`
now takes the index as a second parameter, and `layout/frame-layout.ts`'s `FrameLayout` is the only
production caller that passes one: it owns the index, its cache key, and (at S5) its invalidation.
`computeFrame` stays pure and every test here still calls it directly.

**Culling rules — all inside `computeFrame`.** The buffer belongs to the layer that owns culling; `view/` never filters a frame (D-B).

- **Vertical, in index space.** `start = max(0, heights.indexAtY(visible.y) − verticalRows)`; the walk stops `verticalRows` rows after the first row whose `top >= visible.y + visible.height`. Expanding in indices, not pixels, is what keeps this correct when S5 makes row heights vary.
- **Horizontal, in px.** A bar is emitted when `[x, x + width]` intersects `visible` expanded by `horizontalPx`. Band ticks use the same expanded span.
- **Rows are vertical-only.** A row whose bars are all off-screen horizontally is still emitted — the grid pane needs its label. One list, two panes, one `top` (I9 by construction).
- **A zero dimension means "no window on that axis"**, matching the shipped `viewport.height > 0 ? … : Infinity` rule. An unmeasured host (detached, `display: none`, pre-paint) renders everything rather than nothing.
- `contentWidth` / `contentHeight` are always the **full** extent, never the window's.

**Item identity (I8) under scroll.** `Item.id` is `${entryId}:${segmentIndex}` (`model/ids.ts:16`), `:0` for every entry in S1 scope — never derived from window position or array offset. The new test scrolls the window across a fixture and asserts the id set for the overlapping region is identical before and after: the property, not a snapshot of one window.

### 3.5 `src/layout/viewport/viewport.ts` — the fan-in (pure)

```ts
export interface ViewportOptions {
  /** Private defaults when omitted — single-Gantt usage never meets either concept (`plans/01` §8.2). */
  scale?: TimeScaleModel;
  scroll?: ScrollModel;
  overscan?: Overscan;
}

/** @internal — `view/` only. Binding handle shape, per conventions §4. */
export interface ViewportHandle {
  unbind(): void;
  /** The timeline pane's measured drawable box. Fans out to `paneWidth`, `ScrollBinding.pane`,
   *  and `visible.width`/`height`. */
  setPaneSize(size: Size): void;
  /** Post-render extents from the frame. Fans out to `ScrollBinding.content`. */
  setContentSize(size: Size): void;
}

export class Viewport {
  constructor(options?: ViewportOptions);
  readonly scale: TimeScaleModel;
  readonly scroll: ScrollModel;

  /** One subscription for both models: the shell reacts once, not twice (D-S1.7-1).
   *  Refined by the 2026-08-25 review: single-subscriber on purpose — a Viewport holds ONE Gantt's
   *  pane and content extents, so a second `bind()` throws (`code: 'viewport-already-bound'`)
   *  rather than silently replacing the reaction. The shareable objects are the models (D9). */
  bind(dataset: Dataset, onChange: () => void): ViewportHandle;

  /** Resolved, ready for `LayoutInput` — the shell never reaches through to `scale.scale`. */
  get timeScale(): TimeScale;
  get preset(): ViewPreset;
  get overscan(): Overscan;
  set overscan(o: Overscan);

  /** The culling window, in timeline-content coordinates, from the LOCALLY clamped position
   *  (D-S1.7-2). Straight into `LayoutInput.visible`; also what `attachScroll` writes. */
  get visible(): Rect;

  /** Several writes, one host reaction. Re-entrant, flushes in a `finally` (conventions §5).
   *  First caller is S1.9's `zoomTo` (D-S1.7-10). */
  batch(run: () => void): void;
}
```

**No delegating `panTo`, `preset` setter, or `zoomTo` on `Viewport` at S1.7.** `Viewport.scroll.panTo` is the one path; a second, shorter path to the same write is `plans/02` §1.1's "one name per concept" failing at the object level (the review's finding against S1.9's `gantt.preset` *and* `gantt.scale.preset`).

The whole render call becomes:

```ts
computeFrame({
  entries, rowHeight, revision: this.#revision++, heights,
  scale: viewport.timeScale,
  preset: viewport.preset,
  visible: viewport.visible,
  overscan: viewport.overscan,
});
```

**This settles #8's open question.** One `ResizeObserver`, one measured box, one consumer: `attachPaneSize` → `handle.setPaneSize()` → `Viewport` fans out to three destinations. Two observers measuring one element for two consumers is the alternative, and it is the wrong one. If #8 lands first it wires to the scale handle as its issue says, and the move here is a two-line call-site change.

### 3.6 `src/view/scroll-attachment.ts` — thinner by exactly one responsibility

```ts
export interface ScrollAttachment {
  /** Write the viewport's clamped position into the element. Called by `GanttShell.render()`
   *  AFTER `backend.sync()` — the content layer must be the new size before a position write
   *  is meaningful (D-S1.5-7, now visible in the shell instead of hidden in a reaction). */
  writePosition(): void;
  detach(): void;
}

export function attachScroll(element: HTMLElement, viewport: Viewport): ScrollAttachment;
```

- No `setContent`/`setPane` — those are `ViewportHandle`'s, and there is now exactly one place to push a measurement.
- No `onChange` — `Viewport` owns the reaction.
- The echo rule (D-S1.5-6) is unchanged in substance and shorter in code: the target is `viewport.visible`, already locally clamped, instead of a `mine()` this file recomputes. `element → model` still calls `viewport.scroll.panTo` only when the element differs from that target by `>= 1`.
- The `>= 1` epsilon keeps its comment naming both its jobs: fractional `scrollTop` under fractional device-pixel ratios, and filtering redundant writes.

**Naming (`naming` skill, five checks).** `writePosition()` — call site `this.#scrollAttachment.writePosition()` at the end of `render()`, read aloud: "scroll attachment, write the position". True: this file is the *only* one permitted to write an element's native offset (I12), so naming the write names the privilege. It also keeps one word from the shipped private `writeElement()` up to the seam. *Rejected:* `sync()` (check 4 — the backend's word, `backend.sync(frame)`); `showPosition()` (check 2 — "show the position" does not say who shows what to whom); `scrollTo()` (check 1 — `CONTEXT.md` → **Reveal** lists it under _Avoid_); `apply()` / `flush()` (check 3 — search returns everything).

The reverse direction stays `viewport.scroll.panTo(…)`: **pan** is the model-side concept and **scroll** the element-side one (`CONTEXT.md` → Pan), so the asymmetry is the glossary being obeyed, not an inconsistency.

**One more rename falls out of check 4.** `ViewportHandle.setPaneSize`/`setContentSize` would fan out to `ScrollBindingHandle.setPane`/`setContent` — two spellings of one concept, one call apart. The binding handle's setters take the same names: `setPaneSize` / `setContentSize` (fields stay `pane` / `content`). One term end to end: `attachPaneSize` → `setPaneSize` → `paneWidth` / `pane`.

### 3.7 `src/render/dom/index.ts` — N band rows

`syncHeader` takes `frame.header.bands` and reconciles two levels: bands keyed by index, ticks keyed by index within a band. Each band is one `.fg-band` row; each tick is a `.fg-tick` positioned by `translateX(x)` and now **sized** by `width`. Scope stays inside the reconciler's bound (attr/class/style/text + keyed children) — a nested keyed list is still a keyed list.

### 3.8 Rename ledger — every site, so the seam change is settled rather than started

Six renames fall out of §3. A rename is finished when the retired spelling returns **no** results, so each row below is a grep to run at the end, not a guess made at the start. Line numbers are against `main` @ `012a29d`.

#### A · `ScrollBindingHandle.setContent` / `setPane` → `setContentSize` / `setPaneSize`
*Why:* `ViewportHandle.setPaneSize` would fan out to `handle.setPane` one call later — two spellings of one glossary term (**Pane size**), one frame apart.

| Site | What changes |
|---|---|
| `src/layout/viewport/scroll-model.ts:35,36,125,130,159` | the interface, the two closures, the `#notifyAll` doc comment |
| `src/layout/viewport/scroll-model.test.ts:48,53,76,85,88,117` | six call sites, one test title |
| `plans/01` §8.2 `:504` | the D-A handle-shape sentence spells `{ unbind(), setContent(size), setPane(size) }` |
| `plans/s1.5-scroll-model/README.md:159,160,196,291,301` | §3.2 block, the termination argument, two foot-gun rows, the test list |

Fields keep their names (`ScrollBinding.content`, `.pane`). Setter and field differing by the category noun is the same shape as `setPaneWidth`/`paneWidth`, already shipped.

#### B · `attachScroll` loses its binding; `ScrollAttachment` loses `setContent`/`setPane` and gains `writePosition`

| Site | What changes |
|---|---|
| `src/view/scroll-attachment.ts:8-14` | interface → `{ writePosition, detach }` |
| `src/view/scroll-attachment.ts:20-33` | the doc block's "Owns the binding" and "`onChange` is the host's render" paragraphs are now false |
| `src/view/scroll-attachment.ts:34-48,63,79-88` | `content`/`pane` locals, `mine()`, `scroll.bind(...)` and the two setters all delete; the target becomes `viewport.visible` |
| `src/view/scroll-attachment.test.ts:15,27,42,57` | four constructions, each with its `setContent`/`setPane` prologue |
| `src/view/gantt-shell.ts:7-8,66-69,111,137-140` | import, the `#scrollAttachment: … \| undefined` field **and its five-line comment about the construction-order window** — which the fan-in closes: `Viewport` is constructed before either bind, so the field is never `undefined` during a render and the `?.` guards go |
| `plans/s1.5-scroll-model/README.md:99,115,206-227,349` | D-S1.5-6's "`myMax` is derived from the attachment's own `setContent`/`setPane`", D-S1.5-9, the whole §3.3 block, the ticked TODO line |
| `CONTEXT.md:143` **Attachment** | "`attachScroll` owns element scroll (I12)" stays true; add that an Attachment owns **no** Binding — that is the line that keeps the two words apart |
| issue **#9** | **Closed.** Was fully stale (`scrollTo()`, `contentSize`/`viewportSize`, `observable.ts`); S1.5 shipped a different design. Closed against `plans/s1.5-scroll-model/README.md` with a comment listing every changed point — #54's precedent is that a retired name in the tracker is the expensive one, because an agent reads it with no signal it is retired |

#### C · `LayoutInput.viewport` / `GeometryFrame.viewport` → `visible: Rect`

`src/layout/frame.ts:85,103-105,120,126-127,167` · `src/layout/frame.test.ts:9,17,32,40,53,61,66,80,97,112` · `src/view/gantt-shell.ts:151` · `src/render/dom/index.test.ts:34,61,98` · `src/render/null/index.test.ts:26` · `plans/01:279,284,312`.

Two prose sites keep the word and must be re-read rather than replaced: `src/view/gantt-shell.test.ts:144` and `e2e/harness.spec.ts:21` describe the *regression* ("render() hardcoded `viewport.y` to 0") — they name history, so they become "the culling window's `y`". And `src/render/backend.ts:26` says "a viewport width to `TimeScaleModel`/`computeFrame` must subtract this first": that is **pane width** (conventions §1), and the sentence is one of the few places the gutter rule is written down, so it gets the new term, not deletion.

#### D · `FrameHeader.ticks` → `FrameHeader.bands`
`src/layout/frame.ts:74-80,86,160-163` · `src/layout/index.ts:8-9` (export `FrameHeaderBand`) · `src/render/dom/index.ts:6,15,151` + `syncHeader` · `src/layout/frame.test.ts:84-86` · `plans/01` §4's `GeometryFrame` listing.

#### E · `DatasetLike` → `model/`, renamed to `Dataset` (naming skill, §3.2), and an S1.5 claim that never shipped
`src/view/gantt-shell.ts:15,31` · `docs/adr/0004:22` (names `view/gantt-shell.ts` as its home) · `api/dataset.ts` (class gains `implements DatasetContract`, aliased import from `model/`).

> **`plans/s1.5-scroll-model/README.md:240` says "`ScaleBinding` becomes `DatasetLike & { readonly paneWidth: number }`" and §9 ticks it as done. It did not happen** — `time-scale-model.ts:28-35` declares all three fields inline. It *could* not happen: `DatasetLike` lives in `view/`, and `layout/` may not import `view/` (I1). The spec asserted an edge the boundary lint forbids, and the tick was applied to the paraphrase rather than the type. Moving `DatasetLike` to `model/` is what makes the sentence true, so S1.7 pays a debt rather than adding a feature — and the check that catches the next one is that a ticked box names the file it changed.

The move is also where the name gets fixed rather than carried forward unchanged: `DatasetLike` fails the naming skill's checks 1, 2 and 5 (§3.2). It becomes `Dataset` in `model/`, the same word `api/dataset.ts`'s class already uses for the same concept.

#### F · `ticks(preset)` → `ticks(step, span)`, and `RangeError` → `UnsupportedUnitError`
`src/time/scale.ts:39,69,95-110` · `src/layout/frame.ts:160` · `src/time/scale.test.ts:33,46,53,54`.

**Two throws stay `RangeError`, on purpose.** `pxPerMsForPreset`'s non-advancing-preset throw (`scale.ts:194`) and `instant()`'s bad-ISO throw (`instant.ts:17`) are different failures, and conventions §3 allocates no code for either. They are flagged here rather than swept into `UnsupportedUnitError`, which would make one code mean three things — the failure this whole conventions round exists to stop. They get codes when someone needs to catch them.

---

## 4. Public surface

`api/index.ts` gains **nothing** in this step. `Viewport`, `ViewportHandle`, `Overscan`, `TickStep` and `FrameHeaderBand` are all internal; `FreeGanttError` and `UnsupportedUnitError` become public at S1.8, with the first error a consumer can actually catch (`HostNotFoundError`).

**Declared gaps, unchanged from S1.5 §5 and not widened here:** `gantt.scale =`, `gantt.scroll =` and now `gantt.overscan` are all S1.8, where `Viewport` owns the unbind → rebind → re-render sequence in one place.

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| A caller walks `scale.ticks()` over a multi-year range at the hour preset and gets 100,000 objects | The span is required (D-S1.7-4). `MAX_TICKS` is the non-advancing-preset guard, not an output cap. |
| A backend re-derives each band cell's width from the next tick and gets the last one wrong | `Tick.width` / `FrameHeaderTick.width` (D-S1.7-4). |
| A shell filters the frame's rows to what fits | Culling is `computeFrame`'s, and `visible` is an input to it, not a suggestion (D-B). |
| Two Gantts share a scroll, the shorter renders blank | The window is the locally clamped position (D-S1.7-2), same value the element is written with. |
| `Viewport.visible` and the element disagree by the row-label gutter | The shell no longer converts coordinates at all (D-S1.7-3); the backend owns the gutter and always did. |
| The host has to know when to re-measure | It never does: `attachPaneSize` (#8) → `setPaneSize` → three destinations. |
| Someone adds `overscan` to `GanttOptions` and it silently is not live | Not a `GanttOptions` key at S1.7 (D-S1.7-7). |
| A stray `duration * pxPerMs` appears in `layout/` | `no-time-to-pixel-math`, landed before the code (D-S1.7-9). |

---

## 6. Tests

All `pure` except where noted.

- **`time/scale.test.ts`** — `ticks(step, span)`: alignment to the unit boundary in the dataset zone; a span inside the range returns exactly the intersecting cells; the cell covering `span.x` is included even when its `x` is left of the span; an empty span returns none; `{ x: 0, width: contentWidth }` matches today's whole-range output; `Tick.width` sums to the range across a DST transition (a day cell is 23 or 25 hours' worth of px, not always 24); an unsupported unit throws `UnsupportedUnitError`, not `RangeError`.
- **`time/zone.test.ts`** — `startOf` property test per unit: idempotent, never later than the input, and `startOf(step(x)) > startOf(x)`.
- **`layout/frame.test.ts`** — partial rows at both window edges; `verticalRows` honoured **through the index**; `contentHeight`/`contentWidth` unaffected by the window; a zero `width`/`height` disables that axis' culling; horizontal culling emits only intersecting bars plus `horizontalPx`, **and every row regardless**; one band per `preset.headers` entry, coarsest first.
- **`layout/frame.test.ts` (I8 under scroll)** — scroll the window across a fixture; the id set for the overlapping region is identical before and after. Previously untested.
- **`layout/viewport/viewport.test.ts`** — `setPaneSize` reaches both models; **one** `onChange` per change, not two; `visible` uses the local clamp when the shared position exceeds this Gantt's own max (U3, the §0 defect); `unbind` detaches both; `overscan` set re-notifies; a fresh `Viewport` with no options resolves a usable window; `batch` delivers one host reaction and no observer sees an intermediate state; a throwing `run` still flushes.
- **`view/scroll-attachment.test.ts`** (dom) — `writePosition()` writes the clamped target; a native `scroll` event within epsilon of that target does not call `panTo`; outside it does; `detach()` removes the listener. *Structural only — happy-dom's `scrollTop` neither clamps nor fires.*
- **`view/gantt-shell.test.ts`** (dom) — `render()` calls `backend.sync` before `writePosition()` (D-S1.5-7); the shell holds exactly one reaction.
- **e2e (`e2e/scroll-sync.spec.ts`, extended)** — the pinned chart shows its **last rows**, not an empty pane, while the shared position runs past its end. This is the check that would have caught the §0 defect.
- **lint** — `no-time-to-pixel-math` red fixture under `eslint/rules/fixtures/`, plus its `.test.cjs`, plus `scripts/guard-red-test.mjs` confirming the fixture still fails.

---

## 7. Spec edits implied — landed **with** this step, not deferred to the issue thread

- `plans/01` §4 — `LayoutInput.viewport` / `GeometryFrame.viewport` → `visible: Rect`; `header.ticks` → `header.bands`; `contentWidth` and `overscan` added to the interface listing.
- `plans/01` §8.2 — `Viewport` named as the fan-in owning both models, with the "one measurement, three destinations" rule that closes #8's open question, and the binding/attachment split it implies for `attachScroll`.
- `plans/01` §1.1 + `CLAUDE.md` — `model/`'s runtime widens from "id/brand helpers" to "id/brand helpers and the `FreeGanttError` base" (D-S1.7-8); `model/` named as `Dataset`'s home (moved and renamed from `DatasetLike` — §3.2).
- `plans/s1.5-scroll-model/README.md` — the three "S1.8" pointers for `Viewport` (§5, §10) become "S1.7" (Q1); §3.2/§3.3's handle and attachment blocks, D-S1.5-6's `myMax` paragraph, D-S1.5-9, the two foot-gun rows and the ticked §9 line are all marked superseded by §3.6/§3.8 here; §3.4's `ScaleBinding = DatasetLike & …` claim is corrected from "done" to "done at S1.7, and here is why it could not be done at S1.5" (§3.8 E).
- `docs/adr/0004` `:22` — `DatasetLike`'s home is `model/`, not `view/gantt-shell.ts` — and the name it lands under is `Dataset` (§3.2).
- Issue **#9** — closed against the shipped S1.5 spec; its body still specifies `scrollTo()`, `contentSize`/`viewportSize` and `observable.ts`, none of which exist (§3.8 B).
- `docs/02` §5 — `no-time-to-pixel-math` (3.2) moves from "active S0" to its real slice, S1.
- `docs/01` §I12 — the scroll half's rule name is `no-scroll-outside-scroll-model`, not `no-raw-scroll` (already fixed at S1.5 for `docs/02` B4; this is the second site).
- `CONTEXT.md` → **Dataset** — one clause added: `model/dataset.ts`'s `Dataset` is the structural contract `api/dataset.ts`'s `Dataset` class satisfies (`implements`), the same relationship the entry already states for `Gantt`; formerly `DatasetLike` in `view/` (§3.2).
- `CONTEXT.md` — new entries: **Viewport** (the fan-in object owning scale + scroll and resolving what is visible), **Visible** (the culled region in timeline-content coordinates), **Overscan**, **Header band**. Edited: **TimeScale**'s _Avoid_ line still reads "Viewport is the rendered/visible region", which the conventions comment retired — it becomes "Viewport is the fan-in object; the region is Visible". **Tick** gains its cell width.

---

## 8. TODO

Guardrails and types first (`plans/04` §3.2/§3.3), then `time/`, then `layout/`, then the DOM edge.

### Guardrails
- [ ] `eslint/rules/no-time-to-pixel-math.cjs` — type-aware, allowlist `src/time/scale.ts`; register in `eslint/rules/index.cjs` and `eslint.config.js`
- [ ] `eslint/rules/no-time-to-pixel-math.test.cjs` + red fixture; confirm `scripts/guard-red-test.mjs` fails on it
- [ ] `docs/02` §5 and `docs/01` §I12 corrections

### Types and errors
- [ ] `src/model/errors.ts` — `FreeGanttError`, `UnsupportedUnitError`; re-export from `src/model/index.ts`
- [ ] Move `DatasetLike` to `src/model/dataset.ts`, renamed `Dataset` (naming skill, §3.2); `ScaleBinding = Dataset & { readonly paneWidth: number }`; update `view/gantt-shell.ts`; `api/dataset.ts`'s class gains `implements DatasetContract` against the aliased import

### `time/`
- [ ] `startOf(zone, i, unit)` — as a `floor` column on the existing `STEPPERS`/`UNITS` registry
- [ ] `TickStep`; `ViewPresetHeader extends TickStep`
- [ ] `ticks(step, span)` — required span, boundary-aligned, cell intersection, `Tick.width`
- [ ] `TimeScale.contentWidth`
- [ ] `stepBy` / `ticks` throw `UnsupportedUnitError`, not `RangeError`
- [ ] Tests per §6

### `layout/`
- [ ] `LayoutInput.visible` / `GeometryFrame.visible` (rename from `viewport`); `Overscan`
- [ ] `FrameHeaderBand`, `FrameHeaderTick.width`, `FrameHeader.bands`; one band per `preset.headers` entry
- [ ] Vertical culling expanded in **index** space by `verticalRows`
- [ ] Horizontal culling of bars and band ticks by `horizontalPx`; rows stay vertical-only
- [ ] `contentWidth` read from `scale`, not re-derived
- [ ] `src/layout/viewport/viewport.ts` — per §3.5, including the local clamp and `batch()`
- [ ] Tests per §6, including I8 under scroll

### `view/` and `render/`
- [ ] `ScrollBindingHandle.setContent`/`setPane` → `setContentSize`/`setPaneSize` (§3.8 A — 4 sites)
- [ ] `attachScroll(element, viewport)` → `{ writePosition, detach }`; binding, reaction, `mine()` and both setters removed (§3.8 B)
- [ ] `GanttShell` — construct `Viewport`, hold **one** handle and **one** reaction; `render()` ends `sync()` → `setContentSize()` → `writePosition()`
- [ ] `GanttShell` — `#scrollAttachment` stops being `| undefined`; delete the five-line construction-order comment the fan-in makes obsolete (§3.8 B)
- [ ] `GanttShell` — drop both gutter adjustments (D-S1.7-3)
- [ ] `render/dom` — nested keyed sync for bands; ticks sized by `width`
- [ ] Tests per §6 (dom + e2e)

### Closing the ledger (§3.8)
- [ ] Run each retired spelling as a grep and confirm zero results: `setContent(` · `setPane(` · `\.viewport\b` in `layout/`+`render/`+`view/` · `header.ticks` · `ticks(preset` · `DatasetLike` anywhere (retired, renamed to `Dataset` — §3.2)
- [ ] Prose sites that keep the word but change the term: `render/backend.ts:26` ("viewport width" → pane width), `gantt-shell.test.ts:144` and `e2e/harness.spec.ts:21` (regression titles naming history)
- [ ] `docs/adr/0004:22` — `DatasetLike`'s home, and its new name `Dataset`
- [x] Close issue **#9** against the shipped S1.5 spec

### Review and docs
- [x] Review `harness/main.ts` against the library rules (CLAUDE.md) — record any gap against S1.7 and fix it in `src/`, not in the harness — none found (6 lines, no pixel arithmetic, no restated defaults)
- [x] The §7 spec edits, landed with this step

### Acceptance
- [x] **U1** — only windowed rows exist in the DOM: proven at fixture scale by `layout/frame.test.ts`'s vertical-culling suite and by `e2e/harness.spec.ts`'s scroll regression, in a real browser. The literal **5,000-entry fixture** (`plans/03` S1 acceptance 1) is explicitly deferred to S1.11 (`plans/temp_todo_for_1.7.md` §5) — the windowing mechanism it would exercise is unit- and e2e-tested now, the fixture is a scale/perf check, not a correctness one
- [x] **U2** — `verticalRows` rows exist above and below the window (`layout/frame.test.ts`, default-overscan case)
- [x] **U3** — pinned chart renders its last rows, not an empty pane (`e2e/scroll-sync.spec.ts` pinned-chart case; `layout/viewport/viewport.test.ts`'s local-clamp case)
- [x] **U4** — month/year ticks land on unit boundaries in the dataset zone, across a DST transition (`plans/03` S1 acceptance 5) — `time/scale.test.ts`
- [x] **U5** — one `onChange` per change; `batch` delivers one host reaction (`layout/viewport/viewport.test.ts`); resizing the window re-fits the axis (`e2e/pane-resize.spec.ts`, #8's literal repro)
- [x] **U6** — `harness/main.ts` still contains no pixel arithmetic and no tick loop

---

## 9. Deferred, with the caller that will bring it back

| Deferred | Returns at | Needs |
|---|---|---|
| `gantt.reveal(entryId)` | S1.9 (corrected from S1.8, `plans/s1.8-pane-layout/README.md` §0 Q1) | `TimeScaleIntent.zoom` — horizontal is a no-op while `contentWidth ≡ paneWidth` makes every bar already visible on x |
| `gantt.scale =` / `gantt.scroll =` setters | **Cut**, not deferred (`plans/s1.8-pane-layout/README.md` §0 Q2) | `Gantt` never re-exposes `scale`/`scroll` — one key, one write path (`plans/02` §1.1); a caller sharing models constructed them and holds the references |
| `gantt.overscan` setter | S1.9 (corrected from S1.8) | lands with the rest of the live keys (`preset`, `range`, `zoom`), so the public-surface pass happens once |
| The row-label gutter leaving the scrollable content (the x-axis defect in D-S1.7-11) | S1.8 (shipped — `PaneLayout`, D-S1.8-1/D-S1.8-2) | the pane split — the timeline pane as its own scroller |
| `TimeScaleIntent.zoom`, and with it a horizontal scroll range that is not 0 | S1.9 | D-F′, anchored zoom |
| Multi-band presets, band heights, sticky header | S1.9 / S1.10 | presets as data; theming tokens |
| Gridlines from `preset.tickUnit` | S1.10 | the decorations vocabulary |
