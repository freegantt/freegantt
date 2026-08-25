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
import type { Entry, TimeSpan } from '../../model/index.js';

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
export interface ScaleBinding {
  /** The bound dataset's IANA timeZone (D6, #37) — a scale is never told its zone by the caller. */
  readonly timeZone: string;
  readonly entries: readonly Entry[];
  /** Measured width (px) of the pane the Gantt renders its timeline into; `0` when unmeasured
   * (detached host, `display:none`, pre-paint). Unmeasured is not degenerate — see `pxPerMsForPreset`. */
  readonly paneWidth: number;
}

/** Zone used before any Gantt has bound, so `scale` is readable on a fresh model. */
const UNBOUND_ZONE = 'UTC';

/** Returned by `bind()` (#6). `unbind` leaves the shared axis; `setPaneWidth` lets a bound Gantt
 * push a re-measured width (e.g. from a `ResizeObserver`) without unbind+rebind churn. */
export interface ScaleBindingHandle {
  unbind(): void;
  setPaneWidth(width: number): void;
}

/** The fields `TimeScaleModel` compares to decide whether a resolve actually changed anything
 * (D-S1.5-4) — shared shape with `#resolve`'s return so the comparison can never drift from what
 * `scale` is actually built from. */
interface Resolution {
  timeZone: string;
  start: number;
  end: number;
  pxPerMs: number;
}

function sameResolution(a: Resolution, b: Resolution): boolean {
  return a.timeZone === b.timeZone && a.start === b.start && a.end === b.end && a.pxPerMs === b.pxPerMs;
}

export class TimeScaleModel {
  #preset: ViewPreset;
  #range: 'fitDataset' | TimeSpan;
  /** Each bound Gantt's data alongside the reaction it supplied at bind time — one collection serves
   * both resolution (iterate keys) and change notification (iterate values), so there is no second,
   * separately-fanned-out subscriber list to keep in sync with binding membership. Keyed by the
   * handle's private mutable copy, not the caller's binding object (readonly, copied at bind time). */
  #bindings = new Map<{ timeZone: string; entries: readonly Entry[]; paneWidth: number }, () => void>();
  #resolved: TimeScale | undefined;
  #lastResolution: Resolution | undefined;
  #batchDepth = 0;
  #pendingNotify = false;

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
   * its own departure; remaining bindings still get notified (`#invalidate`). */
  bind(binding: ScaleBinding, onChange: () => void): ScaleBindingHandle {
    const copy = { timeZone: binding.timeZone, entries: binding.entries, paneWidth: binding.paneWidth };
    this.#bindings.set(copy, onChange);
    this.#resolved = undefined;
    // The newcomer always hears about its own bind (D-S1.5-4) — that IS its first render — even when
    // the resolved scale did not move (e.g. a second binding with identical content). Every other
    // bound reaction only hears about it when the resolution actually changed.
    const next = this.#resolveFields();
    const changed = !this.#lastResolution || !sameResolution(this.#lastResolution, next);
    this.#lastResolution = next;
    onChange();
    if (changed) {
      for (const [otherBinding, otherOnChange] of this.#bindings) {
        if (otherBinding !== copy) otherOnChange();
      }
    }
    return {
      unbind: () => {
        if (this.#bindings.delete(copy)) this.#invalidate();
      },
      setPaneWidth: (width) => {
        if (copy.paneWidth === width) return;
        copy.paneWidth = width;
        this.#invalidate();
      },
    };
  }

  get scale(): TimeScale {
    return (this.#resolved ??= createTimeScale(this.#resolve()));
  }

  /** Several writes, at most one notification, delivered iff the resolved scale actually changed
   * (D-S1.5-4). Re-entrant; flushes at the outermost exit, in a `finally` so a throwing `run` cannot
   * wedge the model (conventions §5). */
  batch(run: () => void): void {
    this.#batchDepth++;
    try {
      run();
    } finally {
      this.#batchDepth--;
      if (this.#batchDepth === 0 && this.#pendingNotify) {
        this.#pendingNotify = false;
        this.#notifyAll();
      }
    }
  }

  #invalidate(): void {
    this.#resolved = undefined;
    if (this.#batchDepth > 0) {
      this.#pendingNotify = true;
      return;
    }
    this.#notifyAll();
  }

  /** Resolves once and compares against the last delivered resolution (D-S1.5-4): notifies every
   * bound reaction iff the value changed. Used by `unbind`/`setPaneWidth`/`batch` flush; `bind()`
   * has its own pass because it must notify the newcomer unconditionally. */
  #notifyAll(): void {
    const next = this.#resolveFields();
    const changed = !this.#lastResolution || !sameResolution(this.#lastResolution, next);
    this.#lastResolution = next;
    if (!changed) return;
    for (const onChange of this.#bindings.values()) onChange();
  }

  #resolveFields(): Resolution {
    const options = this.#resolve();
    return {
      timeZone: options.timeZone,
      start: options.range.start,
      end: options.range.end,
      pxPerMs: options.pxPerMs,
    };
  }

  #resolve(): TimeScaleOptions {
    // Single pass over the bound Gantt instances: zone (D6, first binding decides), the narrowest
    // measured pane (so the span fits every bound Gantt, not just the widest), and — for
    // `range: 'fitDataset'` (plans/02 §5) — the min start / max end across every bound dataset's
    // entries, all accumulated together rather than three separate walks of the same binding set.
    let timeZone: string | undefined;
    let width = 0;
    let span: TimeSpan | undefined;
    for (const binding of this.#bindings.keys()) {
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
