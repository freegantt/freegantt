// layout/ owns Viewport — the fan-in over TimeScaleModel and the two ScrollAxis directions
// (plans/01 §8.2). One bind, one handle, one reaction: a shell that held both
// models separately (S1.5) also held two reactions, a god object arriving on schedule
// the moment a third model (pane-size measurement, #8) joins them. Viewport exists so `view/`
// never holds more than one.

import { TimeScaleModel, bindTimeScale } from './time-scale-model.js';
import type { ScaleBinding, ScaleBindingHandle, TimeScaleFit } from './time-scale-model.js';
import { ScrollAxis, bindScrollAxis } from './scroll-axis.js';
import type { BoundScrollPair, ScrollAxes, ScrollAxisBindingHandle } from './scroll-axis.js';
import { diffMs, resolvePreset, ZOOM_PRESETS } from '../../time/index.js';
import type { PresetRef, TimeScale, ViewPreset } from '../../time/index.js';
import { BatchedNotifier } from './batched-notifier.js';
import { FreeGanttError } from '../../model/index.js';
import type { Entry, Instant, Rect, Size, TimeSpan } from '../../model/index.js';
// Not re-exported from `model/index.ts` — a code a consumer cannot reach stays off its barrel too (#380).
import type { InternalThrownCode } from '../../model/errors.js';
import { DEFAULT_OVERSCAN } from '../frame.js';
import type { Overscan } from '../frame.js';

export interface ViewportOptions {
  /** Private defaults when omitted — single-Gantt usage never meets either concept (plans/01 §8.2). */
  scale?: TimeScaleModel;
  /** Omitting a direction builds it a private default `ScrollAxis` — sharing `x` alone
   *  syncs horizontal scroll and leaves `y` private, and so on for every combination. */
  scroll?: ScrollAxes;
  overscan?: Overscan;
}

/** What `bind()` needs off a Dataset (OQ4, plans/s2-data-core): a snapshot, not the store — `layout/`
 *  takes `entries.all` and has no interest in a store. The caller reads it fresh at bind time;
 *  S2.4's live binding is what pushes an updated snapshot in on every dataset change, through the
 *  returned handle, not through this shape widening. */
export interface DatasetBinding {
  readonly entries: readonly Entry[];
  readonly timeZone: string;
}

/** @internal — view/ only. Binding handle shape, per conventions §4. */
export interface ViewportHandle {
  unbind(): void;
  /** The timeline pane's measured drawable box. Fans out to `paneWidth`, each axis's
   *  `ScrollAxisBinding.pane`, and `visible.width`/`height`. */
  setPaneSize(size: Size): void;
  /** Post-render extents from the frame. Fans out to each axis's `ScrollAxisBinding.content`. */
  setContentSize(size: Size): void;
  /** A committed changeset's fresh `entries.all` snapshot. Fans out to
   *  `ScaleBinding.entries`, which re-resolves `'fitDataset'` through its own equality check. */
  setEntries(entries: readonly Entry[]): void;
}

function sameOverscan(a: Overscan, b: Overscan): boolean {
  const aRows = a.verticalRows ?? DEFAULT_OVERSCAN.verticalRows;
  const bRows = b.verticalRows ?? DEFAULT_OVERSCAN.verticalRows;
  const aPx = a.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx;
  const bPx = b.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx;
  return aRows === bRows && aPx === bPx;
}

const ZERO_SIZE: Size = Object.freeze({ width: 0, height: 0 });

export class Viewport {
  readonly scale: TimeScaleModel;
  /** Two independent directions — `scroll.x`/`scroll.y` are the shareable units; this
   *  record itself is per-Viewport, built once at construction. */
  readonly scroll: BoundScrollPair;
  #overscan: Overscan;
  /** The ordered set `zoomIn`/`zoomOut` step through, finest first. Default: the
   *  shipped ten-rung set. */
  #zoomPresets: readonly ViewPreset[] = ZOOM_PRESETS;
  #paneSize: Size = ZERO_SIZE;
  #contentSize: Size = ZERO_SIZE;
  #onChange: (() => void) | undefined;
  /** The bound Gantt's own x-scroll handle, kept so `zoomTo` can push a re-measured content width
   *  synchronously — before a render runs — rather than clamping `panTo` against a render-stale
   *  `ScrollAxis.max`. Content width is a horizontal-only concept, so only `x`
   *  needs a kept handle. Assigned in `bind()`; undefined before then. */
  #scrollHandleX: ScrollAxisBindingHandle | undefined;
  // Coalesces notifications from all THREE sub-models into one consumer reaction: scale
  // and each scroll axis already dedupe within themselves, but a single setPaneSize
  // touches all three, and without this layer each would flush its own notification for the same
  // caller-visible change. The batching half only — a Viewport has one subscriber and no resolved
  // value of its own to compare, so `BoundValue`'s bindings-and-comparison half would be a
  // capability it must not have.
  #notifications = new BatchedNotifier(() => this.#onChange?.());

  constructor(options: ViewportOptions = {}) {
    this.scale = options.scale ?? new TimeScaleModel();
    this.scroll = Object.freeze({
      x: options.scroll?.x ?? new ScrollAxis(),
      y: options.scroll?.y ?? new ScrollAxis(),
    });
    this.#overscan = options.overscan ?? {};
  }

  #notify = (): void => {
    this.#notifications.notify();
  };

  /** One subscription for both models: the shell reacts once, not twice.
   *
   *  Single-subscriber, unlike the models it fans into — and it has to be: a `Viewport` holds
   *  ONE Gantt's pane size and content size, so a second shell binding to it would resolve `visible`
   *  from the other shell's box. Sharing is what `ViewportOptions.scale`/`scroll` are for: the
   *  models are the shareable objects (D9), the fan-in is per Gantt. A second `bind` is a
   *  programming error in `view/`, not a silently replaced reaction. */
  bind(dataset: DatasetBinding, onChange: () => void): ViewportHandle {
    if (this.#onChange) {
      throw new FreeGanttError(
        'viewport-already-bound' satisfies InternalThrownCode,
        'Viewport.bind: this Viewport is already bound. One Viewport serves one Gantt; share a TimeScaleModel or ScrollAxis instead (D9).',
      );
    }
    this.#onChange = onChange;
    const scaleBinding: ScaleBinding = {
      entries: dataset.entries,
      timeZone: dataset.timeZone,
      paneWidth: this.#paneSize.width,
    };
    const scaleHandle: ScaleBindingHandle = bindTimeScale(this.scale, scaleBinding, this.#notify);
    const scrollHandleX = bindScrollAxis(
      this.scroll.x,
      { content: this.#contentSize.width, pane: this.#paneSize.width },
      this.#notify,
    );
    const scrollHandleY = bindScrollAxis(
      this.scroll.y,
      { content: this.#contentSize.height, pane: this.#paneSize.height },
      this.#notify,
    );
    this.#scrollHandleX = scrollHandleX;

    return {
      unbind: () => {
        scaleHandle.unbind();
        scrollHandleX.unbind();
        scrollHandleY.unbind();
        this.#onChange = undefined;
        this.#scrollHandleX = undefined;
      },
      setPaneSize: (size) => {
        this.#paneSize = size;
        this.#notifications.batch(() => {
          scaleHandle.setPaneWidth(size.width);
          scrollHandleX.setPaneSize(size.width);
          scrollHandleY.setPaneSize(size.height);
        });
      },
      setContentSize: (size) => {
        this.#contentSize = size;
        this.#notifications.batch(() => {
          scrollHandleX.setContentSize(size.width);
          scrollHandleY.setContentSize(size.height);
        });
      },
      setEntries: (entries) => {
        this.#notifications.batch(() => scaleHandle.setEntries(entries));
      },
    };
  }

  /** Resolved, ready for `LayoutInput` — the shell never reaches through to `scale.scale`. */
  get timeScale(): TimeScale {
    return this.scale.scale;
  }

  get preset(): ViewPreset {
    return this.scale.preset;
  }

  /** Live — delegates straight to `TimeScaleModel.preset` ("GanttShell delegates straight
   *  to #viewport"). Resolved through `resolvePreset`; no-op, no notification, when unchanged.
   *
   *  Re-clamps scroll against the freshly resolved `contentWidth`, in place, the same way
   *  `#stepPreset`/`zoomToSpan` already re-clamp around their own anchor — without it,
   *  `visible` (below) keeps clamping against the OLD content size and `scroll.state.position`
   *  keeps its OLD, now-meaningless pixel value until `GanttShell.render()` calls `setContentSize`
   *  itself, one render later. A preset that shrinks content while scrolled away from 0 then
   *  computes that one frame against a `visible.x` outside the new, smaller extent — every bar
   *  culls out, and the DOM nodes for whatever bars survive once the browser's own scrollLeft clamp
   *  corrects it on the following frame are new nodes, a full unwanted remount (found while adding
   *  `panToToday` to the harness pages, header readability follow-up pass 4 — previously
   *  unreachable because every existing fixture only ever scrolled from position 0, where any
   *  content size is still in bounds). */
  set preset(ref: PresetRef) {
    // Resolved here, under this door's own name, so an invalid custom preset reports `gantt.preset`
    // — the surface this setter's own caller actually wrote — rather than `TimeScaleModel.preset`'s
    // generic `preset` (C3/#482 review). `this.scale.preset` re-resolves the same, already-valid
    // object below; that second pass cannot throw.
    //
    // Searches this Gantt's own `zoomPresets` before the shipped table (#489 owner ruling) — a
    // custom rung a consumer spliced into their own ladder then resolves the same way a shipped id
    // does, so `gantt.preset = presetSelect.value` never needs to know which table an id came from.
    const resolved = resolvePreset(ref, 'gantt.preset', this.#zoomPresets);
    this.batch(() => {
      this.scale.preset = resolved;
      this.#reclampToContentWidth();
    });
  }

  get range(): 'fitDataset' | TimeSpan {
    return this.scale.range;
  }

  /** Live — delegates straight to `TimeScaleModel.range`. Re-clamps against `contentWidth` eagerly —
   *  see `set preset` above; a `range` change can resize content exactly the same way a `preset`
   *  change can. */
  set range(r: 'fitDataset' | TimeSpan) {
    this.batch(() => {
      this.scale.range = r;
      this.#reclampToContentWidth();
    });
  }

  get fit(): TimeScaleFit {
    return this.scale.fit;
  }

  /** Live — delegates straight to `TimeScaleModel.fit`. Re-clamps against `contentWidth` eagerly —
   *  see `set preset` above; a `fit` change can resize content exactly the same way a `preset`
   *  change can. */
  set fit(f: TimeScaleFit) {
    this.batch(() => {
      this.scale.fit = f;
      this.#reclampToContentWidth();
    });
  }

  /** Pushes the just-resolved `TimeScale.contentWidth` into both this Viewport's own tracked
   *  `#contentSize` (what `visible`'s local clamp reads) and the x-axis scroll binding —
   *  content width is horizontal only, so `y` never needs this push. Every anchored scale write
   *  calls this *before* `panTo`, or `visible` and `scroll.x.state.max` keep the previous render's
   *  width. A no-op before the first `bind()` (`#scrollHandleX` is unset then). */
  #pushContentWidth(): void {
    if (!this.#scrollHandleX) return;
    const size = { width: this.timeScale.contentWidth, height: this.#contentSize.height };
    this.#contentSize = size;
    this.#scrollHandleX.setContentSize(size.width);
  }

  /** `#pushContentWidth`, then re-pan `x` to its CURRENT position — a no-op move whose only job is
   *  forcing `ScrollAxis.panTo`'s own clamp to run against the fresh `max` right now,
   *  instead of leaving a stale position for `GanttShell.render()` to compute a frame against. `y`
   *  never needs this: content width is horizontal only. See `set preset`'s doc. */
  #reclampToContentWidth(): void {
    this.#pushContentWidth();
    this.scroll.x.panTo(this.scroll.x.state.position);
  }

  get overscan(): Overscan {
    return this.#overscan;
  }

  /** Live — every config key is live-reconfigurable (plans/02 §1.1). Notifies iff the resolved
   *  overscan actually changed, the same "notify iff changed" contract `TimeScaleModel`/`ScrollAxis`
   *  already keep. */
  set overscan(o: Overscan) {
    if (sameOverscan(this.#overscan, o)) return;
    this.#overscan = o;
    this.#notify();
  }

  /** The culling window, in timeline-content coordinates, from the LOCALLY clamped position.
   *  This Gantt's own pushed extents, not either axis's `state.max`, which is the
   *  loosest bound across every bound Gantt. Straight into `LayoutInput.visible`; also what
   *  `attachScroll` writes. */
  get visible(): Rect {
    const x = this.scroll.x.state.position;
    const y = this.scroll.y.state.position;
    const maxX = Math.max(0, this.#contentSize.width - this.#paneSize.width);
    const maxY = Math.max(0, this.#contentSize.height - this.#paneSize.height);
    return {
      x: Math.min(x, maxX),
      y: Math.min(y, maxY),
      width: this.#paneSize.width,
      height: this.#paneSize.height,
    };
  }

  /** `visible`'s own pixels read as time (issue #461). Excludes overscan — this is what the reader
   *  has on screen, not what the renderer keeps warm past either edge (contrast
   *  `DecorationContext.span`, which IS overscan-widened, `layout/decoration.ts`). Pixel-derived,
   *  not tick-aligned: an edge lands mid-tick, same as `visible` itself.
   *
   *  Two states answer the degenerate span `{ start: s, end: s }` at the clamped left edge: a
   *  zero-width pane (a `display: none` container), and the moment before the first pane
   *  measurement arrives, when `#paneSize` is still `ZERO_SIZE`. Both say the same true thing —
   *  nothing is on screen. `visible.width > 0` disabling culling (`layout/frame.ts`) is a renderer
   *  convenience — "cull nothing" — and reusing it here would instead claim the whole content is on
   *  screen, which is a lie. */
  get visibleSpan(): TimeSpan {
    return this.timeScale.spanForPixels(this.visible);
  }

  /** Several writes, one consumer reaction. Re-entrant, flushes in a `finally` (conventions §5).
   *  First caller is S1.9's `zoomTo`. */
  batch(run: () => void): void {
    this.#notifications.batch(() =>
      this.scale.batch(() => this.scroll.x.batch(() => this.scroll.y.batch(run))),
    );
  }

  /** Reads the instant currently under `anchorX` (default: pane center) BEFORE writing anything,
   *  then writes `scale.fit` and repositions `scroll.x` inside one batch so that instant is back
   *  under `anchorX` after. Never touches `range.start`. One notification.
   *
   *  `scroll.x.panTo` clamps against `scroll.x.state.max`, resolved from the LAST PUSHED content
   *  size — the one `GanttShell.render()` pushes after computing a frame. Writing `scale.fit` and
   *  immediately panning would clamp against the old, one-render-stale `contentWidth`. `contentWidth`
   *  is a pure function of `range`/`pxPerMs` — no layout pass needed to know it changed — so this
   *  pushes the new one itself, synchronously, between the scale write and the pan. */
  zoomTo(pxPerMs: number, anchorX: number = this.#paneSize.width / 2): void {
    const anchorInstant = this.timeScale.instantForX(this.scroll.x.state.position + anchorX);
    this.batch(() => {
      this.scale.fit = pxPerMs;
      this.#pushContentWidth();
      this.scroll.x.panTo(this.timeScale.xForInstant(anchorInstant) - anchorX);
    });
  }

  /** `zoomTo(timeScale.pxPerMs * factor, anchorX)`. */
  zoomBy(factor: number, anchorX?: number): void {
    this.zoomTo(this.timeScale.pxPerMs * factor, anchorX ?? this.#paneSize.width / 2);
  }

  /** The ordered set `zoomIn`/`zoomOut` step through, finest first. Live. */
  get zoomPresets(): readonly ViewPreset[] {
    return this.#zoomPresets;
  }

  set zoomPresets(refs: readonly PresetRef[]) {
    this.#zoomPresets = Object.freeze(refs.map((ref) => resolvePreset(ref, 'gantt.zoomPresets')));
  }

  /** Ladder position by `preset.id`, not object identity — a spread clone of a shipped preset
   *  (e.g. `{ ...gantt.preset, preferredTickWidthPx: 40 }`) must still step and report `canZoom*`
   *  correctly. */
  #zoomPresetIndex(): number {
    return this.#zoomPresets.findIndex((preset) => preset.id === this.scale.preset.id);
  }

  /** True unless the current preset is the finest entry of `zoomPresets`, or is not in it at all —
   *  the same "not found" reading `zoomIn`'s no-op takes. */
  get canZoomIn(): boolean {
    return this.#zoomPresetIndex() > 0;
  }

  get canZoomOut(): boolean {
    const index = this.#zoomPresetIndex();
    return index !== -1 && index < this.#zoomPresets.length - 1;
  }

  /** Steps `preset` to `zoomPresets[index + delta]`, re-anchoring inside one `batch()` exactly as
   *  `zoomTo` does. No-op — no notification — at the ends, or when the current preset is
   *  not a member of `zoomPresets` at all. */
  #stepPreset(delta: number, anchorX: number): void {
    const index = this.#zoomPresetIndex();
    const next = index + delta;
    if (index === -1 || next < 0 || next >= this.#zoomPresets.length) return;
    const anchorInstant = this.timeScale.instantForX(this.scroll.x.state.position + anchorX);
    this.batch(() => {
      this.scale.preset = this.#zoomPresets[next]!;
      this.#pushContentWidth();
      this.scroll.x.panTo(this.timeScale.xForInstant(anchorInstant) - anchorX);
    });
  }

  /** Next finer entry of `zoomPresets`; no-op at the finest. `anchorX` defaults to
   *  pane centre. Steps the preset (labels and tick unit) only — it does not write Fit. Under the
   *  default `fit: 'pane'`, `pxPerMs` stays pane-fill until `minTickWidthPx` bites, so a step can
   *  change labels while density stays put. */
  zoomIn(anchorX?: number): void {
    this.#stepPreset(-1, anchorX ?? this.#paneSize.width / 2);
  }

  /** Next coarser entry of `zoomPresets`; no-op at the coarsest. */
  zoomOut(anchorX?: number): void {
    this.#stepPreset(1, anchorX ?? this.#paneSize.width / 2);
  }

  /** Resolves the density that makes `span` exactly fill the pane, then pans so `span.start` sits at
   *  the pane's left edge — both inside one batch, one notification. Floored by
   *  the preset's `minTickWidthPx`, so a span too long to be legible fills the pane only
   *  as far as the floor allows. */
  zoomToSpan(span: TimeSpan): void {
    const spanMs = diffMs(span.end, span.start);
    const targetPxPerMs = this.#paneSize.width > 0 && spanMs > 0 ? this.#paneSize.width / spanMs : 0;
    this.batch(() => {
      this.scale.fit = targetPxPerMs;
      this.#pushContentWidth();
      this.scroll.x.panTo(this.timeScale.xForInstant(span.start));
    });
  }

  /** Pans so `i` sits at `align` within the pane. `scroll.x.panTo` clamps to
   *  `[0, max]`, so `i` outside the pannable range lands at whichever edge is closest
   *  instead of throwing. */
  panToInstant(i: Instant, align: 'start' | 'center'): void {
    const x = this.timeScale.xForInstant(i) - (align === 'center' ? this.#paneSize.width / 2 : 0);
    this.scroll.x.panTo(x);
  }

  /** "Nearest edge," not "center" — `view/`-only, not exported from `api/` (matches
   *  `Viewport` itself). If `target` is already inside `visible`, nothing moves; off an
   *  edge, `panTo` moves exactly enough to align that edge — the same policy
   *  `scrollIntoView({block: 'nearest'})` uses, on either axis or both. One batch, one notification,
   *  even though each axis moves through its own `ScrollAxis`. */
  reveal(target: Rect): void {
    const v = this.visible;
    let x = v.x;
    if (target.x < v.x) x = target.x;
    else if (target.x + target.width > v.x + v.width) x = target.x + target.width - v.width;

    let y = v.y;
    if (target.y < v.y) y = target.y;
    else if (target.y + target.height > v.y + v.height) y = target.y + target.height - v.height;

    this.batch(() => {
      this.scroll.x.panTo(x);
      this.scroll.y.panTo(y);
    });
  }
}
