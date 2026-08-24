// view/ — Gantt shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1;
// this step adds the header band, rendering TimeScale.ticks() above the bars.

import { computeFrame, TimeScaleModel } from '../layout/index.js';
import type { ScaleBindingHandle, TimeScale } from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Entry } from '../model/index.js';

export interface GanttShellOptions {
  host: HTMLElement;
  entries: readonly Entry[];
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

function createPane(className: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.position = 'relative';
  return el;
}

export class GanttShell {
  #backend: RenderBackend;
  #revision = 0;
  #scale: TimeScaleModel;
  #scaleHandle: ScaleBindingHandle;
  #headerEl: HTMLElement;
  #barsHost: HTMLElement;

  constructor(private options: GanttShellOptions) {
    this.#scale = options.scale ?? new TimeScaleModel();
    this.#scaleHandle = this.#scale.bind(
      {
        zone: options.zone,
        entries: options.entries,
        viewportWidth: options.host.clientWidth,
      },
      () => this.render(),
    );

    this.#headerEl = createPane('fg-header');
    this.#barsHost = createPane('fg-bars-host');
    options.host.replaceChildren(this.#headerEl, this.#barsHost);

    this.#backend = createDomBackend();
    this.#backend.mount(this.#barsHost);
    this.render();
  }

  render(): void {
    const scale = this.#scale.scale;
    const frame = computeFrame({
      entries: this.options.entries,
      xForInstant: (i) => scale.xForInstant(i),
      rowHeight: this.options.rowHeight,
      revision: this.#revision++,
    });
    this.#backend.sync(frame);
    this.#renderHeader(scale);
  }

  #renderHeader(scale: TimeScale): void {
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
    this.#scaleHandle.unbind();
    this.#backend.destroy();
    this.options.host.replaceChildren();
  }
}
