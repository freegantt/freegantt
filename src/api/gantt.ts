// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell, ScrollModel, TimeScaleModel } from '../view/index.js';
import type { GanttEventMap, Overscan, PresetRef, TimeScaleZoom, ViewPreset } from '../view/index.js';
import type { EntryId, TimeSpan } from '../model/index.js';
import type { Dataset } from './dataset.js';

export interface GanttOptions {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  host: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9, plans/02 §5) — omit for a private default sized to the dataset's entries. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9) — omit for a private default. Sharing one instance links both axes
   * (S1.5 README D-S1.5-3). */
  scroll?: ScrollModel;
  /** Initial grid pane width in px (S1.8). Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Build the private default `TimeScaleModel` only (D-S1.9-9) — a no-op, with a dev-mode warning,
   * when `scale` is also supplied. */
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  zoom?: TimeScaleZoom;
  overscan?: Overscan;
}

export class Gantt {
  #shell: GanttShell;
  #destroyed = false;

  constructor(options: GanttOptions) {
    this.#shell = new GanttShell({
      host: options.host,
      dataset: options.dataset,
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.scroll ? { scroll: options.scroll } : {}),
      ...(options.gridWidth !== undefined ? { gridWidth: options.gridWidth } : {}),
      ...(options.preset !== undefined ? { preset: options.preset } : {}),
      ...(options.range !== undefined ? { range: options.range } : {}),
      ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
      ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    });
  }

  get gridWidth(): number {
    return this.#shell.gridWidth;
  }

  set gridWidth(px: number) {
    this.#shell.gridWidth = px;
  }

  get preset(): ViewPreset {
    return this.#shell.preset;
  }

  set preset(ref: PresetRef) {
    this.#shell.preset = ref;
  }

  get range(): 'fitDataset' | TimeSpan {
    return this.#shell.range;
  }

  set range(r: 'fitDataset' | TimeSpan) {
    this.#shell.range = r;
  }

  get zoom(): TimeScaleZoom {
    return this.#shell.zoom;
  }

  set zoom(z: TimeScaleZoom) {
    this.#shell.zoom = z;
  }

  get overscan(): Overscan {
    return this.#shell.overscan;
  }

  set overscan(o: Overscan) {
    this.#shell.overscan = o;
  }

  zoomTo(pxPerMs: number, anchorX?: number): void {
    this.#shell.zoomTo(pxPerMs, anchorX);
  }

  zoomBy(factor: number, anchorX?: number): void {
    this.#shell.zoomBy(factor, anchorX);
  }

  reveal(entryId: EntryId): void {
    this.#shell.reveal(entryId);
  }

  on<K extends keyof GanttEventMap>(name: K, handler: (payload: GanttEventMap[K]) => void | false): void {
    this.#shell.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: (payload: GanttEventMap[K]) => void | false): void {
    this.#shell.off(name, handler);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#shell.destroy();
    this.#destroyed = true;
  }
}
