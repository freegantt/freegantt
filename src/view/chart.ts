// view/ — chart shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1;
// this step adds the header band, rendering TimeScale.ticks() above the bars.

import { computeFrame, dayPreset, TimeScaleModel } from '../layout/index.js';
import type { ViewPreset } from '../layout/index.js';
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
  /** Governs header ticks (plans/01 §5.1). Preset switching lands in S1 step 7; defaults to `dayPreset`. */
  preset?: ViewPreset;
  rowHeight: number;
}

// PLACEHOLDER (resolve before S1 closes — plans/03 S1 acceptance gate): until Project carries a real
// IANA zone (D6), every task renders on this scale's grid regardless, since it's linear; zone only
// matters once calendar (day/week) presets are in play.
const DEFAULT_ZONE = 'UTC';
// PLACEHOLDER (resolve before S1 closes — plans/03 S1 acceptance gate): 1px per 30min is an arbitrary
// default pending S1's real default-scale derivation from project range + viewport width.
const DEFAULT_PX_PER_MS = 1 / (1000 * 60 * 30);

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
  #preset: ViewPreset;
  #headerEl: HTMLElement;
  #barsHost: HTMLElement;

  constructor(private options: ChartOptions) {
    this.#scale = options.scale ?? defaultScale(options.tasks);
    this.#preset = options.preset ?? dayPreset;

    this.#headerEl = document.createElement('div');
    this.#headerEl.className = 'fg-header';
    this.#headerEl.style.position = 'relative';
    this.#barsHost = document.createElement('div');
    this.#barsHost.className = 'fg-bars-host';
    this.#barsHost.style.position = 'relative';
    options.host.replaceChildren(this.#headerEl, this.#barsHost);

    this.#backend = createDomBackend();
    this.#backend.mount(this.#barsHost);
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
    this.#renderHeader();
  }

  #renderHeader(): void {
    const scale = this.#scale.scale;
    const ticks = scale.ticks(this.#preset);
    const format = this.#preset.headers[0]?.format;
    this.#headerEl.replaceChildren(
      ...ticks.map((tick) => {
        const el = document.createElement('div');
        el.className = 'fg-tick';
        el.style.position = 'absolute';
        el.style.transform = `translateX(${tick.x}px)`;
        el.textContent = format ? format(tick.instant, scale.zone) : '';
        return el;
      }),
    );
  }

  destroy(): void {
    this.#backend.destroy();
    this.options.host.replaceChildren();
  }
}
