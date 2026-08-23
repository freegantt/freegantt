// view/ — Gantt shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1;
// this step adds the header band, rendering TimeScale.ticks() above the bars.

import { computeFrame, TimeScaleModel } from '../layout/index.js';
import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Task } from '../model/index.js';

export interface GanttShellOptions {
  host: HTMLElement;
  tasks: readonly Task[];
  /** Project's IANA zone (D6) — contributed to the scale binding, which resolves calendar stepping
   * and header formatting through it. */
  zone: string;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"); the default resolves its zone, span and zoom from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  rowHeight: number;
}

export class GanttShell {
  #backend: RenderBackend;
  #revision = 0;
  #scale: TimeScaleModel;
  #unbindScale: () => void;
  #headerEl: HTMLElement;
  #barsHost: HTMLElement;

  constructor(private options: GanttShellOptions) {
    this.#scale = options.scale ?? new TimeScaleModel();
    this.#unbindScale = this.#scale.bind({
      zone: options.zone,
      tasks: options.tasks,
      viewportWidth: options.host.clientWidth,
    });

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
    const preset = this.#scale.preset;
    const ticks = scale.ticks(preset);
    const format = preset.headers[0]?.format;
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
    this.#unbindScale();
    this.#backend.destroy();
    this.options.host.replaceChildren();
  }
}
