// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own chart and state so two charts on one page are fully independent.

import { Chart, TimeScaleModel } from '../view/index.js';
import type { Project } from './project.js';

export interface GanttOptions {
  host: HTMLElement;
  project: Project;
  /** Bound viewport object (D9, plans/02 §5) — omit for a private default sized to the project's tasks. */
  scale?: TimeScaleModel;
  rowHeight?: number;
}

const DEFAULT_ROW_HEIGHT = 32;

export class Gantt {
  #chart: Chart;
  #destroyed = false;

  constructor(options: GanttOptions) {
    this.#chart = new Chart({
      host: options.host,
      tasks: options.project.tasks,
      ...(options.scale ? { scale: options.scale } : {}),
      rowHeight: options.rowHeight ?? DEFAULT_ROW_HEIGHT,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#chart.destroy();
    this.#destroyed = true;
  }
}
