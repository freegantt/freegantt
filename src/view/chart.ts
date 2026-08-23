// view/ — chart shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1;
// this step adds the header band, rendering TimeScale.ticks() above the bars.

import { computeFrame, dayPreset, fitProjectScale, TimeScaleModel } from '../layout/index.js';
import type { ViewPreset } from '../layout/index.js';
import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Task } from '../model/index.js';

export interface ChartOptions {
  host: HTMLElement;
  tasks: readonly Task[];
  /** Project's IANA zone (D6) — used to build the default scale (`range: 'fitProject'`) when `scale`
   * is omitted; ignored otherwise, since an explicit scale carries its own zone. */
  zone: string;
  /** Bound viewport object (D9) — pass the same instance to two charts to x-sync them. Constructs a
   * private default from the task range when omitted (plans/01 §8.2: "single-chart usage never sees
   * the concept"). */
  scale?: TimeScaleModel;
  /** Governs header ticks (plans/01 §5.1). Preset switching lands in S1 step 7; defaults to `dayPreset`. */
  preset?: ViewPreset;
  rowHeight: number;
}

export class Chart {
  #backend: RenderBackend;
  #revision = 0;
  #scale: TimeScaleModel;
  #preset: ViewPreset;
  #headerEl: HTMLElement;
  #barsHost: HTMLElement;

  constructor(private options: ChartOptions) {
    this.#scale =
      options.scale ??
      new TimeScaleModel(
        fitProjectScale({
          tasks: options.tasks,
          zone: options.zone,
          viewportWidth: options.host.clientWidth,
        }),
      );
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
