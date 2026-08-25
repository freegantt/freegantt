// layout/ owns Viewport — the fan-in over TimeScaleModel and ScrollModel (plans/01 §8.2, D-S1.7-1).
// One bind, one handle, one reaction: a shell that held both models separately (S1.5) also held two
// reactions, which is R1's god object arriving on schedule the moment a third model (pane-size
// measurement, #8) joins them. Viewport exists so `view/` never holds more than one.

import { TimeScaleModel } from './time-scale-model.js';
import type { ScaleBinding, ScaleBindingHandle } from './time-scale-model.js';
import { ScrollModel } from './scroll-model.js';
import type { ScrollBindingHandle } from './scroll-model.js';
import type { TimeScale, ViewPreset } from '../../time/index.js';
import type { Dataset, Rect, Size } from '../../model/index.js';
import type { Overscan } from '../frame.js';

export interface ViewportOptions {
  /** Private defaults when omitted — single-Gantt usage never meets either concept (plans/01 §8.2). */
  scale?: TimeScaleModel;
  scroll?: ScrollModel;
  overscan?: Overscan;
}

/** @internal — view/ only. Binding handle shape, per conventions §4. */
export interface ViewportHandle {
  unbind(): void;
  /** The timeline pane's measured drawable box. Fans out to `paneWidth`, `ScrollBinding.pane`, and
   *  `visible.width`/`height`. */
  setPaneSize(size: Size): void;
  /** Post-render extents from the frame. Fans out to `ScrollBinding.content`. */
  setContentSize(size: Size): void;
}

const DEFAULT_OVERSCAN: Required<Overscan> = { verticalRows: 2, horizontalPx: 128 };

function sameOverscan(a: Overscan, b: Overscan): boolean {
  const aRows = a.verticalRows ?? DEFAULT_OVERSCAN.verticalRows;
  const bRows = b.verticalRows ?? DEFAULT_OVERSCAN.verticalRows;
  const aPx = a.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx;
  const bPx = b.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx;
  return aRows === bRows && aPx === bPx;
}

const ZERO_SIZE: Size = { width: 0, height: 0 };

export class Viewport {
  readonly scale: TimeScaleModel;
  readonly scroll: ScrollModel;
  #overscan: Overscan;
  #paneSize: Size = ZERO_SIZE;
  #contentSize: Size = ZERO_SIZE;
  #onChange: (() => void) | undefined;
  // Coalesces notifications from BOTH sub-models into one host reaction (D-S1.7-1): scale and
  // scroll each already dedupe within themselves (D-S1.5-4), but a single setPaneSize touches both,
  // and without this layer each would flush its own notification for the same caller-visible change.
  #coalesceDepth = 0;
  #pendingNotify = false;

  constructor(options: ViewportOptions = {}) {
    this.scale = options.scale ?? new TimeScaleModel();
    this.scroll = options.scroll ?? new ScrollModel();
    this.#overscan = options.overscan ?? {};
  }

  #notify = (): void => {
    if (this.#coalesceDepth > 0) {
      this.#pendingNotify = true;
      return;
    }
    this.#onChange?.();
  };

  #coalesced(run: () => void): void {
    this.#coalesceDepth++;
    try {
      run();
    } finally {
      this.#coalesceDepth--;
      if (this.#coalesceDepth === 0 && this.#pendingNotify) {
        this.#pendingNotify = false;
        this.#onChange?.();
      }
    }
  }

  /** One subscription for both models: the shell reacts once, not twice (D-S1.7-1). */
  bind(dataset: Dataset, onChange: () => void): ViewportHandle {
    this.#onChange = onChange;
    const scaleBinding: ScaleBinding = {
      entries: dataset.entries,
      timeZone: dataset.timeZone,
      paneWidth: this.#paneSize.width,
    };
    const scaleHandle: ScaleBindingHandle = this.scale.bind(scaleBinding, this.#notify);
    const scrollHandle: ScrollBindingHandle = this.scroll.bind(
      { content: this.#contentSize, pane: this.#paneSize },
      this.#notify,
    );

    return {
      unbind: () => {
        scaleHandle.unbind();
        scrollHandle.unbind();
        this.#onChange = undefined;
      },
      setPaneSize: (size) => {
        this.#paneSize = size;
        this.#coalesced(() => {
          scaleHandle.setPaneWidth(size.width);
          scrollHandle.setPaneSize(size);
        });
      },
      setContentSize: (size) => {
        this.#contentSize = size;
        this.#coalesced(() => scrollHandle.setContentSize(size));
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

  /** Several writes, one host reaction. Re-entrant, flushes in a `finally` (conventions §5).
   *  First caller is S1.9's `zoomTo` (D-S1.7-10). */
  batch(run: () => void): void {
    this.#coalesced(() => this.scale.batch(() => this.scroll.batch(run)));
  }
}
