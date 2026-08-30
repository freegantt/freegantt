// layout/ owns Viewport — the fan-in over TimeScaleModel and ScrollModel (plans/01 §8.2, D-S1.7-1).
// One bind, one handle, one reaction: a shell that held both models separately (S1.5) also held two
// reactions, which is R1's god object arriving on schedule the moment a third model (pane-size
// measurement, #8) joins them. Viewport exists so `view/` never holds more than one.

import { TimeScaleModel, bindTimeScale } from './time-scale-model.js';
import type { ScaleBinding, ScaleBindingHandle, TimeScaleFit } from './time-scale-model.js';
import { ScrollModel, bindScroll } from './scroll-model.js';
import type { ScrollBindingHandle } from './scroll-model.js';
import { diffMs, resolvePreset, ZOOM_PRESETS } from '../../time/index.js';
import type { PresetRef, TimeScale, ViewPreset } from '../../time/index.js';
import { BatchedNotifier } from './batched-notifier.js';
import { FreeGanttError } from '../../model/index.js';
import type { Entry, Instant, Rect, Size, TimeSpan } from '../../model/index.js';
import { DEFAULT_OVERSCAN } from '../frame.js';
import type { Overscan } from '../frame.js';

export interface ViewportOptions {
  /** Private defaults when omitted — single-Gantt usage never meets either concept (plans/01 §8.2). */
  scale?: TimeScaleModel;
  scroll?: ScrollModel;
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
  /** The timeline pane's measured drawable box. Fans out to `paneWidth`, `ScrollBinding.pane`, and
   *  `visible.width`/`height`. */
  setPaneSize(size: Size): void;
  /** Post-render extents from the frame. Fans out to `ScrollBinding.content`. */
  setContentSize(size: Size): void;
  /** A committed changeset's fresh `entries.all` snapshot (S2.4, D-S2-20). Fans out to
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
  readonly scroll: ScrollModel;
  #overscan: Overscan;
  /** The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Default: the
   *  shipped nine-rung set. */
  #zoomPresets: readonly ViewPreset[] = ZOOM_PRESETS;
  #paneSize: Size = ZERO_SIZE;
  #contentSize: Size = ZERO_SIZE;
  #onChange: (() => void) | undefined;
  /** The bound Gantt's own scroll handle, kept so `zoomTo` can push a re-measured content width
   *  synchronously — before a render runs — rather than clamping `panTo` against a render-stale
   *  `ScrollModel.max` (S1.9, D-S1.9-5). Assigned in `bind()`; undefined before then. */
  #scrollHandle: ScrollBindingHandle | undefined;
  // Coalesces notifications from BOTH sub-models into one consumer reaction (D-S1.7-1): scale and
  // scroll each already dedupe within themselves (D-S1.5-4), but a single setPaneSize touches both,
  // and without this layer each would flush its own notification for the same caller-visible change.
  // The batching half only — a Viewport has one subscriber and no resolved value of its own to
  // compare, so `BoundValue`'s bindings-and-comparison half would be a capability it must not have.
  #notifications = new BatchedNotifier(() => this.#onChange?.());

  constructor(options: ViewportOptions = {}) {
    this.scale = options.scale ?? new TimeScaleModel();
    this.scroll = options.scroll ?? new ScrollModel();
    this.#overscan = options.overscan ?? {};
  }

  #notify = (): void => {
    this.#notifications.notify();
  };

  /** One subscription for both models: the shell reacts once, not twice (D-S1.7-1).
   *
   *  Single-subscriber, unlike the two models it fans into — and it has to be: a `Viewport` holds
   *  ONE Gantt's pane size and content size, so a second shell binding to it would resolve `visible`
   *  from the other shell's box. Sharing is what `ViewportOptions.scale`/`scroll` are for: the
   *  models are the shareable objects (D9), the fan-in is per Gantt. A second `bind` is a
   *  programming error in `view/`, not a silently replaced reaction. */
  bind(dataset: DatasetBinding, onChange: () => void): ViewportHandle {
    if (this.#onChange) {
      throw new FreeGanttError(
        'viewport-already-bound',
        'Viewport.bind: this Viewport is already bound. One Viewport serves one Gantt; share a TimeScaleModel or ScrollModel instead (D9).',
      );
    }
    this.#onChange = onChange;
    const scaleBinding: ScaleBinding = {
      entries: dataset.entries,
      timeZone: dataset.timeZone,
      paneWidth: this.#paneSize.width,
    };
    const scaleHandle: ScaleBindingHandle = bindTimeScale(this.scale, scaleBinding, this.#notify);
    const scrollHandle: ScrollBindingHandle = bindScroll(
      this.scroll,
      { content: this.#contentSize, pane: this.#paneSize },
      this.#notify,
    );
    this.#scrollHandle = scrollHandle;

    return {
      unbind: () => {
        scaleHandle.unbind();
        scrollHandle.unbind();
        this.#onChange = undefined;
        this.#scrollHandle = undefined;
      },
      setPaneSize: (size) => {
        this.#paneSize = size;
        this.#notifications.batch(() => {
          scaleHandle.setPaneWidth(size.width);
          scrollHandle.setPaneSize(size);
        });
      },
      setContentSize: (size) => {
        this.#contentSize = size;
        this.#notifications.batch(() => scrollHandle.setContentSize(size));
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

  /** Live — delegates straight to `TimeScaleModel.preset` (D-S1.9-9's "GanttShell delegates straight
   *  to #viewport"). Resolved through `resolvePreset`; no-op, no notification, when unchanged.
   *
   *  Re-clamps scroll against the freshly resolved `contentWidth`, in place, the same way
   *  `#stepPreset`/`zoomToSpan` already re-clamp around their own anchor (D-S1.9-5) — without it,
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
    this.batch(() => {
      this.scale.preset = ref;
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
   *  `#contentSize` (what `visible`'s local clamp reads, D-S1.7-2) and the scroll binding. Every
   *  anchored scale write calls this *before* `panTo`, or `visible` and `ScrollModel.max` keep the
   *  previous render's width. A no-op before the first `bind()` (`#scrollHandle` is unset then). */
  #pushContentWidth(): void {
    if (!this.#scrollHandle) return;
    const size = { width: this.timeScale.contentWidth, height: this.#contentSize.height };
    this.#contentSize = size;
    this.#scrollHandle.setContentSize(size);
  }

  /** `#pushContentWidth`, then re-pan to the CURRENT position — a no-op move whose only job is
   *  forcing `ScrollModel.panTo`'s own clamp (D-S1.5-2) to run against the fresh `max` right now,
   *  instead of leaving a stale position for `GanttShell.render()` to compute a frame against. See
   *  `set preset`'s doc. */
  #reclampToContentWidth(): void {
    this.#pushContentWidth();
    this.scroll.panTo(this.scroll.state.position);
  }

  get overscan(): Overscan {
    return this.#overscan;
  }

  /** Live — every config key is live-reconfigurable (plans/02 §1.1). Notifies iff the resolved
   *  overscan actually changed, the same "notify iff changed" contract `TimeScaleModel`/`ScrollModel`
   *  already keep (D-S1.5-4). */
  set overscan(o: Overscan) {
    if (sameOverscan(this.#overscan, o)) return;
    this.#overscan = o;
    this.#notify();
  }

  /** The culling window, in timeline-content coordinates, from the LOCALLY clamped position
   *  (D-S1.7-2) — this Gantt's own pushed extents, not `scroll.state.max`'s loosest-bound-across-
   *  bindings. Straight into `LayoutInput.visible`; also what `attachScroll` writes. */
  get visible(): Rect {
    const { position } = this.scroll.state;
    const maxX = Math.max(0, this.#contentSize.width - this.#paneSize.width);
    const maxY = Math.max(0, this.#contentSize.height - this.#paneSize.height);
    return {
      x: Math.min(position.x, maxX),
      y: Math.min(position.y, maxY),
      width: this.#paneSize.width,
      height: this.#paneSize.height,
    };
  }

  /** Several writes, one consumer reaction. Re-entrant, flushes in a `finally` (conventions §5).
   *  First caller is S1.9's `zoomTo` (D-S1.7-10). */
  batch(run: () => void): void {
    this.#notifications.batch(() => this.scale.batch(() => this.scroll.batch(run)));
  }

  /** Reads the instant currently under `anchorX` (default: pane center) BEFORE writing anything,
   *  then writes `scale.fit` and repositions `scroll.x` inside one batch so that instant is back
   *  under `anchorX` after (S1.9, D-S1.9-5). Never touches `range.start` (D-F′). One notification.
   *
   *  `scroll.panTo` clamps against `ScrollModel.state.max`, resolved from the LAST PUSHED content
   *  size — the one `GanttShell.render()` pushes after computing a frame. Writing `scale.fit` and
   *  immediately panning would clamp against the old, one-render-stale `contentWidth`. `contentWidth`
   *  is a pure function of `range`/`pxPerMs` — no layout pass needed to know it changed — so this
   *  pushes the new one itself, synchronously, between the scale write and the pan. */
  zoomTo(pxPerMs: number, anchorX: number = this.#paneSize.width / 2): void {
    const anchorInstant = this.timeScale.instantForX(this.scroll.state.position.x + anchorX);
    this.batch(() => {
      this.scale.fit = pxPerMs;
      this.#pushContentWidth();
      this.scroll.panTo({ x: this.timeScale.xForInstant(anchorInstant) - anchorX });
    });
  }

  /** `zoomTo(timeScale.pxPerMs * factor, anchorX)` (S1.9, D-S1.9-5). */
  zoomBy(factor: number, anchorX?: number): void {
    this.zoomTo(this.timeScale.pxPerMs * factor, anchorX ?? this.#paneSize.width / 2);
  }

  /** The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live. */
  get zoomPresets(): readonly ViewPreset[] {
    return this.#zoomPresets;
  }

  set zoomPresets(refs: readonly PresetRef[]) {
    this.#zoomPresets = Object.freeze(refs.map(resolvePreset));
  }

  #zoomPresetIndex(): number {
    return this.#zoomPresets.indexOf(this.scale.preset);
  }

  /** True unless the current preset is the finest entry of `zoomPresets`, or is not in it at all —
   *  the same "not found" reading `zoomIn`'s no-op takes (D-S1.12-6). */
  get canZoomIn(): boolean {
    return this.#zoomPresetIndex() > 0;
  }

  get canZoomOut(): boolean {
    const index = this.#zoomPresetIndex();
    return index !== -1 && index < this.#zoomPresets.length - 1;
  }

  /** Steps `preset` to `zoomPresets[index + delta]`, re-anchoring inside one `batch()` exactly as
   *  `zoomTo` does (D-S1.12-6). No-op — no notification — at the ends, or when the current preset is
   *  not a member of `zoomPresets` at all. */
  #stepPreset(delta: number, anchorX: number): void {
    const index = this.#zoomPresetIndex();
    const next = index + delta;
    if (index === -1 || next < 0 || next >= this.#zoomPresets.length) return;
    const anchorInstant = this.timeScale.instantForX(this.scroll.state.position.x + anchorX);
    this.batch(() => {
      this.scale.preset = this.#zoomPresets[next]!;
      this.#pushContentWidth();
      this.scroll.panTo({ x: this.timeScale.xForInstant(anchorInstant) - anchorX });
    });
  }

  /** Next finer entry of `zoomPresets`; no-op at the finest (S1.12, D-S1.12-6). `anchorX` defaults to
   *  pane centre. Steps the preset (labels and tick unit) only — it does not write Fit. Under the
   *  default `fit: 'pane'`, `pxPerMs` stays pane-fill until `minTickWidthPx` bites, so a step can
   *  change labels while density stays put (HANDOFF; D-S1.12-6). */
  zoomIn(anchorX?: number): void {
    this.#stepPreset(-1, anchorX ?? this.#paneSize.width / 2);
  }

  /** Next coarser entry of `zoomPresets`; no-op at the coarsest (S1.12, D-S1.12-6). */
  zoomOut(anchorX?: number): void {
    this.#stepPreset(1, anchorX ?? this.#paneSize.width / 2);
  }

  /** Resolves the density that makes `span` exactly fill the pane, then pans so `span.start` sits at
   *  the pane's left edge — both inside one batch, one notification (S1.12, D-S1.12-7). Floored by
   *  the preset's `minTickWidthPx` (D-S1.12-2), so a span too long to be legible fills the pane only
   *  as far as the floor allows. */
  zoomToSpan(span: TimeSpan): void {
    const spanMs = diffMs(span.end, span.start);
    const targetPxPerMs = this.#paneSize.width > 0 && spanMs > 0 ? this.#paneSize.width / spanMs : 0;
    this.batch(() => {
      this.scale.fit = targetPxPerMs;
      this.#pushContentWidth();
      this.scroll.panTo({ x: this.timeScale.xForInstant(span.start) });
    });
  }

  /** Pans so `i` sits at `align` within the pane (S1.12, D-S1.12-8). `scroll.panTo` clamps to
   *  `[0, max]` (D-S1.5-2), so `i` outside the pannable range lands at whichever edge is closest
   *  instead of throwing. */
  panToInstant(i: Instant, align: 'start' | 'center'): void {
    const x = this.timeScale.xForInstant(i) - (align === 'center' ? this.#paneSize.width / 2 : 0);
    this.scroll.panTo({ x });
  }

  /** "Nearest edge," not "center" (S1.9, D-S1.9-6) — `view/`-only, not exported from `api/` (matches
   *  `Viewport` itself, D-S1.7-10). If `target` is already inside `visible`, nothing moves; off an
   *  edge, `panTo` moves exactly enough to align that edge — the same policy
   *  `scrollIntoView({block: 'nearest'})` uses, on either axis or both. */
  reveal(target: Rect): void {
    const v = this.visible;
    let x = v.x;
    if (target.x < v.x) x = target.x;
    else if (target.x + target.width > v.x + v.width) x = target.x + target.width - v.width;

    let y = v.y;
    if (target.y < v.y) y = target.y;
    else if (target.y + target.height > v.y + v.height) y = target.y + target.height - v.height;

    this.scroll.panTo({ x, y });
  }
}
