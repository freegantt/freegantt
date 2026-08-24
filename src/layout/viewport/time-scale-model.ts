// layout/ owns TimeScaleModel — the standalone, shareable viewport object a Gantt binds to
// (plans/01 §8.2, D9). It lives here rather than in time/ itself: it's the only DOM-free layer both
// permitted to import time/ (layout -> time is an allowed edge) and reachable from view/ and api/
// through allowed edges (view -> layout, api -> view) per the boundary lint (I1). Passing the same
// instance to two Gantt instances syncs their x-axis by construction — no event plumbing, no link manager.
//
// The constructor takes *intent*, not resolved geometry (plans/02 §5). Zone, span and pixel density
// are resolved from the Gantt instances bound to the model, which is what lets one scale span a
// delivery-schedule Gantt and a workforce Gantt: neither caller has to compute a cross-project span
// by hand.

import { createTimeScale, dayPreset, diffMs, instant, pxPerMsForPreset } from '../../time/index.js';
import type { TimeScale, TimeScaleOptions, ViewPreset } from '../../time/index.js';
import type { Entry, TimeSpan } from '../../model/index.js';

/** What a caller states about how time should be displayed (plans/02 §5). Everything else — the
 * project's zone (D6), the span, the pixels-per-millisecond factor — is derived at bind time. */
export interface TimeScaleIntent {
  /** Governs header ticks and, with no viewport to fit, the resolved zoom. Defaults to `dayPreset`. */
  preset?: ViewPreset;
  /** `'fitProject'` (the default) spans the entries of every bound project; a `TimeSpan` pins the axis. */
  range?: 'fitProject' | TimeSpan;
}

/** One Gantt's contribution to resolution, supplied when it binds. */
export interface ScaleBinding {
  /** The bound project's IANA zone (D6) — a scale is never told its zone by the caller. */
  zone: string;
  entries: readonly Entry[];
  /** Measured width (px) of the element the Gantt renders into; `0` when unmeasured (detached host,
   * `display:none`, pre-paint). Unmeasured is not degenerate — see `pxPerMsForPreset`. */
  viewportWidth: number;
}

/** Zone used before any Gantt has bound, so `scale` is readable on a fresh model. */
const UNBOUND_ZONE = 'UTC';

/** Returned by `bind()` (#6). `unbind` leaves the shared axis; `setViewportWidth` lets a bound Gantt
 * push a re-measured width (e.g. from a `ResizeObserver`) without unbind+rebind churn. */
export interface ScaleBindingHandle {
  unbind(): void;
  setViewportWidth(width: number): void;
}

export class TimeScaleModel {
  #preset: ViewPreset;
  #range: 'fitProject' | TimeSpan;
  /** Each bound Gantt's data alongside the reaction it supplied at bind time — one collection serves
   * both resolution (iterate keys) and change notification (iterate values), so there is no second,
   * separately-fanned-out subscriber list to keep in sync with binding membership. */
  #bindings = new Map<ScaleBinding, () => void>();
  #resolved: TimeScale | undefined;

  constructor(intent: TimeScaleIntent = {}) {
    this.#preset = intent.preset ?? dayPreset;
    this.#range = intent.range ?? 'fitProject';
  }

  get preset(): ViewPreset {
    return this.#preset;
  }

  /** Gantt instances bind at construction and call the returned handle's `unbind` on destroy.
   * `onChange` runs whenever the resolved scale may have changed on account of *another* bound
   * Gantt — one joining, one leaving, or a width it pushed — so every other bound instance follows
   * without wiring a subscription itself. It never runs for a binding's own `bind()` or `unbind()`:
   * not on bind, because the caller is still constructing (e.g. `GanttShell` hasn't mounted its
   * render target yet) and renders itself explicitly once construction finishes; not on unbind,
   * because the caller is tearing itself down and has no reason to react to its own departure. A
   * binding's own width push *does* run its own `onChange` (via `setViewportWidth`), since that's
   * a live re-measure during normal operation, not construction or teardown. */
  bind(binding: ScaleBinding, onChange: () => void): ScaleBindingHandle {
    const priorReactions = [...this.#bindings.values()];
    this.#bindings.set(binding, onChange);
    this.#resolved = undefined;
    for (const react of priorReactions) react();
    return {
      unbind: () => {
        if (this.#bindings.delete(binding)) this.#invalidate();
      },
      setViewportWidth: (width) => {
        if (binding.viewportWidth === width) return;
        binding.viewportWidth = width;
        this.#invalidate();
      },
    };
  }

  get scale(): TimeScale {
    return (this.#resolved ??= createTimeScale(this.#resolve()));
  }

  #invalidate(): void {
    this.#resolved = undefined;
    for (const onChange of this.#bindings.values()) onChange();
  }

  #resolve(): TimeScaleOptions {
    // Single pass over the bound Gantt instances: zone (D6, first binding decides), the narrowest
    // measured viewport (so the span fits every bound Gantt, not just the widest), and — for
    // `range: 'fitProject'` (plans/02 §5) — the min start / max end across every bound project's
    // entries, all accumulated together rather than three separate walks of the same binding set.
    let zone: string | undefined;
    let width = 0;
    let span: TimeSpan | undefined;
    for (const binding of this.#bindings.keys()) {
      zone ??= binding.zone;
      if (binding.viewportWidth > 0 && (width === 0 || binding.viewportWidth < width)) {
        width = binding.viewportWidth;
      }
      if (this.#range !== 'fitProject') continue;
      for (const entry of binding.entries) {
        if (!span) {
          span = { start: entry.start, end: entry.end };
          continue;
        }
        if (entry.start < span.start) span.start = entry.start;
        if (entry.end > span.end) span.end = entry.end;
      }
    }
    zone ??= UNBOUND_ZONE;
    // With nothing bound — or nothing scheduled — this collapses to a zero span at the epoch, which
    // resolves to the preset's own zoom rather than a divide-by-zero.
    const range =
      this.#range === 'fitProject' ? (span ?? { start: instant(0), end: instant(0) }) : this.#range;
    const spanMs = diffMs(range.end, range.start);
    // Fit-to-width is a refinement of the preset's own zoom, not a precondition for having one.
    const pxPerMs =
      width > 0 && spanMs > 0 ? width / spanMs : pxPerMsForPreset(zone, this.#preset, range.start);
    return { zone, range, pxPerMs };
  }
}
