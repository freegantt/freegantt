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

import { createTimeScale, dayPreset, diffMs, instant, pxPerMsForPreset } from '../../time/index.js';
import type { TimeScale, TimeScaleOptions, ViewPreset } from '../../time/index.js';
import type { Dataset, TimeSpan } from '../../model/index.js';
import { BoundValue } from './bound-value.js';

/** What a caller states about how time should be displayed (plans/02 §5). Everything else — the
 * dataset's zone (D6), the span, the pixels-per-millisecond factor — is derived at bind time. */
export interface TimeScaleIntent {
  /** Governs header ticks and, with no viewport to fit, the resolved zoom. Defaults to `dayPreset`. */
  preset?: ViewPreset;
  /** `'fitDataset'` (the default) spans the entries of every bound dataset; a `TimeSpan` pins the axis. */
  range?: 'fitDataset' | TimeSpan;
}

/** One Gantt's contribution to resolution, supplied when it binds. `readonly`, and the model copies
 * it at bind time (S1.5, #6/#22 follow-up) — a caller holding a reference cannot change the model's
 * inputs behind its back; re-measurement goes through the returned handle's `setPaneWidth` instead. */
export type ScaleBinding = Dataset & {
  /** Measured width (px) of the pane the Gantt renders its timeline into; `0` when unmeasured
   * (detached host, `display:none`, pre-paint). Unmeasured is not degenerate — see `pxPerMsForPreset`. */
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

/** Whether a resolve actually changed anything (D-S1.5-4). Compared on exactly the fields `scale` is
 * built from, so the comparison can never drift from what a bound Gantt would see. */
function sameScaleOptions(a: TimeScaleOptions, b: TimeScaleOptions): boolean {
  return (
    a.timeZone === b.timeZone &&
    a.range.start === b.range.start &&
    a.range.end === b.range.end &&
    a.pxPerMs === b.pxPerMs
  );
}

export class TimeScaleModel {
  #preset: ViewPreset;
  #range: 'fitDataset' | TimeSpan;
  /** The bindings, the options resolved from them, and the D-S1.5-4 notification contract — one
   * object, shared with `ScrollModel` in implementation and with nothing else (`bound-value.ts`).
   * This model supplies only what is its own: how to resolve, and what counts as a change. */
  #options = new BoundValue<MutableScaleBinding, TimeScaleOptions>({
    resolve: (bindings) => this.#resolve(bindings),
    equals: sameScaleOptions,
  });
  /** Memoized on the identity of the resolved options — `BoundValue` hands back the same object
   * until something invalidates it, so identity is the whole invalidation signal here. */
  #scale: TimeScale | undefined;
  #scaleOf: TimeScaleOptions | undefined;

  constructor(intent: TimeScaleIntent = {}) {
    this.#preset = intent.preset ?? dayPreset;
    this.#range = intent.range ?? 'fitDataset';
  }

  get preset(): ViewPreset {
    return this.#preset;
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
    const bound = this.#options.bind(copy, onChange);
    return {
      unbind: () => bound.unbind(),
      setPaneWidth: (width) => {
        if (copy.paneWidth === width) return;
        copy.paneWidth = width;
        this.#options.invalidate();
      },
    };
  }

  get scale(): TimeScale {
    const options = this.#options.resolved;
    if (!this.#scale || this.#scaleOf !== options) {
      this.#scale = createTimeScale(options);
      this.#scaleOf = options;
    }
    return this.#scale;
  }

  /** Several writes, at most one notification, delivered iff the resolved scale actually changed
   * (D-S1.5-4). Re-entrant; flushes at the outermost exit, in a `finally` so a throwing `run` cannot
   * wedge the model (conventions §5). */
  batch(run: () => void): void {
    this.#options.batch(run);
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
    // Fit-to-width is a refinement of the preset's own zoom, not a precondition for having one.
    const pxPerMs =
      width > 0 && spanMs > 0 ? width / spanMs : pxPerMsForPreset(timeZone, this.#preset, range.start);
    return { timeZone, range, pxPerMs };
  }
}
