// layout/ owns TimeScaleModel — the standalone, shareable viewport object a Gantt binds to
// (plans/01 §8.2, D9). It lives here rather than in time/ itself: it's the only DOM-free layer both
// permitted to import time/ (layout -> time is an allowed edge) and reachable from view/ and api/
// through allowed edges (view -> layout, api -> view) per the boundary lint (I1). Passing the same
// instance to two Gantt instances syncs their x-axis by construction — no event plumbing, no link manager.
//
// The constructor takes *intent*, not resolved geometry (plans/02 §5). Zone, span and pixel density
// are resolved from the Gantt instances bound to the model, which is what lets one scale span a task
// Gantt and a workforce Gantt: neither caller has to compute a cross-project span by hand.

import { createTimeScale, dayPreset, diffMs, instant, pxPerMsForPreset } from '../../time/index.js';
import type { TimeScale, TimeScaleOptions, ViewPreset } from '../../time/index.js';
import type { Task, TimeSpan } from '../../model/index.js';
import { createObservable } from './observable.js';

/** What a caller states about how time should be displayed (plans/02 §5). Everything else — the
 * project's zone (D6), the span, the pixels-per-millisecond factor — is derived at bind time. */
export interface TimeScaleIntent {
  /** Governs header ticks and, with no viewport to fit, the resolved zoom. Defaults to `dayPreset`. */
  preset?: ViewPreset;
  /** `'fitProject'` (the default) spans the tasks of every bound project; a `TimeSpan` pins the axis. */
  range?: 'fitProject' | TimeSpan;
}

/** One Gantt's contribution to resolution, supplied when it binds. */
export interface ScaleBinding {
  /** The bound project's IANA zone (D6) — a scale is never told its zone by the caller. */
  zone: string;
  tasks: readonly Task[];
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
  #bindings = new Set<ScaleBinding>();
  #resolved: TimeScale | undefined;
  #observable = createObservable();

  constructor(intent: TimeScaleIntent = {}) {
    this.#preset = intent.preset ?? dayPreset;
    this.#range = intent.range ?? 'fitProject';
  }

  get preset(): ViewPreset {
    return this.#preset;
  }

  /** Registers `fn` to run whenever the resolved scale may have changed (bind, unbind, or a bound
   * width changing). Returns a dispose function. */
  subscribe(fn: () => void): () => void {
    return this.#observable.subscribe(fn);
  }

  /** Gantt instances bind at construction and call the returned handle's `unbind` on destroy. Binding
   * and unbinding both invalidate the resolved scale and notify subscribers, so every other bound
   * Gantt follows a project joining or leaving the shared axis. */
  bind(binding: ScaleBinding): ScaleBindingHandle {
    this.#bindings.add(binding);
    this.#resolved = undefined;
    this.#observable.notify();
    return {
      unbind: () => {
        if (this.#bindings.delete(binding)) {
          this.#resolved = undefined;
          this.#observable.notify();
        }
      },
      setViewportWidth: (width) => {
        if (binding.viewportWidth === width) return;
        binding.viewportWidth = width;
        this.#resolved = undefined;
        this.#observable.notify();
      },
    };
  }

  get scale(): TimeScale {
    return (this.#resolved ??= createTimeScale(this.#resolve()));
  }

  #resolve(): TimeScaleOptions {
    const bindings = [...this.#bindings];
    // D6: the zone is the project's. Gantt instances sharing an axis share a project zone in practice; the
    // first binding decides, rather than the axis silently having two calendars.
    const zone = bindings[0]?.zone ?? UNBOUND_ZONE;
    const range = this.#range === 'fitProject' ? boundSpan(bindings) : this.#range;
    const spanMs = diffMs(range.end, range.start);
    const width = fitWidth(bindings);
    // Fit-to-width is a refinement of the preset's own zoom, not a precondition for having one.
    const pxPerMs =
      width > 0 && spanMs > 0 ? width / spanMs : pxPerMsForPreset(zone, this.#preset, range.start);
    return { zone, range, pxPerMs };
  }
}

/** The narrowest measured viewport across the bound Gantt instances, so the span fits in all of them rather
 * than only the widest. `0` when nothing is measured yet. */
function fitWidth(bindings: readonly ScaleBinding[]): number {
  let width = 0;
  for (const binding of bindings) {
    if (binding.viewportWidth <= 0) continue;
    if (width === 0 || binding.viewportWidth < width) width = binding.viewportWidth;
  }
  return width;
}

/** `range: 'fitProject'` (plans/02 §5): min start / max end across every bound project's tasks. With
 * nothing bound — or nothing scheduled — this collapses to a zero span at the epoch, which resolves
 * to the preset's own zoom rather than a divide-by-zero. */
function boundSpan(bindings: readonly ScaleBinding[]): TimeSpan {
  let span: TimeSpan | undefined;
  for (const binding of bindings) {
    for (const task of binding.tasks) {
      if (!span) {
        span = { start: task.start, end: task.end };
        continue;
      }
      if (task.start < span.start) span.start = task.start;
      if (task.end > span.end) span.end = task.end;
    }
  }
  return span ?? { start: instant(0), end: instant(0) };
}
