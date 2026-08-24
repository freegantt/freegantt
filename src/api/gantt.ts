// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell, TimeScaleModel } from '../view/index.js';
import type { Dataset } from './dataset.js';

export interface GanttOptions {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  host: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9, plans/02 §5) — omit for a private default sized to the dataset's entries. */
  scale?: TimeScaleModel;
}

export class Gantt {
  #shell: GanttShell;
  #destroyed = false;

  constructor(options: GanttOptions) {
    this.#shell = new GanttShell({
      host: options.host,
      dataset: options.dataset,
      ...(options.scale ? { scale: options.scale } : {}),
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#shell.destroy();
    this.#destroyed = true;
  }
}
