// layout/ owns TimeScaleModel — the standalone, shareable viewport object a Chart binds to
// (plans/01 §8.2, D9). It lives here rather than in time/ itself: it's the only DOM-free layer both
// permitted to import time/ (layout -> time is an allowed edge) and reachable from view/ and api/
// through allowed edges (view -> layout, api -> view) per the boundary lint (I1). Passing the same
// instance to two charts syncs their x-axis by construction — no event plumbing, no link manager.

import { createTimeScale, diffMs } from '../time/index.js';
import type { TimeScale, TimeScaleOptions } from '../time/index.js';
import type { Instant, Task } from '../model/index.js';

export class TimeScaleModel {
  #scale: TimeScale;

  constructor(options: TimeScaleOptions) {
    this.#scale = createTimeScale(options);
  }

  get scale(): TimeScale {
    return this.#scale;
  }
}

export interface FitProjectOptions {
  tasks: readonly Task[];
  /** Project's IANA zone (D6) — flows straight through to the resulting `TimeScale.zone`. */
  zone: string;
  /** Measured width (px) of the element the scale will render into. */
  viewportWidth: number;
}

/** `range: 'fitProject'` (plans/03 S1): derives `pxPerMs` from the project's own task span divided by
 * the viewport width, rather than a guessed default. Node-testable — the caller supplies the measured
 * width instead of this reading the DOM itself. */
export function fitProjectScale(options: FitProjectOptions): TimeScaleOptions {
  let start = Infinity as unknown as Instant;
  let end = -Infinity as unknown as Instant;
  for (const task of options.tasks) {
    if (task.start < start) start = task.start;
    if (task.end > end) end = task.end;
  }
  if (!Number.isFinite(start)) {
    start = 0 as Instant;
    end = 0 as Instant;
  }
  // Math.max(..., 1) guards divide-by-zero for a zero-span project (empty, or every task a single instant).
  const spanMs = Math.max(diffMs(end, start), 1);
  const pxPerMs = Math.max(options.viewportWidth, 0) / spanMs;
  return { zone: options.zone, range: { start, end }, pxPerMs };
}
