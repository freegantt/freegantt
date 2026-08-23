// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own chart and state so two charts on one page are fully independent.

import { Chart } from '../view/index.js';
import type { Project } from './project.js';

export interface GanttOptions {
  host: HTMLElement;
  project: Project;
  /** Pixels per millisecond — stands in for the real TimeScale, which lands in S1 (plans/03 S1). */
  pxPerMs?: number;
  rowHeight?: number;
}

const DEFAULT_PX_PER_MS = 1 / (1000 * 60 * 60); // 1px per hour, S0 placeholder only
const DEFAULT_ROW_HEIGHT = 32;

export class Gantt {
  #chart: Chart;
  #destroyed = false;

  constructor(options: GanttOptions) {
    const pxPerMs = options.pxPerMs ?? DEFAULT_PX_PER_MS;
    // S0 placeholder: anchor pixel 0 at the project's earliest task start. The real
    // TimeScale (S1) replaces this whole closure, origin included.
    const origin = options.project.tasks.reduce((min, task) => Math.min(min, task.start), Infinity);
    this.#chart = new Chart({
      host: options.host,
      tasks: options.project.tasks,
      xForInstant: (instant) => (instant - origin) * pxPerMs,
      rowHeight: options.rowHeight ?? DEFAULT_ROW_HEIGHT,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#chart.destroy();
    this.#destroyed = true;
  }
}
