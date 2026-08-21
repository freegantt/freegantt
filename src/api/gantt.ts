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
    this.#chart = new Chart({
      host: options.host,
      tasks: options.project.tasks,
      xForInstant: (instant) => instant * pxPerMs,
      rowHeight: options.rowHeight ?? DEFAULT_ROW_HEIGHT,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#chart.destroy();
    this.#destroyed = true;
  }
}
