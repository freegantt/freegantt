// view/ — chart shell (plans/01 §8.2-8.3). S0 scope: the minimal seam api/ needs to stay off render/
// and layout/ directly (plans/01 §1 — API --> VIEW only). The real grid/timeline/viewport split lands in S1.

import { computeFrame } from '../layout/index.js';
import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Task } from '../model/index.js';

export interface ChartOptions {
  host: HTMLElement;
  tasks: readonly Task[];
  xForInstant: (instant: number) => number;
  rowHeight: number;
}

export class Chart {
  #backend: RenderBackend;
  #revision = 0;

  constructor(private options: ChartOptions) {
    this.#backend = createDomBackend();
    this.#backend.mount(options.host);
    this.render();
  }

  render(): void {
    const frame = computeFrame({
      tasks: this.options.tasks,
      xForInstant: this.options.xForInstant,
      rowHeight: this.options.rowHeight,
      revision: this.#revision++,
    });
    this.#backend.sync(frame);
  }

  destroy(): void {
    this.#backend.destroy();
  }
}
