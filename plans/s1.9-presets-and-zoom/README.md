# S1.9 — Presets hour→year, multi-band headers, anchored zoom

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.9 · **Issue:** #1 · **Baseline:** `s1-close-plan` @ `6f81d7c` — spec-only. S1.8 has not landed in code (`GanttShell` is still one scroller, `render/dom` still owns the row-label gutter). This document builds on [`plans/s1.8-pane-layout/README.md`](../s1.8-pane-layout/README.md) as **settled design**, same as S1.8 built on `plans/s1.7-windowed-frame/README.md` before its own code existed. Code order stays `S1.8 → S1.9` (`plans/temp_todo_for_s1-close.md` §3): the pane split gives the timeline pane a coordinate frame starting at its own `0`, which anchored zoom's `instantForX(scroll.x + anchorX)` needs to be correct.
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, `batch()` — and **D-F′**, which this step is the first to make observable.
**Supersedes:** the [S1.9 issue comment](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400111232) and the S1.9 findings in `plans/fix-issue1-apis.md`, wherever they disagree. §2 records every decision and which finding it closes.

This directory is the settled spec for S1.9, in the same form as [`plans/s1.8-pane-layout/README.md`](../s1.8-pane-layout/README.md).

> **§0 is settled.** Every scope call the S1.7/S1.8 ledger handed forward, and every open finding against the S1.9 issue comment, is answered below. Everything in this document is settled.

---

## 0. Scope calls — confirmed

`plans/s1.9-presets-and-zoom/README.md` (this file, before this rewrite) carried five items forward from S1.7 and S1.8. `plans/fix-issue1-apis.md` raised eight more against the issue comment itself. Both lists close here.

| # | Question | Answer |
|---|---|---|
| **Q1** | **Does `gantt.reveal(entryId)` land here, in full?** S1.7 §9 → S1.8 §0 Q1 deferred it because the x half is a no-op while `contentWidth ≡ paneWidth`. | **Confirmed: yes, both axes.** `zoom` exists as of this step, so `contentWidth` can exceed `paneWidth` and the x half means something. §2 D-S1.9-6. |
| **Q2** | **Does `gantt.overscan` land here?** S1.7 §4/§9 → S1.8 §0 Q2 moved it here "with the rest of the live keys, so the public-surface pass happens once." | **Confirmed.** `Viewport.overscan` has been live since S1.7 (`viewport.ts:130`); this step gives it a public `Gantt` route alongside `preset`/`range`/`zoom`. §2 D-S1.9-7. |
| **Q3** | **What makes `max.x` non-zero for the first time?** S1.7 §9, D-S1.7-11. | `TimeScaleIntent.zoom`. §2 D-S1.9-2. The **shipped default stays `zoom: 'fitViewport'`** — this step does not turn horizontal windowing on by default; S1.11's 5,000-entry page does, explicitly, with `zoom: 'preset'` (D-S1.9-10). |
| **Q4** | **Multi-band presets — data only, or a seam change?** S1.7 §9, D-S1.7-6. | **Data only.** `computeFrame` already maps `preset.headers` to `FrameHeaderBand[]` (`src/layout/frame.ts:208-215`) — it was written generic on the chance a preset would one day carry more than one header. This step is that day; no `layout/` or `render/` edit. §2 D-S1.9-4. |
| **Q5** | **`gantt.scale =` / `gantt.scroll =`?** S1.7 §9 → S1.8 §0 Q2 cut both. | **Still cut.** Restated, not reopened: one key must have one write path (`plans/02` §1.1); a caller that wants to share models constructs and holds them. |
| **Q6** | **(`fix-issue1-apis.md` c1) Does S1.9 reverse locked decision D-F without saying so?** | **Yes, and now it says so.** D-F is struck; D-F′ replaces it. §2 D-S1.9-1 is the decision record the review asked for. |
| **Q7** | **(`fix-issue1-apis.md` Standards) `zoom` names two concepts: the density mode and `setPreset(ref, {zoom: 'follow'\|'keep'})`.** | **The second meaning is cut.** No `setPreset` method ships. A preset switch is a plain assignment (`gantt.preset = x`) like every other config key (`plans/02` "Reconfiguration is just assignment") — it carries no re-fit policy to name. `zoom` now names exactly one thing. §2 D-S1.9-8. |
| **Q8** | **(`fix-issue1-apis.md` Standards) `resolvePreset` needs a typed error, and §7 currently documents unknown-preset-id as a dev-mode warning.** | **`UnknownPresetError` ships; §7 is corrected in the same commit.** §2 D-S1.9-3, §7 below. |
| **Q9** | **(`fix-issue1-apis.md` Design #11) Bare `string` for a preset id.** | **`PresetRef = ShippedPresetId \| ViewPreset`, `ShippedPresetId` a closed union of the eight shipped ids.** Autocomplete on the common path; a `ViewPreset` object still works for a custom preset. §2 D-S1.9-3. |
| **Q10** | **(`fix-issue1-apis.md` Spec c1, restated) `TimeScaleModel.zoomTo` took `anchorInstant` as a caller-supplied argument.** | **It doesn't. `Viewport.zoomTo`/`zoomBy` read the anchored instant off the scale before writing anything** — a caller states *where* (a pixel), never *what instant that pixel currently means*, which the model already knows. §2 D-S1.9-5. |
| **Q11** | **(`fix-issue1-apis.md` fix-order #1) `Viewport.#batch` has no primitive — is anchored zoom unimplementable?** | **Stale finding — `Viewport.batch()` shipped at S1.7** (`viewport.ts:153-154`, doc comment: "First caller is S1.9's `zoomTo`"). No gap to close. |
| **Q12** | **What happens when a caller passes both `scale` and `preset`/`range`/`zoom` to `new Gantt(...)`?** Not asked anywhere; a real ambiguity once these become `GanttOptions` fields. | **The shared `scale` wins; the construction-time keys are a no-op with a dev-mode warning.** They exist to build the *private* default (`plans/02` §2's example passes them with no `scale` in sight). A caller who wants specific intent on a *shared* model states it on the `TimeScaleModel` itself. §2 D-S1.9-9. |

Not a question: the `RenderBackend`/`PaneLayout` seam this step's `zoomTo` depends on is entirely S1.8's — `Viewport.zoomTo` reads `Viewport`'s own `#paneSize`/`scroll.state.position`, neither of which S1.9 touches the shape of. There is nothing here for S1.9 to re-derive.

---

## 1. User stories

- **U1.** I switch `gantt.preset` from `'day'` to `'weekAndMonth'`. The axis redraws with two header bands; no bar loses its identity (I8).
- **U2.** I scroll-wheel-zoom (a future S4 gesture) or call `gantt.zoomBy(1.5, pointerX)` myself today. The instant under my pointer stays under my pointer.
- **U3.** I call `gantt.zoomTo(pxPerMs)` with no anchor. The center of my current view stays centered.
- **U4.** I call `gantt.reveal('t42')`. If the bar is already fully visible, nothing moves. If it's off-screen on either axis, the view moves the least distance that brings it fully into the pane.
- **U5.** I set `gantt.overscan = { horizontalPx: 256 }`. Bars further off-screen start rendering before they're needed, on the next frame, live.
- **U6.** (developer) I pass an unknown preset id string. I get a `FreeGanttError` subclass with a code, not a silent fallback and not a bare string I have to match.
- **U7.** (developer) I share one `TimeScaleModel` between two Gantts and call `zoomTo` on one. Both retune — sharing a scale always meant this (`plans/02` §5), and this step is the first to make it visible.

---

## 2. Decisions

Settled in review. Each states the alternative it beat and, where one exists, the finding it closes.

### D-S1.9-1 — D-F is struck; D-F′ replaces it

**D-F (locked, struck by this decision):** *"`TimeScaleModel.zoomTo({ pxPerMs, anchorInstant, anchorX })` recomputes `range.start` so the anchored instant stays under the cursor."*

**D-F′ (this step):** `range` is the full content span — `'fitDataset'`'s min/max over every bound dataset, or a pinned `TimeSpan`. The visible slice is `[scroll.x, scroll.x + paneWidth]`. Anchored zoom writes `scale.zoom` and `scroll.x` inside one `Viewport.batch()` and **never writes `range.start`**. The method moves from `TimeScaleModel` to `Viewport` (§3.2), because it needs `scroll` — a `TimeScaleModel` alone cannot move the visible slice, only reshape the content it maps.

This was already true in spirit since S1.7 gave `range` the "full extent, never the window's" contract (`frame.ts:104-106`) and `visible` its own separate resolution (`viewport.ts:139-149`); D-F, written before either shipped, described the older one-concept design. D-F′ is the decision record `fix-issue1-apis.md` c1 said was missing, not a change to code that already exists.

*Rejected:* keeping `range.start` mobile and letting zoom shift it. Two things would then move `range` — a dataset edit and a zoom gesture — and `ScrollModel.max` (which is derived from `content - pane`, itself derived from `range`) would need to distinguish "the content got wider" from "the window slid," which it cannot do today without a third field.

### D-S1.9-2 — `TimeScaleIntent` splits `range` from `zoom`; the split is free at the default

```ts
export type TimeScaleZoom = 'fitViewport' | 'preset' | { readonly pxPerMs: number };

export interface TimeScaleIntent {
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  /** Default `'fitViewport'`. */
  zoom?: TimeScaleZoom;
}
```

- **`'fitViewport'`** (default, unchanged behavior) — `pxPerMs = paneWidth / spanMs` when both are positive, else the preset's own zoom (`pxPerMsForPreset`). This is `TimeScaleModel.#resolve`'s existing formula (`time-scale-model.ts:159-160`), moved behind a name instead of being the only option. **Proof obligation, not a claim:** `time-scale-model.test.ts`'s existing assertions must pass unmodified — that is what "free at the default" means, and a diff to that file that isn't test-only additions is a regression.
- **`'preset'`** — `pxPerMs = pxPerMsForPreset(...)`, ignoring measured pane width. This is the first zoom mode where `contentWidth` can exceed `paneWidth`, so it is what S1.11's 5,000-entry page sets (D-S1.9-10).
- **`{ pxPerMs }`** — an explicit density. What `zoomTo`/`zoomBy` write; also directly settable by a caller who wants a specific density with no anchoring.

`zoom` now names exactly one concept — the density mode — closing `fix-issue1-apis.md`'s Standards finding (Q7). It replaces nothing that shipped; it is new.

### D-S1.9-3 — Presets move to `time/presets.ts`; `PresetRef` and `resolvePreset` are the one way in

`hourPreset` … `yearPreset` (five, single-band) move out of `scale.ts` unchanged. Three multi-band presets join them:

| Preset | Headers (coarsest first) | `tickUnit` |
|---|---|---|
| `dayAndWeekPreset` | week, day | `d` |
| `weekAndMonthPreset` | month, week | `w` |
| `monthAndYearPreset` | year, month | `M` |

**Rule, written into `ViewPreset`'s doc comment:** `tickUnit` is never coarser than the last (finest) header. The header bands are what a human reads; `tickUnit` is what the grid gridlines and a future snap-to-tick gesture actually step by, and it must resolve at least as finely as the finest thing labelled, or a label would claim a boundary no gridline draws.

```ts
export type ShippedPresetId =
  | 'hour' | 'day' | 'week' | 'month' | 'year'
  | 'dayAndWeek' | 'weekAndMonth' | 'monthAndYear';

export const presets: Readonly<Record<ShippedPresetId, ViewPreset>>;

/** A caller states either a shipped id (autocompletes) or a full custom object — never a bare
 *  string with no closed set behind it (fix-issue1-apis.md Design #11). */
export type PresetRef = ShippedPresetId | ViewPreset;

/** Throws `UnknownPresetError` for an id outside `presets`. A `ViewPreset` object passes through
 *  unchanged — a custom preset is never a library edit. */
export function resolvePreset(ref: PresetRef): ViewPreset;
```

`TimeScaleModel`'s constructor and its `preset` setter are the only two callers of `resolvePreset` (§3.1) — one way in, matching `plans/02` §1.1.

*Rejected:* `presets: Record<string, ViewPreset>` (the issue comment's shape) — no autocomplete on the eight ids every consumer actually types, and it invites a typo that resolves to `undefined` at runtime instead of a caught error at the call site.

### D-S1.9-4 — Multi-band presets ship as data; `computeFrame` does not change

`computeFrame` already does `preset.headers.map(header => ({ ... ticks: scale.ticks({unit, increment}, span) ... }))` (`frame.ts:208-215`) — written generic at S1.7 on the chance a preset would carry more than one header (S1.7 README, D-S1.7-6: *"shipped with one band, so the seam changed once instead of twice"*). This is that second time, and it costs zero lines in `layout/`. `render/dom` already keys bands by index (CONTEXT.md, **Header band**) and needs no edit either.

### D-S1.9-5 — `Viewport.zoomTo`/`zoomBy`: the anchor is derived, never supplied; content size is pushed before the pan

```ts
/** Reads the instant currently under `anchorX` (default: pane center) BEFORE writing anything, then
 *  writes scale.zoom and repositions scroll.x inside one batch so that instant is back under
 *  anchorX after. Never touches range.start (D-F′). One notification (`batch()`). */
zoomTo(pxPerMs: number, anchorX?: number): void;

/** `zoomTo(timeScale.pxPerMs * factor, anchorX)`. */
zoomBy(factor: number, anchorX?: number): void;
```

The mechanical problem D-F′ has to solve: `scroll.panTo` clamps against `ScrollModel.state.max`, which is resolved from the **last pushed** content size — the one `GanttShell.render()` pushes *after* computing a frame. Writing `scale.zoom` and immediately calling `scroll.panTo(newX)` would clamp against the *old* `contentWidth`, one render stale, and could reject or mis-clamp the very position the zoom is trying to reach.

The fix does not wait for a render. `scale.contentWidth` is a pure function of `range` and `pxPerMs` (`scale.ts:98`) — no layout pass needed to know it changed. `Viewport` keeps the `ScrollBindingHandle` it already creates in `bind()` (today a `bind()`-local closure; this step promotes it to a private field, `#scrollHandle`) and pushes the new content width itself, synchronously, between the scale write and the pan:

```
zoomTo(pxPerMs, anchorX = this.#paneSize.width / 2):
  anchorInstant = this.timeScale.instantForX(this.scroll.state.position.x + anchorX)   // read, before any write
  this.batch(() => {
    this.scale.zoom = { pxPerMs }                                    // this.timeScale is now the new scale
    this.#scrollHandle.setContentSize({ width: this.timeScale.contentWidth, height: this.#contentSize.height })
    this.scroll.panTo({ x: this.timeScale.xForInstant(anchorInstant) - anchorX })
  })
```

`GanttShell.render()` still runs at the end of the same batch (one notification) and pushes the identical content width again — `BoundValue`'s equals check (D-S1.5-4) makes that second push a no-op, not a second notification. `zoomBy` reads `this.timeScale.pxPerMs` before delegating, which is why `TimeScale` gains that one field (§3.1) — every other quantity needed already existed.

This closes `fix-issue1-apis.md` Spec c1 (D-F itself) and confirms fix-order #1 is stale (Q11): the batching primitive it worried about already shipped at S1.7.

*Rejected:* recomputing `max` by calling `render()` mid-`zoomTo`. `render()` does a full layout pass (row culling, bar geometry) to get one number (`contentWidth`) this step already has for free from the scale alone — and calling it from inside `Viewport`, a `layout/`-only class with no reference to `GanttShell`, isn't reachable in the first place.

### D-S1.9-6 — `reveal(entryId)` moves the minimum distance on both axes, and needs no new geometry seam

```ts
// Gantt / GanttShell
reveal(entryId: EntryId): void;

// Viewport — the mechanism; view/ only
reveal(target: Rect): void;
```

`GanttShell.reveal` finds the entry's row index (`dataset.entries.findIndex`), asks `FrameLayout` for that row's `top` — a new one-line method, `rowTop(index)`, delegating to the height index it already keeps alive across renders (`frame-layout.ts`) — and asks `this.#viewport.timeScale` for the bar's `x`/`width` the same way `computeFrame` already does. It hands the resulting `Rect` to `Viewport.reveal`.

`Viewport.reveal` is "nearest edge," not "center": if `target` is already inside `visible`, nothing moves. If it's off one edge, `panTo` moves exactly enough to align that edge — never more, never a smooth animation, never a re-center. This is the same policy `scrollIntoView({block: 'nearest'})` uses and needs no new decision about *how far* is enough; "enough" is "the edge touches."

Unknown `entryId` throws `EntryNotFoundError` (`code: 'entry-not-found'`) rather than silently no-op-ing — `plans/02` §7's "typed and actionable, never bare strings" applies here the same as it did to `HostNotFoundError` at S1.8.

*Rejected:* centering the revealed bar. Centering is a legitimate future option (`gantt.reveal(id, {align: 'center'})`) but adds a second policy this step has no caller asking for; nearest-edge is what "bring into view" means with nothing else stated, and it is strictly less surprising — a bar already visible never jumps.

### D-S1.9-7 — `gantt.overscan` joins the live keys; it carries no bus event

`Viewport.overscan` has been a live setter since S1.7 (`viewport.ts:127-134`, "notifies iff the resolved overscan actually changed"). This step gives it a public route: `Gantt.overscan` get/set, delegating straight through `GanttShell` to `Viewport`.

No `beforeOverscanChange`/`overscanChange` pair. `plans/02`'s cancelable-event rule is stated for *mutating interactions* — gestures a user performs that a host may want to veto (`beforeEntryMove`, and `gridWidth` at S1.8 because a splitter drag is exactly that). Setting `gantt.overscan = x` is a plain reconfiguration, the same shape as `gantt.preset =` in `plans/02` §2's own example, which the "Reconfiguration is just assignment" section documents with no event at all. `preset`, `range`, `zoom` get the same answer, for the same reason.

### D-S1.9-8 — `setPreset(ref, { zoom: 'follow' | 'keep' })` is cut

The issue comment's re-fit policy on preset switch is scope creep the review flagged (`fix-issue1-apis.md` (b), and Q7 above): it names `zoom` twice and answers a question — "should a preset switch keep the anchor or refit to the pane?" — nobody has asked for yet. A preset switch is `gantt.preset = x`; nothing more.

### D-S1.9-9 — Construction-time `preset`/`range`/`zoom`/`overscan` build the private default only

`GanttOptions` gains `preset?`, `range?`, `zoom?`, `overscan?` — exactly what `plans/02` §2's own example already shows (`preset: 'weekAndMonth'`, `range: 'fitDataset'`, no `scale` in sight). They are forwarded into a privately-constructed `TimeScaleModel`/`Viewport` when `options.scale` is omitted.

`overscan` has no ambiguity — `Viewport` is never shared (D-S1.7-10's "single-subscriber, on purpose"), so it always applies to whichever `Viewport` this Gantt privately owns. `preset`/`range`/`zoom` do: if a caller supplies **both** `scale` and any of these, the shared model already carries its own intent and the constructor keys would be a second, silently-losing write path (`plans/02` §1.1). `GanttShell` skips constructing intent from them in that case and issues one dev-mode warning (`plans/02` §7's existing "config set on destroyed instance"-style warning list gains a line) — the shared `scale` always wins, never a merge.

### D-S1.9-10 — The shipped default stays `zoom: 'fitViewport'`; S1.11 is what turns horizontal windowing on

`range: 'fitDataset'` + `zoom: 'fitViewport'` (the default after this step, same values as today's only behavior) still makes `contentWidth ≡ paneWidth`, so `max.x ≡ 0` out of the box. `fix-issue1-apis.md` Spec c2 flags this as making S1.7's horizontal culling dead code *by default* — true, and deliberate: this step's job is to make `zoom: 'preset'` **possible**, not to change what a Gantt does when nobody asks for it. `plans/temp_todo_for_s1-close.md` §5 already assigns "the 5,000-entry harness page, at `zoom: 'preset'`" to **S1.11**, which is the first page anyone will actually look at with content wider than its pane. Recorded here so the finding isn't silently dropped between the two steps — carried forward in §9.

---

## 3. API

### 3.1 `src/time/presets.ts` — new file; `src/time/scale.ts` loses six exports, gains one field

`scale.ts` keeps `createTimeScale`, `TimeScale`, `TimeScaleOptions`, `TickStep`, `Tick`, `ViewPreset`, `ViewPresetHeader`, `HeaderFormat`, `pxPerMsForPreset` — the engine and the shape of a preset, not any particular preset. `hourPreset` … `yearPreset`, `freezePreset`, and the four format helpers (`pad2`, `plainDateFormat`, `hourFormat`, `monthFormat`, `yearFormat`) move to `presets.ts`, which also adds the three multi-band presets and the resolution layer from D-S1.9-3.

```ts
// scale.ts — one field added
export interface TimeScale {
  readonly range: TimeSpan;
  readonly timeZone: string;
  /** Density: content px per ms, constant across the whole range at this zoom. What `Viewport.zoomBy`
   *  reads before scaling it (D-S1.9-5) — every other quantity `zoomTo`/`zoomBy` need already existed. */
  readonly pxPerMs: number;
  xForInstant(i: Instant): number;
  instantForX(x: number): Instant;
  widthForDuration(d: Duration, at: Instant): number;
  ticks(step: TickStep, span: PixelSpan): readonly Tick[];
  readonly contentWidth: number;
}
```

```ts
// presets.ts
export type ShippedPresetId =
  | 'hour' | 'day' | 'week' | 'month' | 'year'
  | 'dayAndWeek' | 'weekAndMonth' | 'monthAndYear';

export const presets: Readonly<Record<ShippedPresetId, ViewPreset>>;
export type PresetRef = ShippedPresetId | ViewPreset;
export function resolvePreset(ref: PresetRef): ViewPreset;   // throws UnknownPresetError

export const dayAndWeekPreset: ViewPreset;      // headers: [week, day];  tickUnit: 'd'
export const weekAndMonthPreset: ViewPreset;    // headers: [month, week]; tickUnit: 'w'
export const monthAndYearPreset: ViewPreset;    // headers: [year, month]; tickUnit: 'M'
```

Soft cap ~150 lines (R1) — the file is mostly data.

### 3.2 `src/model/errors.ts` — two more subclasses

```ts
/** `code: 'unknown-preset'` — a `PresetRef` string outside the shipped set, from `resolvePreset`. */
export class UnknownPresetError extends FreeGanttError { constructor(id: string); }

/** `code: 'entry-not-found'` — `reveal(entryId)` given an id the bound Dataset has no entry for. */
export class EntryNotFoundError extends FreeGanttError { constructor(entryId: EntryId); }
```

### 3.3 `src/layout/viewport/time-scale-model.ts` — `preset`/`range`/`zoom` become live setters

```ts
export interface TimeScaleIntent {
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  zoom?: TimeScaleZoom;
}

export class TimeScaleModel {
  constructor(intent?: TimeScaleIntent);
  get preset(): ViewPreset;
  set preset(ref: PresetRef);          // resolvePreset(ref); no-op + no invalidate if unchanged
  get range(): 'fitDataset' | TimeSpan;
  set range(r: 'fitDataset' | TimeSpan);
  get zoom(): TimeScaleZoom;
  set zoom(z: TimeScaleZoom);
  get scale(): TimeScale;
  bind(binding: ScaleBinding, onChange: () => void): ScaleBindingHandle;   // unchanged
  batch(run: () => void): void;                                            // unchanged
}
```

`#resolve` gains one branch, replacing its single hardcoded fit-to-width formula (`time-scale-model.ts:159-160`) with a three-way `#resolvePxPerMs(zone, range, width, spanMs)` keyed on `this.#zoom` — `'fitViewport'` is that exact formula, unchanged (D-S1.9-2).

### 3.4 `src/layout/viewport/viewport.ts` — `zoomTo`, `zoomBy`, `reveal`; one new private field

```ts
export class Viewport {
  // ...unchanged surface...
  zoomTo(pxPerMs: number, anchorX?: number): void;
  zoomBy(factor: number, anchorX?: number): void;
  reveal(target: Rect): void;
}
```

`#scrollHandle: ScrollBindingHandle | undefined` — assigned in `bind()` alongside the existing `scrollHandle` local (the local becomes the field; nothing else in `bind()` changes). `zoomTo`/`zoomBy` per D-S1.9-5; `reveal` per D-S1.9-6 (`view/`-only — not exported from `api/`, matching `Viewport` itself, D-S1.7-10).

### 3.5 `src/layout/frame-layout.ts` — one accessor

```ts
export class FrameLayout {
  computeFrame(input: LayoutInput): GeometryFrame;   // unchanged
  /** The row-height index's own `topAt`, exposed so `reveal` can ask for a row's position without a
   *  full layout pass. Available once `computeFrame` has run at least once — true for any Gantt that
   *  has completed construction, which is the only caller. */
  rowTop(index: number): number;
}
```

### 3.6 `src/view/gantt-shell.ts` / `src/api/gantt.ts` — the public surface

```ts
// GanttShell — delegates straight to #viewport; Gantt delegates straight to #shell
get preset(): ViewPreset;      set preset(ref: PresetRef);
get range(): 'fitDataset' | TimeSpan;  set range(r: 'fitDataset' | TimeSpan);
get zoom(): TimeScaleZoom;     set zoom(z: TimeScaleZoom);
get overscan(): Overscan;      set overscan(o: Overscan);
zoomTo(pxPerMs: number, anchorX?: number): void;
zoomBy(factor: number, anchorX?: number): void;
reveal(entryId: EntryId): void;
```

```ts
// GanttOptions gains, per D-S1.9-9 — private-default construction only:
preset?: PresetRef;
range?: 'fitDataset' | TimeSpan;
zoom?: TimeScaleZoom;
overscan?: Overscan;
```

Call sites, read aloud: `gantt.zoomBy(1.5, pointerX)` — "zoom the Gantt by one and a half, anchored at the pointer's x". `gantt.reveal('t42')` — "reveal entry t42". `gantt.overscan = { horizontalPx: 256 }` — "set the Gantt's overscan".

### 3.7 Names changed from the issue comment

| Issue comment | This spec | Reason |
|---|---|---|
| `presets: Record<string, ViewPreset>` | `presets: Readonly<Record<ShippedPresetId, ViewPreset>>` | Design #11 — a closed union autocompletes; a bare `string` doesn't |
| `TimeScaleModel.zoomTo({pxPerMs, anchorInstant, anchorX})` | `Viewport.zoomTo(pxPerMs, anchorX?)` | D-F′ — relocated (needs `scroll`); `anchorInstant` is derived, never supplied (Q10) |
| `setPreset(ref, {zoom: 'follow'\|'keep'})` | *(cut)* — `gantt.preset = ref` | scope creep (D-S1.9-8); also the `zoom` collision (Q7) |
| "Throws `UnknownPresetError`" (undeclared as a `FreeGanttError` subclass) | `UnknownPresetError extends FreeGanttError` | Standards — typed and actionable (D-S1.9-3) |
| `gantt.scale` / `gantt.scroll` public getters alongside `preset`/`range`/`zoom` | *(cut)* — no `Gantt.scale`/`Gantt.scroll` | Middle Man / two write paths (Q5, reconfirmed) |

---

## 4. Public surface

`api/index.ts` gains: `Gantt.preset`/`.range`/`.zoom`/`.overscan` (get/set), `Gantt.zoomTo`/`.zoomBy`/`.reveal`, `GanttOptions.preset`/`.range`/`.zoom`/`.overscan`, `TimeScaleZoom`, `PresetRef`, `ShippedPresetId`, `presets`, `resolvePreset`, `dayAndWeekPreset`/`weekAndMonthPreset`/`monthAndYearPreset`, `UnknownPresetError`, `EntryNotFoundError`, and `Overscan` (already public from `layout/`'s barrel, not yet re-exported from `api/`).

**Declared gaps, now closed:** `gantt.reveal(entryId)` and `gantt.overscan` — both open since S1.7 §9 — ship in full.

**Unchanged:** `gantt.scale =` / `gantt.scroll =` stay cut. `Gantt` still never re-exposes its bound models; a caller who wants to share one constructs it and passes it to two `Gantt`s (`plans/02` §5).

---

## 5. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| A `zoomBy` chain drifts the anchor by more than rounding | `instantForX`/`xForInstant` round the same way every call (`scale.ts:71-75`); the fast-check property test (§6) is the automatic check, not a manual one. |
| `zoomTo` called before the first `render()` (pane width `0`) | `anchorX` defaults to `#paneSize.width / 2 === 0`; `xForInstant(anchorInstant) - 0` still resolves to a defined number. Degenerate, not broken. |
| Two Gantts share a `scale`; one calls `zoomBy` and the other's screen jumps unexpectedly | Documented, not prevented (`plans/02` §5) — sharing a scale always meant this; U7 makes it visible for the first time. |
| A caller passes `scale` **and** `preset` to `new Gantt(...)`, expecting both to apply | The shared `scale`'s own intent wins; the constructor keys are ignored with a dev-mode warning (D-S1.9-9) — never silently merged. |
| `reveal(entryId)` called with an id that was just removed | `EntryNotFoundError`, not a silent no-op (D-S1.9-6). |
| A custom `ViewPreset` sets `tickUnit` coarser than its finest header | Not enforced by a runtime check (data, not a validator) — documented in the doc comment (D-S1.9-3) as a rule an author must keep, the same trust `snap` and `tickWidthPx` already require. |
| Someone reads `TimeScale.pxPerMs` expecting it to vary across the range | It's a Cartesian scale — constant by construction (`createTimeScale`'s single `pxPerMs` closure var). A non-linear scale is a different `TimeScale` implementation entirely (`plans/00` §5, deferred), not a per-point read here. |

---

## 6. Tests

`pure` (Node, no DOM) except where noted.

- **`time/presets.test.ts`** — the eight shipped ids resolve through `resolvePreset`; an unknown string throws `UnknownPresetError` with `code: 'unknown-preset'`; a `ViewPreset` object passes through unchanged (identity-preserving); each multi-band preset's `tickUnit` is no coarser than its last header's `unit`.
- **`time/zone.test.ts` (extended)** — `[S1-A5]`: `startOf`/`stepBy` for `'M'` and `'w'` across a DST transition in a zone that observes it, proving the two-band presets' header stepping is DST-correct, not just their existing single-band counterparts.
- **`layout/viewport/time-scale-model.test.ts` (extended)** — the existing suite passes unmodified (D-S1.9-2's "free at the default" proof); `zoom: 'preset'` ignores a measured pane width; `zoom: {pxPerMs}` is read back exactly; `preset =`, `range =`, `zoom =` each notify iff the resolved scale changed (D-S1.5-4), and each is a no-op notification when set to its current value.
- **`layout/viewport/viewport.test.ts` (extended)** — `zoomTo`/`zoomBy` deliver exactly one notification (`[S1-A3]`); a fast-check property test: random `zoomBy` sequences keep the anchored instant within 0.5px of `anchorX`; `zoomBy(2)` then `zoomBy(0.5)` returns `pxPerMs` and `scroll.x` to their starting values; `reveal` is a no-op when `target` is already inside `visible`, and moves exactly to the near edge otherwise, on one axis or both.
- **`layout/frame-layout.test.ts` (extended)** — `rowTop(index)` matches `topAt(index)` on the same index the height index would report from a `computeFrame` call with the same entries.
- **`api/gantt.test.ts` (`dom`)** — `[S1-A3]`: a bar's DOM node identity (`item.id`) is unchanged across `gantt.preset = weekAndMonthPreset` (I8); `gantt.reveal(id)` moves `scrollLeft`/`scrollTop` on the live element to the expected value for an off-screen entry; an unknown id throws `EntryNotFoundError`; `scale`/`scroll` sharing plus `zoomBy` on one Gantt is observed on the other's live DOM.
- **e2e (`e2e/zoom.spec.ts`, new)** — a wheel-zoom-equivalent `zoomBy` call against the live harness keeps the pointer's instant visually fixed; a preset switch redraws the header bands with no flash/remount (no new element created for an existing bar).

---

## 7. Spec edits implied — landed **with** this step

- Issue #1 §2 — strike D-F; record D-F′ verbatim from D-S1.9-1 (manual edit to the GitHub comment; not a repo file).
- `plans/01` §5.1 — the `TimeScale` code block is corrected to the shipped `ticks(step: TickStep, span: PixelSpan)` shape (stale since S1.7; carried as unrelated drift, fixed while this section is open anyway) and gains `pxPerMs`.
- `plans/01` §8.2 — a paragraph on `Viewport.zoomTo`/`zoomBy`/`reveal` and D-F′, beside the existing `Viewport` paragraph.
- `plans/02` §7 — "unknown preset id" moves from the dev-mode-warning list to "Errors are typed and actionable": `UnknownPresetError`. The warning list gains the D-S1.9-9 case (`scale` + constructor `preset`/`range`/`zoom` together).
- `plans/s1.7-windowed-frame/README.md` §9 and `plans/s1.8-pane-layout/README.md` §9 — both carried-item rows (`reveal`, `overscan`) are ticked as landed here.
- `CONTEXT.md` — new entries: **Range** (the content span `TimeScaleIntent.range` states — distinct from Zoom), **Zoom** (the density mode — distinct from Range; this is D-F′ in glossary form), **Anchored zoom** (`zoomTo`/`zoomBy`'s read-before-write contract), **Preset reference** (`PresetRef`). Edited: **ViewPreset** (now explicitly "one or more header bands"), **Reveal** (marks the x half as landed, was previously described as intent only).
- `plans/temp_todo_for_s1-close.md` §5 — this step's phase list is superseded by this document; no further edit to that file (it is deleted at S1.11 per its own §7).

---

## 8. TODO

Guardrails and glossary first, then engine, then the seam, then the public edge.

### Types and errors
- [x] `UnknownPresetError`, `EntryNotFoundError` in `src/model/errors.ts`; re-export from `src/model/index.ts` and `src/api/index.ts`

### `time/`
- [x] `src/time/presets.ts` per §3.1 — five presets moved unchanged, three new, `ShippedPresetId`, `presets`, `PresetRef`, `resolvePreset`
- [x] `src/time/scale.ts` — `pxPerMs` added to `TimeScale`; the six moved exports deleted; `src/time/index.ts` barrel updated
- [x] Confirm `startOf`/`stepBy` DST correctness for `'M'`/`'w'` with a test per §6 (code likely already correct — `zone.ts`'s `UNITS` table; this is a test gap, not an implementation gap)

### `layout/viewport/`
- [x] `TimeScaleIntent.zoom`, `TimeScaleZoom`; live `preset`/`range`/`zoom` setters on `TimeScaleModel`; `#resolvePxPerMs` per D-S1.9-2
- [x] `Viewport.#scrollHandle` field; `zoomTo`, `zoomBy`, `reveal` per D-S1.9-5/6

### `layout/`
- [x] `FrameLayout.rowTop(index)` per §3.5

### `view/` and `api/`
- [x] `GanttShell` — `preset`/`range`/`zoom`/`overscan` accessors, `zoomTo`/`zoomBy`/`reveal`; D-S1.9-9's dev-mode warning when `scale` and any of `preset`/`range`/`zoom` are both supplied
- [x] `Gantt` — same surface, delegating; `GanttOptions` gains the four keys

### Harness
- [ ] Review `harness/main.ts` and `harness/scroll-sync.ts` against CLAUDE.md's harness rule now that `preset`/`zoom`/`reveal` exist; record any gap against S1.9 and fix it in `src/`

### Review and docs
- [ ] The §7 spec edits, landed with this step
- [ ] `pnpm verify` green; `pnpm test:e2e` green

### Acceptance
- [ ] **U1–U3** — preset switch and anchored zoom (`viewport.test.ts`, `gantt.test.ts`, `e2e/zoom.spec.ts`)
- [ ] **U4** — `reveal` nearest-edge on both axes (`viewport.test.ts`, `gantt.test.ts`)
- [ ] **U5** — `overscan` live (`api/gantt.test.ts`, extending the existing S1.7 overscan coverage to the public key)
- [ ] **U6** — `UnknownPresetError` with code `unknown-preset` (`time/presets.test.ts`)
- [ ] **U7** — shared-scale `zoomBy` observed on both Gantts (`api/gantt.test.ts`)
- [ ] **`[S1-A3]`** — one notification per zoom; bar DOM identity stable across a preset switch (`viewport.test.ts`, `api/gantt.test.ts`)
- [ ] **`[S1-A5]`** — DST-correct axis headers, two-band presets included (`time/zone.test.ts`)

### Review, Verify, and Fix Issues from 1.8 Review
Confirm these findings before fixing them.
- [ ] plans/2026-08-25-s1.8-review.md
---

## 9. Deferred, with the caller that will bring it back

| Deferred | Returns at | Needs |
|---|---|---|
| `zoom: 'preset'` as anything other than an opt-in — the shipped default keeps `max.x ≡ 0` | S1.11 | the 5,000-entry harness page, the first page anyone looks at with content wider than its pane (D-S1.9-10) |
| `reveal(id, { align: 'center' })` or any second reveal policy | when a caller asks | nearest-edge is what ships; a second policy is additive, not a breaking change (D-S1.9-6) |
| Async veto on a future wheel-zoom / pinch-zoom gesture's `before*` event | S4 | the gesture controllers `plans/02` §3 describes — `zoomTo`/`zoomBy` are imperative calls today, not gestures, so nothing here is vetoable yet |
| A snap-to-tick gesture actually reading `ViewPreset.snap` | S4 | the drag/resize controllers; `snap` has been declared on `ViewPreset` since S1.7 and nothing reads it yet |
| Theming needing to know how many header bands a preset draws | S1.10 | two-band presets landing here, so S1.10 doesn't have to guess (`plans/temp_todo_for_s1-close.md` §3) |
