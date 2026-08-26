// layout/ owns TimeScaleModel — the standalone, shareable viewport object a Gantt binds to
// (plans/01 §8.2, D9). It lives here rather than in time/ itself: it's the only DOM-free layer both
// permitted to import time/ (layout -> time is an allowed edge) and reachable from view/ and api/
// through allowed edges (view -> layout, api -> view) per the boundary lint (I1). Passing the same
// instance to two Gantt instances syncs their x-axis by construction — no event plumbing, no link manager.
//
// The constructor takes *intent*, not resolved geometry (plans/02 §5). Zone, span and pixel density
// are resolved from the Gantt instances bound to the model, which is what lets one scale span a
// delivery-schedule Gantt and a workforce Gantt: neither caller has to compute a cross-dataset span
// by hand.

import {
  createTimeScale,
  dayPreset,
  diffMs,
  instant,
  pxPerMsForPreset,
  resolvePreset,
} from '../../time/index.js';
import type { PresetRef, TimeScale, TimeScaleOptions, ViewPreset } from '../../time/index.js';
import type { Dataset, Instant, TimeSpan } from '../../model/index.js';
import { BoundValue } from './bound-value.js';

/** The density mode — what `pxPerMs` resolves to (S1.9, D-S1.9-2). `'fitViewport'` (default) fits
 *  the measured pane width; `'preset'` ignores it and uses the preset's own zoom; `{ pxPerMs }` is
 *  an explicit density, what `Viewport.zoomTo`/`zoomBy` write. */
export type TimeScaleZoom = 'fitViewport' | 'preset' | { readonly pxPerMs: number };

/** What a caller states about how time should be displayed (plans/02 §5). Everything else — the
 * dataset's zone (D6), the span — is derived at bind time. */
export interface TimeScaleIntent {
  /** Governs header ticks and, with no viewport to fit, the resolved zoom. Defaults to `dayPreset`. */
  preset?: PresetRef;
  /** `'fitDataset'` (the default) spans the entries of every bound dataset; a `TimeSpan` pins the axis. */
  range?: 'fitDataset' | TimeSpan;
  /** Default `'fitViewport'`. */
  zoom?: TimeScaleZoom;
}

/** One Gantt's contribution to resolution, supplied when it binds. `readonly`, and the model copies
 * it at bind time (S1.5, #6/#22 follow-up) — a caller holding a reference cannot change the model's
 * inputs behind its back; re-measurement goes through the returned handle's `setPaneWidth` instead. */
export type ScaleBinding = Dataset & {
  /** Measured width (px) of the pane the Gantt renders its timeline into; `0` when unmeasured
   * (detached container, `display:none`, pre-paint). Unmeasured is not degenerate — see `pxPerMsForPreset`. */
  readonly paneWidth: number;
};

/** Zone used before any Gantt has bound, so `scale` is readable on a fresh model. */
const UNBOUND_ZONE = 'UTC';

/** Returned by `bind()` (#6). `unbind` leaves the shared axis; `setPaneWidth` lets a bound Gantt
 * push a re-measured width (e.g. from a `ResizeObserver`) without unbind+rebind churn. */
export interface ScaleBindingHandle {
  unbind(): void;
  setPaneWidth(width: number): void;
}

/** The model's own mutable copy of a binding — what `setPaneWidth` writes and what `#resolve` reads. */
interface MutableScaleBinding {
  timeZone: string;
  entries: Dataset['entries'];
  paneWidth: number;
}

/** What `#scaleOptions` resolves and notifies on. `options` is exactly what `createTimeScale` takes;
 * `preset` rides alongside it purely so a preset switch is visible to the D-S1.5-4 equality check —
 * `TimeScale` itself stays preset-agnostic (`ticks` takes an explicit step, per D-S1.9-4), but a
 * bound Gantt's render depends on the preset's headers too (`GanttShell.render` reads `viewport.preset`
 * alongside `viewport.timeScale`), and `pxPerMs` alone does not always change when the preset does —
 * `'fitViewport'` with a measured pane resolves the same density from any preset. Without `preset`
 * here, that combination would invalidate the memoized `TimeScale` (identity-based, unconditional)
 * but never notify a bound Gantt to re-render it. */
interface ResolvedScale {
  options: TimeScaleOptions;
  preset: ViewPreset;
}

/** Whether a resolve actually changed anything (D-S1.5-4). Compared on exactly the fields `scale`
 * (and the preset a render also depends on) are built from, so the comparison can never drift from
 * what a bound Gantt would see. Presets are frozen singletons (shipped or a caller's own object
 * passed straight through by `resolvePreset`), so reference equality is exact, not an approximation. */
function sameResolvedScale(a: ResolvedScale, b: ResolvedScale): boolean {
  return (
    a.preset === b.preset &&
    a.options.timeZone === b.options.timeZone &&
    a.options.range.start === b.options.range.start &&
    a.options.range.end === b.options.range.end &&
    a.options.pxPerMs === b.options.pxPerMs
  );
}

function sameRange(a: 'fitDataset' | TimeSpan, b: 'fitDataset' | TimeSpan): boolean {
  if (a === 'fitDataset' || b === 'fitDataset') return a === b;
  return a.start === b.start && a.end === b.end;
}

function sameZoom(a: TimeScaleZoom, b: TimeScaleZoom): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.pxPerMs === b.pxPerMs;
}

export class TimeScaleModel {
  #preset: ViewPreset;
  #range: 'fitDataset' | TimeSpan;
  #zoom: TimeScaleZoom;
  /** The bindings, the options resolved from them, and the D-S1.5-4 notification contract — one
   * object, shared with `ScrollModel` in implementation and with nothing else (`bound-value.ts`).
   * This model supplies only what is its own: how to resolve, and what counts as a change. */
  #scaleOptions = new BoundValue<MutableScaleBinding, ResolvedScale>({
    resolve: (bindings) => ({ options: this.#resolve(bindings), preset: this.#preset }),
    equals: sameResolvedScale,
  });
  /** Memoized on the identity of the options it was built from — `BoundValue` hands back the same
   * object until something invalidates it, so identity is the whole invalidation signal here. */
  #scale: TimeScale | undefined;
  #scaleBuiltFrom: TimeScaleOptions | undefined;

  constructor(intent: TimeScaleIntent = {}) {
    this.#preset = intent.preset ? resolvePreset(intent.preset) : dayPreset;
    this.#range = intent.range ?? 'fitDataset';
    this.#zoom = intent.zoom ?? 'fitViewport';
  }

  get preset(): ViewPreset {
    return this.#preset;
  }

  /** Live — every config key is live-reconfigurable (plans/02 §1.1). Resolved through
   *  `resolvePreset` (throws `UnknownPresetError` for an unknown id); no-op, no invalidation, when
   *  the resolved preset is unchanged (D-S1.9-3). */
  set preset(ref: PresetRef) {
    const resolved = resolvePreset(ref);
    if (resolved === this.#preset) return;
    this.#preset = resolved;
    this.#scaleOptions.invalidate();
  }

  get range(): 'fitDataset' | TimeSpan {
    return this.#range;
  }

  /** Live. `'fitDataset'` spans every bound dataset's entries; a `TimeSpan` pins the axis. Anchored
   *  zoom (`Viewport.zoomTo`/`zoomBy`) never writes this (D-F′) — only a caller does. */
  set range(r: 'fitDataset' | TimeSpan) {
    if (sameRange(this.#range, r)) return;
    this.#range = r;
    this.#scaleOptions.invalidate();
  }

  get zoom(): TimeScaleZoom {
    return this.#zoom;
  }

  /** Live. `'fitViewport'` (default) fits the measured pane width; `'preset'` ignores it; `{ pxPerMs }`
   *  is an explicit density (D-S1.9-2). */
  set zoom(z: TimeScaleZoom) {
    if (sameZoom(this.#zoom, z)) return;
    this.#zoom = z;
    this.#scaleOptions.invalidate();
  }

  /** Gantt instances bind at construction (after mounting their render target — see `GanttShell`,
   * #22) and call the returned handle's `unbind` on destroy. One rule, no exceptions (D-S1.5-4):
   * `bind` always notifies the newcomer — including this one — so a fresh binding gets its first
   * render even when nothing measurably changed; every other notification (another binding's
   * `bind`/`unbind`, a `setPaneWidth`) fires iff the resolved scale actually changed. It does not run
   * on a binding's own `unbind()`: the caller is tearing itself down and has no reason to react to
   * its own departure; remaining bindings still get notified. */
  bind(binding: ScaleBinding, onChange: () => void): ScaleBindingHandle {
    // Copy-at-bind (S1.5, #6/#22 follow-up): a caller holding a reference to its own binding object
    // cannot change this model's inputs behind its back; re-measurement goes through the handle.
    const copy: MutableScaleBinding = {
      timeZone: binding.timeZone,
      entries: binding.entries,
      paneWidth: binding.paneWidth,
    };
    const bound = this.#scaleOptions.bind(copy, onChange);
    return {
      unbind: () => bound.unbind(),
      setPaneWidth: (width) => {
        if (copy.paneWidth === width) return;
        copy.paneWidth = width;
        this.#scaleOptions.invalidate();
      },
    };
  }

  get scale(): TimeScale {
    const { options } = this.#scaleOptions.resolved;
    if (!this.#scale || this.#scaleBuiltFrom !== options) {
      this.#scale = createTimeScale(options);
      this.#scaleBuiltFrom = options;
    }
    return this.#scale;
  }

  /** Several writes, at most one notification, delivered iff the resolved scale actually changed
   * (D-S1.5-4). Re-entrant; flushes at the outermost exit, in a `finally` so a throwing `run` cannot
   * wedge the model (conventions §5). */
  batch(run: () => void): void {
    this.#scaleOptions.batch(run);
  }

  #resolve(bindings: Iterable<MutableScaleBinding>): TimeScaleOptions {
    // Single pass over the bound Gantt instances: zone (D6, first binding decides), the narrowest
    // measured pane (so the span fits every bound Gantt, not just the widest), and — for
    // `range: 'fitDataset'` (plans/02 §5) — the min start / max end across every bound dataset's
    // entries, all accumulated together rather than three separate walks of the same binding set.
    let timeZone: string | undefined;
    let width = 0;
    let span: TimeSpan | undefined;
    for (const binding of bindings) {
      timeZone ??= binding.timeZone;
      if (binding.paneWidth > 0 && (width === 0 || binding.paneWidth < width)) {
        width = binding.paneWidth;
      }
      if (this.#range !== 'fitDataset') continue;
      for (const entry of binding.entries) {
        if (!span) {
          span = { start: entry.start, end: entry.end };
          continue;
        }
        if (entry.start < span.start) span.start = entry.start;
        if (entry.end > span.end) span.end = entry.end;
      }
    }
    timeZone ??= UNBOUND_ZONE;
    // With nothing bound — or nothing scheduled — this collapses to a zero span at the epoch, which
    // resolves to the preset's own zoom rather than a divide-by-zero.
    const range =
      this.#range === 'fitDataset' ? (span ?? { start: instant(0), end: instant(0) }) : this.#range;
    const spanMs = diffMs(range.end, range.start);
    const pxPerMs = this.#resolvePxPerMs(timeZone, range.start, width, spanMs);
    return { timeZone, range, pxPerMs };
  }

  /** The three `TimeScaleZoom` modes (S1.9, D-S1.9-2). `'fitViewport'` is the pre-S1.9 formula,
   *  unchanged — a refinement of the preset's own zoom when there is a pane to fit, not a
   *  precondition for having one. */
  #resolvePxPerMs(timeZone: string, rangeStart: Instant, width: number, spanMs: number): number {
    if (typeof this.#zoom === 'object') return this.#zoom.pxPerMs;
    if (this.#zoom === 'preset') return pxPerMsForPreset(timeZone, this.#preset, rangeStart);
    return width > 0 && spanMs > 0 ? width / spanMs : pxPerMsForPreset(timeZone, this.#preset, rangeStart);
  }
}
