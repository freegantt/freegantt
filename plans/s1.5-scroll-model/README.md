# S1.5 — `ScrollModel` + `view/scroll-attachment.ts`

**Slice:** S1 (`plans/03` §S1) · **Step:** S1.5 · **Issue:** #1, tracked in #9 · **Baseline:** `main` @ `0732a4e`
**Governed by:** [S1 API conventions](https://github.com/Pawel-IT/FreeGantt/issues/1#issuecomment-5400465734) — names, geometry types, typed errors, `batch()`, D-F′.

This directory is the settled spec for S1.5. It supersedes the S1.5b issue comment where the two disagree; §2 records every decision that moved and why.

---

## 1. User stories

Written for the person using a Gantt, not the person building one. Each maps to an acceptance check in §9.

- **U1.** I scroll a long plan down and the row labels on the left stay lined up with their bars. They never lag or drift, even mid-flick.
- **U2.** I have two charts stacked on the same timeline — deliveries on top, crew load below. I drag one sideways and the other moves with it, exactly, so the dates always line up.
- **U3.** One of my two charts has far more rows than the other. Scrolling down, the short one reaches its last row and stops there while the tall one keeps going. Scrolling back up, the short one picks up right where it stopped.
- **U4.** I filter down to a handful of rows, look at them, then clear the filter — and I'm back where I was, not thrown to the top.
- **U5.** I use a plan where some rows are taller than others. Jumping to a specific entry lands on it correctly; nothing is off by a few rows.
- **U6.** (developer) I never calculate a pixel. I say which entry I want to see, or I pass the chart a shared scroll object and sharing just works.

---

## 2. Decisions

Settled in review. Each states the alternative it beat, so a future reader doesn't reopen it for free.

### D-S1.5-1 — One shared position; each chart clamps locally

The model owns **one** position. Each bound chart renders `min(position, its own max)`.

Two charts share a model, chart A can scroll to 5000, chart B to 1000. Position runs to 4000: A sits at 4000, B is pinned at its last row. Coming back, B stays pinned until the shared position drops under 1000, then tracks again — **"picks up where it stopped" with zero remembered state** (U3).

Two clamps, two owners, and both are cheap:

- **Shared clamp** — `ScrollState.max` = `max` over measured bindings of `max(0, content − pane)`: the *loosest* bound, so `panTo` can never park the shared value somewhere no chart can reach.
- **Local clamp** — free in a browser: writing `element.scrollTop = 4000` where the content allows 1000 yields 1000. No code.

*Rejected:* `min` over bindings (the shipped `TimeScaleModel.#resolve()` rule). It transfers to x — where every binding shares the `TimeScaleModel` and so reports an identical `content.width`, making `min` a no-op — and breaks on y, where a 10-row chart would hand a 5,000-row chart a `max.y` of 0 and veto its entire scroll range.

### D-S1.5-2 — Position is what was asked for; a shrinking `max` never rewrites it

`panTo` clamps to `[0, max]` **at write time**. A later change in `max` does not touch `position`.

Filter 5,000 rows down to 10 and `max` collapses; `position` stays where it was and every chart clamps locally to show its end. Clear the filter and everyone is back where they were — **place preserved with no remembered state** (U4).

The cost is honest and small: `state.position` can read beyond `state.max`. That is not a bug, it is the meaning of the two fields — `position` is *where the user asked to be*, `max` is *how far a `panTo` may ask*. Both doc comments say so.

*Rejected:* clamping `position` on every resolve. Keeps the types tidier at the cost of losing the user's place on any filter, sort, or collapse.

### D-S1.5-3 — Sharing shares both axes; no axis views in S1

`xOnly()`, `yOnly()`, `ScrollSource` and `ScrollAxis` are **not built**. `GanttOptions.scroll` takes a `ScrollModel` and sharing it links both axes.

The **designed and tested** case is charts on a shared `TimeScaleModel`, where `contentWidth` is identical for every binding by construction — so on x there is no aggregation question, no local clamp, no pinning, and no disagreement between scrollbars. This matches the whole ecosystem: every surveyed library that links two components links the **domain (x) axis** — AG Grid's `alignedGrids` is horizontal-only and offers no vertical equivalent; ECharts `connect`, uPlot's `sync(key)`, and charting-platform "sync charts" features all share the time/x range.

Sharing between charts with **different row counts** links y as well and behaves exactly as D-S1.5-1 describes. That is **defined fallback behaviour, documented and tested for correctness — not a configuration and not a case the design optimises for.**

*Rejected:* shipping `xOnly()`/`yOnly()` as specified. They have no caller in S1, and the filtered-view abstraction costs an `axes` array, axis-tagged notification, and a `ScrollSource` interface whose `xOnly()` returns something that can be `yOnly()`'d into an object with no axes. Same reasoning that cut `panBy`: it comes back when a caller needs it.

*Also rejected:* strict x-only sharing with per-Gantt private y. Simpler in prose, more implementation — x in the model and y per-binding is two lifetimes in one object.

### D-S1.5-4 — One notification contract for both viewport models

> **`bind` always notifies the newcomer. Every other notification fires iff the model's resolved value changed.**

`TimeScaleModel` adopts this in the same step. Without the first half, a second Gantt binding with identical content notifies nobody and never gets its first render — the one job `time-scale-model.ts:70-72` documents bind-notification as existing for. Without the second half there is no loop-breaker for render → measure → render.

`TimeScaleModel` also gains by it: today every `ResizeObserver` tick re-renders every bound Gantt even when the narrowest measured pane has not moved.

- `ScrollModel` resolved value: `{position.x, position.y, max.x, max.y}`.
- `TimeScaleModel` resolved value: `{timeZone, range.start, range.end, pxPerMs}`.
- `unbind()` never notifies the departing binding; it notifies the rest iff the value changed.

*Rejected:* two contracts at one seam, which is exactly what conventions §4 exists to prevent.

### D-S1.5-5 — `panTo`, and the reason is the concept, not the lint rule

`panTo` is correct on its own terms: **pan** = move the viewport, **scroll** = an element's native offset. The clean I12 grep is a consequence, not the justification — the S1.5b comment argued it backwards and that paragraph is rewritten.

`interactions.pan` in S4 calling `scroll.panBy` is **one concept at two layers**, the same shape as the move gesture calling into a `data/` transaction. It is not the `resize` failure, which named three unrelated things.

*Rejected:* `moveTo` — collides head-on with `beforeEntryMove`/`entryMove`; "move" is spent on dragging an entry. *Rejected:* `scrollTo` — would need a type-aware rewrite of `no-scroll-outside-scroll-model.cjs`, and leaves "scroll" naming two things.

### D-S1.5-6 — The no-feedback-loop rule compares against the **local** value

**Superseded at S1.7** (`plans/s1.7-windowed-frame/README.md` §3.5, D-S1.7-2): `myMax`/`mine` below moved out of the attachment. `Viewport.visible` now resolves the same locally-clamped value from `Viewport`'s own pushed `{content, pane}` extents, and `view/scroll-attachment.ts` only reads `viewport.visible` — it derives nothing itself. The epsilon comparison and its two jobs (fractional `scrollTop`, redundant-write filtering) are unchanged.

The S1.5b invariant — write to the element only when `|element.scrollTop − state.position.y| >= 1` — **is broken by D-S1.5-1, and not in an edge case.** On the pinned chart: model holds 4000, attachment writes 4000, the element clamps to 1000, fires `scroll` with 1000, the attachment sees 1000 ≠ 4000, calls `panTo(1000)`, and the shared position is destroyed. Every frame.

The fix stays stateless — compare against **what this element should be showing**:

```ts
const mine = {
  x: Math.min(state.position.x, myMax.x),
  y: Math.min(state.position.y, myMax.y),
};
// model → element: write an axis iff |element.scrollLeft/Top − mine[axis]| >= 1
// element → model: panTo   iff |element.scrollLeft/Top − mine[axis]| >= 1
```

`myMax` is derived from the attachment's own `setContent`/`setPane` values, so it needs no new input. Model 4000 / `myMax` 1000 / element 1000 → `mine` is 1000 → recognised as an echo, ignored. User scrolls that chart up to 800 → 800 ≠ 1000 → `panTo(800)`, both charts move.

Still no `#applying` flag, no "ignore the next event", no rAF debounce.

### D-S1.5-7 — Render first, then write the element

The attachment's reaction runs `onChange()` **before** pushing the element. The host render sizes the content layer; only then is a position write meaningful. Reversed, every model-driven write lands in an element whose content layer is still the old size, the browser clamps it, and D-S1.5-6 has to absorb a clamp that should never have happened.

### D-S1.5-8 — `Point` joins `model/geometry.ts`

Conventions §2 put geometry primitives in one home; `ScrollPosition {x, y}` is a `Point`, the one primitive that home omits. Adding it keeps the rule true at its first use and gives `interaction/` its pointer type for free.

`max` keeps the `ScrollPosition` type with a doc comment. A second structurally identical alias for the bound would be ceremony.

### D-S1.5-9 — Nothing measured is ever the host's job

Every number the model needs is measured by the library and pushed automatically. `setContent`, `setPane` and `bind` are **not in the public surface** (§5). The host's entire scroll vocabulary is `new ScrollModel({ position })`, `gantt.reveal(entryId)`, and `scroll.state.position`.

---

## 3. API

### 3.1 `src/model/geometry.ts` — types only, zero deps

```ts
export interface Point     { readonly x: number; readonly y: number }
export interface Size      { readonly width: number; readonly height: number }
export interface PixelSpan { readonly x: number; readonly width: number }
export interface Rect extends PixelSpan { readonly y: number; readonly height: number }
```

`model/` rather than `layout/`: `time/` may not import `layout/`, and `render/` may import only `layout/`. `model/` is the one module every layer already reaches, so this adds no dependency edge.

### 3.2 `src/layout/viewport/scroll-model.ts` — pure, DOM-free

```ts
import type { Point, Size } from '../../model/index.js';

/** A scroll offset in content pixels. */
export interface ScrollPosition extends Point {}

/** What a caller states up front. Extents are measured, never stated (mirrors `TimeScaleIntent`). */
export interface ScrollIntent {
  /** Starting position. Default `{ x: 0, y: 0 }`. */
  position?: Partial<ScrollPosition>;
}

/** One Gantt's contribution to resolution, supplied when it binds — what it can scroll over.
 *  Measured by `view/`; a `0` in either box means "unmeasured", exactly as in `ScaleBinding`.
 *  `readonly`, and the model copies it at bind time: the handle is the only way to change it. */
export interface ScrollBinding {
  /** Full content extent in px — `frame.contentWidth` / `frame.contentHeight`. */
  readonly content: Size;
  /** Measured drawable box of the timeline pane. */
  readonly pane: Size;
}

/** @internal — `view/` only. Never re-exported from `api/`.
 *  Superseded at S1.7 (`plans/s1.7-windowed-frame/README.md` §3.8 A): `setContent`/`setPane`
 *  are `setContentSize`/`setPaneSize` in the shipped code — the fields stay `content`/`pane`. */
export interface ScrollBindingHandle {
  unbind(): void;
  setContent(size: Size): void;
  setPane(size: Size): void;
}

/** The resolved state — both halves of it, so there is one path to the resolution and one thing
 *  to notify about.
 *  Refined by the 2026-08-25 review: both halves are handed out by reference and are now frozen at
 *  their assignment points, so `readonly` is enforced at runtime too — a host writing
 *  `state.position.x` throws instead of moving the shared position with nobody notified. */
export interface ScrollState {
  /** Where the caller asked to be. May exceed `max` after a shrink — see D-S1.5-2. */
  readonly position: ScrollPosition;
  /** How far a `panTo` may ask: the loosest bound any bound Gantt needs (D-S1.5-1).
   *  Not a claim about any one chart's scroller — each clamps its own. */
  readonly max: ScrollPosition;
}

export class ScrollModel {
  constructor(intent?: ScrollIntent);

  /** Resolved + clamped, memoized like `TimeScaleModel.scale`. */
  get state(): ScrollState;

  /** Move the shared viewport. Clamps to `[0, max]` at write time. */
  panTo(to: Partial<ScrollPosition>): void;

  /** Several writes, at most one notification. Re-entrant; flushes at the outermost exit,
   *  in a `finally` so a throwing `run` cannot wedge the model (conventions §5). */
  batch(run: () => void): void;

  /** @internal — called by `view/` only. A host that calls this creates a binding nothing
   *  will ever unbind. Use `GanttOptions.scroll` instead. */
  bind(binding: ScrollBinding, onChange: () => void): ScrollBindingHandle;
}
```

**Resolution rules**

- `max[axis]` = **`max`** over measured bindings of `max(0, content − pane)`; unmeasured bindings skipped; no bindings → `{ x: 0, y: 0 }`.
- `panTo` clamps to `[0, max]`. Nothing else ever rewrites `position` (D-S1.5-2).
- Notify per D-S1.5-4. It terminates: `render → setContent(same numbers) → nothing changed → nobody notified`. A render that genuinely grows the content notifies once; the re-render pushes an unchanged extent and stops. Bounded at one extra pass by construction, not by a re-entrancy flag.
- **Who owns the native scrollable extent:** the *backend*, by sizing the timeline pane's content layer from `frame.contentWidth`/`contentHeight` — that is what makes new rows reachable in a browser. The model's `max` is the clamp for `panTo`. Two mechanisms, two owners.
- No module-level state; two models on one page are independent (I2).

### 3.3 `src/view/scroll-attachment.ts` — the only file that touches element scroll (I12)

**Superseded at S1.7** (`plans/s1.7-windowed-frame/README.md` §3.6): the shipped `attachScroll` takes `(element, viewport)`, not `(element, scroll, onChange)` — `Viewport.bind` now owns the binding, this file only reads `viewport.visible` and writes/reads the element. `ScrollAttachment` no longer has `setContent`/`setPane`; those became `Viewport`'s `setContentSize`/`setPaneSize`. The shape below is the S1.5-era design, kept for the D-S1.5-6/D-S1.5-7 rationale it still explains correctly.

```ts
import type { Size } from '../model/index.js';
import type { ScrollModel } from '../layout/viewport/scroll-model.js';

export interface ScrollAttachment {
  /** Post-render extents (`frame.contentWidth`/`contentHeight`). No-ops when unchanged. */
  setContent(size: Size): void;
  /** Measured pane box — pushed by the pane-size attachment (#8). */
  setPane(size: Size): void;
  detach(): void;
}

/** `element` is the timeline pane: the single native scroller (D-D). The grid pane never scrolls —
 *  it follows by transform, which is why there is no second scroller to fall a frame behind.
 *
 *  Owns the binding: it binds on attach and unbinds on `detach()`, so element, model and reaction
 *  are wired in exactly one place. `onChange` is the host's render — it runs *before* the element
 *  is written (D-S1.5-7).
 *
 *  `setContent`/`setPane` deliberately mirror `ScrollBindingHandle`: callers hold one object, not
 *  two. Do not "simplify" the duplication away. */
export function attachScroll(
  element: HTMLElement,
  scroll: ScrollModel,
  onChange: () => void,
): ScrollAttachment;
```

The `>= 1` epsilon in D-S1.5-6 does two jobs and the code comment must say both: it tolerates the fractional `scrollTop` Chrome and Safari return under fractional device-pixel ratios, and it filters redundant writes.

### 3.4 `TimeScaleModel` — three changes in this step

Same seam, cheaper as one edit than three:

1. **`batch()`** (conventions §5), identical semantics.
2. **Notify-iff-changed** (D-S1.5-4), comparing `{timeZone, range.start, range.end, pxPerMs}`.
3. **`ScaleBinding` becomes `readonly`**, `viewportWidth` → `paneWidth`, `setViewportWidth` → `setPaneWidth`, and the model copies the binding at bind time. Today the handle mutates the caller's object in place (`time-scale-model.ts:78-80`), so a caller holding a reference can change the model's inputs behind its back, bypassing invalidation entirely.

**Superseded — this did not ship at S1.5.** `ScaleBinding` was meant to become `DatasetLike & { readonly paneWidth: number }`, but `DatasetLike` lived in `view/` and `layout/` may not import `view/` (I1) — the sentence asserted an edge the boundary lint forbids. `time-scale-model.ts:28-35` declares all three fields inline instead. Fixed at S1.7 (`plans/s1.7-windowed-frame/README.md` §3.2, §3.8 E), where the type moves to `model/` and is renamed `Dataset` off the naming skill's checks: `ScaleBinding` becomes `Dataset & { readonly paneWidth: number }`.

---

## 4. Why `panTo` is not the host's front door

`panTo` takes pixels. A host wanting "show me the deadline entry" would compute `rowIndex × rowHeight` — **wrong the moment rows vary in height**, which `PrefixSumHeightIndex` (S1.6, shipped) exists to support (U5). The library knows every row's `y`; making the host re-derive it is the `harness/main.ts` smell CLAUDE.md names.

So the intent-level verb is named here. `Viewport` itself is built at **S1.7** (`plans/s1.7-windowed-frame/README.md`), but `reveal` waits one more step, for a pane height that re-measures rather than one read once at construction (S1.7b, #8):

```ts
gantt.reveal(entryId: EntryId, options?: { align?: 'start' | 'center' | 'nearest' }): void;
```

`panTo` ships now as the low-level primitive. Naming `reveal` in this spec is the point: without it, hosts and `harness/main.ts` fill up with `index * 32` that then has to be unpicked.

---

## 5. Public surface

`api/index.ts` re-exports exactly:

| Exported | Not exported |
|---|---|
| `ScrollModel` (class) | `ScrollBinding` |
| `ScrollIntent` | `ScrollBindingHandle` |
| `ScrollPosition`, `ScrollState` | `ScrollAttachment`, `attachScroll` |
| `Point`, `Size` | `PixelSpan`, `Rect` *(until `layout/` needs them public)* |

```ts
export interface GanttOptions {
  host: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9, `plans/02` §5) — omit for a private default. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9). Sharing one instance links both axes — D-S1.5-3. */
  scroll?: ScrollModel;
}
```

**`TimeScaleModel` gets no `TimeScaleSource` interface.** The asymmetry with `scroll` is real and gets one sentence in `plans/02` §5: scroll has separable axes, time has one.

**Declared gap against "every config key is live-reconfigurable" (CLAUDE.md, `plans/02` §1.3):** `gantt.scale = …` and `gantt.scroll = …` setters land at **S1.8**, where the already-built `Viewport` (S1.7) owns the unbind → rebind → re-render sequence in one place. `scale` already has this gap today (`api/gantt.ts:12`); S1.5 does not close it and does not widen it silently. Tracked in §8.

---

## 6. Foot-guns and their automatic answers

| Foot-gun | Answer |
|---|---|
| Host computes `rowIndex × rowHeight` to jump to an entry | `gantt.reveal(entryId)` (§4). `panTo(px)` is the primitive underneath. |
| Host must call `setContent` after every render or rows go silently unreachable | Not public. Pushed by the render cycle inside `view/`. |
| Host must call `setPane` on resize | Not public. Pushed by the pane-size attachment's `ResizeObserver` (#8). |
| Host calls `model.bind()` and leaks a binding nothing unbinds | `@internal`, absent from `plans/02`, and the only call sites in the repo are in `view/`. |
| `batch(run)` throws, hold flag sticks, every later write is silently swallowed | Flush in `finally`. Tested. |
| Two synced native scrollers drift a frame apart | There is only one native scroller (D-D). The grid pane follows by transform. |

---

## 7. Tests

- **pure** (`layout/viewport/scroll-model.test.ts`): clamping on `panTo`; `max` is the loosest bound across bindings; a `max` shrink leaves `position` untouched and restoring the extent restores the place (U4); `bind` always notifies the newcomer; a bind that changes nothing notifies nobody else; `setContent` that grows content notifies once and the follow-up push with the same numbers notifies nobody; `unbind` leaves the others notified; `batch` delivers one notification, no observer sees an intermediate state, and a throwing `run` still flushes and leaves the model usable.
- **pure** (`time-scale-model.test.ts`): `batch`; notify-iff-changed (a `setPaneWidth` that does not move the narrowest pane notifies nobody); mutating a `ScaleBinding` object after `bind()` cannot change the resolution.
- **dom** (`view/scroll-attachment.test.ts`, happy-dom): model change writes element scroll; native `scroll` event updates the model; `onChange` runs before the element write (D-S1.5-7); `detach()` removes the listener and unbinds. *Structural coverage only — see below.*
- **e2e** (`e2e/scroll-sync.spec.ts`, Playwright): the two cases happy-dom cannot express, because there `scrollTop` is a plain property that neither clamps nor fires an event — so the "a model-driven write does not produce a second model update" check passes **vacuously**. In a real engine: (1) the echo case — a model-driven write does not feed back; (2) the clamped case — two charts with different content heights, the short one pins and the shared position survives (U3).
- **lint**: retarget the exemption in `no-scroll-outside-scroll-model.cjs:26` from `view/scroll-model` → `view/scroll-attachment`; fix the stale path in its header comment (line 2); update `no-scroll-outside-scroll-model.test.cjs`; confirm the red fixture still fails. Strictly stronger than what ships today — the pure model needs no exemption at all.

---

## 8. Spec edits implied

- `plans/01` §1.1 + `CLAUDE.md` — `model/geometry.ts` named as the home of `Point`/`Size`/`PixelSpan`/`Rect`.
- `plans/01` §8.2 — `ScrollModel` follows the same bind/notify contract as `TimeScaleModel`, resolving `{position, max}`; the one notification contract (D-S1.5-4) stated once for both models; `batch()`; `view/scroll-attachment.ts` as the DOM-facing counterpart (alongside `view/pane-size-attachment.ts`, #8).
- `plans/02` §5 — `scroll.xOnly()` drops from the example; one sentence on why `scale` is a class and `scroll` will not get a `Source` interface.
- `plans/00` D9 — "x, y, or both" becomes "both; partial views deferred until a caller needs one" (D-S1.5-3).
- `CONTEXT.md` — **Pan** (move the shared viewport, at gesture and model layer) vs. **scroll** (an element's native offset), with the I12 reason; **Attachment**; **Pane size**; **Batch** (vs. Transaction); **Reveal**; the `ScrollModel` entry gains "resolves position *and* the loosest max; each chart clamps locally"; `Scale binding`'s "measured viewport width" → "measured pane width".
- `docs/02` B4 — allowlist `src/view/scroll-binding.ts` → `src/view/scroll-attachment.ts`; reconcile `no-raw-scroll` / `no-scroll-outside-scroll-model` to the shipped rule name.
- **Open item, declared:** `gantt.scale` / `gantt.scroll` setters at S1.8 (§5).
- `harness/index.html` — #41's `overflow: auto` on `#gantt` moves into the library's timeline pane at S1.8; until then it stays, tracked in #41.

---

## 9. TODO

Guardrails and types first (`plans/04` §3.2/§3.3), then the pure model, then the DOM edge.

### Foundations
- [x] `src/model/geometry.ts` — `Point`, `Size`, `PixelSpan`, `Rect`; re-export from `src/model/index.ts`
- [x] Retarget `eslint/rules/no-scroll-outside-scroll-model.cjs:26` to `view/scroll-attachment`; fix the stale header path (line 2)
- [x] Update `eslint/rules/no-scroll-outside-scroll-model.test.cjs`; confirm the red fixture still fails

### `TimeScaleModel` (same seam, do it before `ScrollModel` so the contract exists to copy)
- [x] `ScaleBinding` → `readonly`, `viewportWidth` → `paneWidth`; model copies at bind time
- [x] `ScaleBindingHandle.setViewportWidth` → `setPaneWidth`
- [x] Add `batch(run)` — re-entrant, flush in `finally`
- [x] Notify-iff-changed on `{timeZone, range.start, range.end, pxPerMs}`; `bind` still always notifies the newcomer
- [x] Update call sites: `src/view/gantt-shell.ts`, `harness/main.ts`
- [x] Tests: `batch`; notify-iff-changed; post-`bind()` mutation cannot change resolution

### `ScrollModel`
- [x] `src/layout/viewport/scroll-model.ts` — types per §3.2
- [x] `max` = loosest bound across measured bindings (D-S1.5-1)
- [x] `panTo` clamps at write time; nothing else rewrites `position` (D-S1.5-2)
- [x] Memoized `state`; notify per D-S1.5-4
- [x] `batch(run)` — re-entrant, flush in `finally`
- [x] `bind` marked `@internal` with the "use `GanttOptions.scroll`" note
- [x] Tests per §7 (pure)

### `view/scroll-attachment.ts`
- [x] `attachScroll(element, scroll, onChange)` — owns the binding, binds on attach, unbinds on `detach()`. **Superseded at S1.7:** the signature is now `attachScroll(element, viewport)` — `Viewport.bind` owns the binding, and this file owns only the DOM edge, reading `viewport.visible` (`plans/s1.7-windowed-frame/README.md` §3.6).
- [x] Local-clamp echo rule (D-S1.5-6) with the epsilon comment naming both its jobs
- [x] Reaction order: `onChange()` then element write (D-S1.5-7)
- [x] Tests per §7 (dom)
- [x] `e2e/scroll-sync.spec.ts` — echo case + two-chart clamp case

### Wiring and surface
- [x] `GanttOptions.scroll?: ScrollModel`; `GanttShell` constructs a private default when omitted
- [x] `api/index.ts` re-exports exactly the §5 list — and nothing else
- [x] Review `harness/main.ts` against the library rules (CLAUDE.md); record any gap against S1.5, fix it in `src/` — none found: no pixel arithmetic, no scroll gap (GanttShell's private default `ScrollModel` covers it). `render/dom/index.ts` gained a hidden content-sizer element so `host`'s native `overflow: auto` actually has real scrollable extent matching `frame.contentWidth`/`contentHeight` (D-S1.5-9) — needed for `ScrollModel.panTo` to have anywhere real to write; added `harness/scroll-sync.html`/`.ts` as the two-Gantt e2e fixture.

### Docs
- [x] The §8 spec edits, landed **with** this step — not deferred to the issue thread (`plans/00` D9, `plans/01` §1.1 + §8.2, `plans/02` §5, `docs/02` B4, `harness/index.html`)
- [x] `CONTEXT.md` glossary entries per §8 (pre-existing — verified accurate against the shipped API)

### Acceptance
- [x] **U1/U2** — two harness Gantts given the same `ScrollModel` scroll together; row labels stay pixel-aligned while scrolling (`plans/03` S1 acceptance 4) — `e2e/scroll-sync.spec.ts` echo case
- [x] **U3** — different row counts: the short chart pins and resumes; the shared position survives — `e2e/scroll-sync.spec.ts` + `src/view/gantt-shell.test.ts`
- [x] **U4** — shrink the content, restore it, land back in the same place — `src/layout/viewport/scroll-model.test.ts`
- [x] **U6** — `harness/main.ts` contains no pixel arithmetic

---

## 10. Deferred, with the caller that will bring it back

| Deferred | Returns at | Needs |
|---|---|---|
| `gantt.reveal(entryId)` | S1.8 | a pane height that re-measures (S1.7b, #8) — `Viewport`, `frame.rows` and `RowHeightIndex` all ship at S1.7 |
| `gantt.scale =` / `gantt.scroll =` setters | S1.8 | the already-built `Viewport` (S1.7) owning unbind → rebind → re-render |
| `panBy(delta)` | S4 | wheel / keyboard controllers producing deltas |
| `xOnly()` / `yOnly()` | when a host needs "share x, private y" | a real caller (D-S1.5-3) |
| One-scrollbar treatment for linked charts | its own issue against S1.8 | a linked-group concept in `view/` |
