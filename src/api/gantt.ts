// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell, ScrollModel, TimeScaleModel } from '../view/index.js';
import type { GanttEventMap, PresetRef, Theme, TimeScaleFit, ViewPreset } from '../view/index.js';
import type { EntryId, TimeSpan } from '../model/index.js';
import type { Dataset } from './dataset.js';

interface GanttOptionsBase {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  container: HTMLElement | string;
  dataset: Dataset;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Independent of `scale`/`preset`/`range`/`fit`: a Gantt may share its scroll position, its axis,
   * both, or neither. */
  scroll?: ScrollModel;
  /** Initial grid pane width in px (S1.8). Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Live (S1.10). Default `'auto'`: follows `prefers-color-scheme`. */
  theme?: Theme;
  /** Live (S1.10). Default `'Gantt'`; sets `aria-label` on the container. */
  a11yLabel?: string;
}

/** Two ways to set the axis, made mutually exclusive at the type level (issue #84 — the prior shape
 * accepted both and silently ignored `preset`/`range`/`fit` in favor of `scale`, with a dev-mode-only
 * warning). Sharing an axis and building a private one from `preset`/`range`/`fit` are not two knobs
 * for the same job; a caller states one or the other. */
type GanttScaleOptions =
  | {
      /** Bound viewport object (D9, plans/02 §5) — pass the same instance to two Gantt instances to
       * x-sync them. */
      scale: TimeScaleModel;
      preset?: never;
      range?: never;
      fit?: never;
    }
  | {
      scale?: undefined;
      /** Build a private default `TimeScaleModel` (D-S1.9-9) sized to the dataset's entries. */
      preset?: PresetRef;
      range?: 'fitDataset' | TimeSpan;
      fit?: TimeScaleFit;
    };

export type GanttOptions = GanttOptionsBase & GanttScaleOptions;

export class Gantt {
  #shell: GanttShell;
  #destroyed = false;

  constructor(options: GanttOptions) {
    this.#shell = new GanttShell({
      container: options.container,
      dataset: options.dataset,
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.scroll ? { scroll: options.scroll } : {}),
      ...(options.gridWidth !== undefined ? { gridWidth: options.gridWidth } : {}),
      ...(options.preset !== undefined ? { preset: options.preset } : {}),
      ...(options.range !== undefined ? { range: options.range } : {}),
      ...(options.fit !== undefined ? { fit: options.fit } : {}),
      ...(options.theme !== undefined ? { theme: options.theme } : {}),
      ...(options.a11yLabel !== undefined ? { a11yLabel: options.a11yLabel } : {}),
    });
  }

  get theme(): Theme {
    return this.#shell.theme;
  }

  set theme(value: Theme) {
    this.#shell.theme = value;
  }

  get a11yLabel(): string {
    return this.#shell.a11yLabel;
  }

  set a11yLabel(value: string) {
    this.#shell.a11yLabel = value;
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

  get fit(): TimeScaleFit {
    return this.#shell.fit;
  }

  set fit(f: TimeScaleFit) {
    this.#shell.fit = f;
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
