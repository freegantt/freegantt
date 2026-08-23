// view/ — chart shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1;
// this step wires up TimeScaleModel binding (D9, I12) and retires the S0 inline pixel-scale placeholder.

import { computeFrame, TimeScaleModel } from '../layout/index.js';
import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Instant, Task } from '../model/index.js';

export interface ChartOptions {
  host: HTMLElement;
  tasks: readonly Task[];
  /** Bound viewport object (D9) — pass the same instance to two charts to x-sync them. Constructs a
   * private default from the task range when omitted (plans/01 §8.2: "single-chart usage never sees
   * the concept"). */
  scale?: TimeScaleModel;
  rowHeight: number;
}

// Placeholder until Project carries a real IANA zone (D6) — every task renders on this scale's grid
// regardless, since it's linear; zone only matters once civil (day/week) presets are in play (S1 step 3+).
const DEFAULT_ZONE = 'UTC';
const DEFAULT_PX_PER_MS = 1 / (1000 * 60 * 30); // 1px per 30min, S1 placeholder default

function defaultScale(tasks: readonly Task[]): TimeScaleModel {
  let start = Infinity as unknown as Instant;
  let end = -Infinity as unknown as Instant;
  for (const task of tasks) {
    if (task.start < start) start = task.start;
    if (task.end > end) end = task.end;
  }
  if (!Number.isFinite(start)) {
    start = 0 as Instant;
    end = 0 as Instant;
  }
  return new TimeScaleModel({ zone: DEFAULT_ZONE, range: { start, end }, pxPerMs: DEFAULT_PX_PER_MS });
}

export class Chart {
  #backend: RenderBackend;
  #revision = 0;
  #scale: TimeScaleModel;

  constructor(private options: ChartOptions) {
    this.#scale = options.scale ?? defaultScale(options.tasks);
    this.#backend = createDomBackend();
    this.#backend.mount(options.host);
    this.render();
  }

  render(): void {
    const frame = computeFrame({
      tasks: this.options.tasks,
      xForInstant: (i) => this.#scale.scale.xForInstant(i),
      rowHeight: this.options.rowHeight,
      revision: this.#revision++,
    });
    this.#backend.sync(frame);
  }

  destroy(): void {
    this.#backend.destroy();
  }
}
