// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import { barSpan, FrameLayout, ScrollModel, TimeScaleModel, Viewport } from '../layout/index.js';
import type { Overscan, PresetRef, TimeScaleZoom, ViewportHandle, ViewPreset } from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { EventBus } from './event-bus.js';
import type { GanttEventMap } from './event-bus.js';
import { attachScroll } from './scroll-attachment.js';
import type { ScrollAttachment } from './scroll-attachment.js';
import { attachPaneSize } from './pane-size-attachment.js';
import type { PaneSizeAttachment } from './pane-size-attachment.js';
import { ensureBaseStyles } from './styles.js';
import type { RenderBackend } from '../render/backend.js';
import { EntryNotFoundError, HostNotFoundError } from '../model/index.js';
import type { Dataset, EntryId, Size, TimeSpan } from '../model/index.js';

/** S1.10, D-S1.10-4: theming's only preset axis for this step — `'auto'` follows
 * `prefers-color-scheme` (no `data-fg-theme` attribute written), `'light'`/`'dark'` pin it. */
export type Theme = 'auto' | 'light' | 'dark';
const DEFAULT_THEME: Theme = 'auto';
const DEFAULT_A11Y_LABEL = 'Gantt';

/** CSS custom property that owns row height (plans/02 §4, level 1 of the customization ladder) —
 * not a constructor option (#39). Read on construction and again whenever the pane-size attachment
 * fires (#49, #8): getComputedStyle is a synchronous style read that can force a style
 * recalculation, and `--fg-row-height` essentially never changes between renders in normal use, so a
 * resize is as good a signal as any to catch the rare case it does — never an unconditional read on
 * every render(). */
const ROW_HEIGHT_PROPERTY = '--fg-row-height';
const DEFAULT_ROW_HEIGHT = 32;
/** A zero-height row is not a row: only a positive value is an authored row height. */
const ROW_HEIGHT_POLICY = { fallback: DEFAULT_ROW_HEIGHT, accepts: 'positive' } as const;

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  host: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"); the default resolves its zone, span and zoom from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Constructs a private default when omitted; sharing one instance links both axes (S1.5 README
   * D-S1.5-3). */
  scroll?: ScrollModel;
  /** Initial grid pane width in px (S1.8, D-S1.8-3). Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Build the private default `TimeScaleModel` only (D-S1.9-9) — a no-op, with a dev-mode warning,
   * when `scale` is also supplied: the shared model already carries its own intent. */
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  zoom?: TimeScaleZoom;
  /** `Viewport` is never shared (D-S1.7-10), so this always applies to this shell's own viewport. */
  overscan?: Overscan;
  /** Live (S1.10, D-S1.10-4). Default `'auto'`: follows `prefers-color-scheme`. */
  theme?: Theme;
  /** Live (S1.10, D-S1.10-4). Default `'Gantt'`; sets `aria-label` on the host. */
  a11yLabel?: string;
}

function resolveHost(host: HTMLElement | string): HTMLElement {
  if (typeof host !== 'string') return host;
  const el = document.querySelector(host);
  if (!(el instanceof HTMLElement)) {
    throw new HostNotFoundError(host);
  }
  return el;
}

export class GanttShell {
  #host: HTMLElement;
  #paneLayout: PaneLayout;
  #panes: Panes;
  #backend: RenderBackend<HTMLElement>;
  #revision = 0;
  #viewport: Viewport;
  #viewportHandle: ViewportHandle;
  #scrollAttachment: ScrollAttachment;
  #paneSizeAttachment: PaneSizeAttachment;
  #splitterAttachment: SplitterAttachment;
  #events = new EventBus<GanttEventMap>();
  #destroyed = false;
  /** This Gantt's layout pass. It keeps the row-height index alive across renders (#47) — the shell
   * states what to draw and holds no layout bookkeeping of its own. */
  #layout = new FrameLayout();
  #rowHeight: number = DEFAULT_ROW_HEIGHT;
  #options: GanttShellOptions;
  /** True until pane-size wiring completes. `Viewport.bind()` notifies the newcomer synchronously
   * per D-S1.5-4 (once for scale, once for scroll) — those calls land before pane size is wired, so
   * they are not real renders yet and are dropped while this is true. */
  #wiring = true;
  /** Set by the most recent `render()` — `frame.contentWidth`/`contentHeight` (S1.5 README §3.2,
   * D-S1.5-9). No gutter added (S1.8, D-S1.8-2): the grid pane's own width is the gutter now, and the
   * timeline pane's content is `contentWidth` wide, full stop. */
  #contentSize = { width: 0, height: 0 };
  #theme: Theme = DEFAULT_THEME;
  #a11yLabel: string = DEFAULT_A11Y_LABEL;

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#host = resolveHost(options.host);
    // S1.10, D-S1.10-8: must exist before PaneLayout builds the classed elements the stylesheet
    // targets, or there's a one-frame flash of unstyled content.
    ensureBaseStyles(this.#host.ownerDocument);
    this.#paneLayout = new PaneLayout({
      host: this.#host,
      ...(options.gridWidth !== undefined ? { gridWidth: options.gridWidth } : {}),
    });
    this.#panes = this.#paneLayout.panes;

    const hasOwnIntent =
      options.preset !== undefined || options.range !== undefined || options.zoom !== undefined;
    const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
    if (options.scale && hasOwnIntent && isDev) {
      console.warn(
        "FreeGantt: GanttOptions.preset/range/zoom are ignored when 'scale' is also supplied. " +
          'The shared TimeScaleModel already carries its own intent — set preset/range/zoom on it directly.',
      );
    }
    this.#viewport = new Viewport({
      scale:
        options.scale ??
        new TimeScaleModel({
          ...(options.preset !== undefined ? { preset: options.preset } : {}),
          ...(options.range !== undefined ? { range: options.range } : {}),
          ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
        }),
      ...(options.scroll ? { scroll: options.scroll } : {}),
      ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    });

    // Mount before binding (#22): the render target exists by the time the binding's own onChange
    // — which IS this shell's first render — fires, so there is no construction-order exception to
    // document and no separate explicit render() call after bind().
    this.#backend = createDomBackend();
    this.#backend.mount({ grid: this.#panes.grid, timeline: this.#panes.timeline });

    // The timeline pane is the single native scroller (D-D, D-S1.8-1); the grid pane follows it by
    // transform, in render/dom's sync(). Constructed before either bind (Viewport's fan-in,
    // D-S1.7-1), so this field is never undefined during a render.
    this.#scrollAttachment = attachScroll(this.#panes.timeline, this.#viewport);

    // bind() fires its own onChange synchronously, once per sub-model (D-S1.5-4: bind always
    // notifies the newcomer) — before this call returns and #viewportHandle is assigned. Those
    // premature calls are dropped by #wiring; the deliberate first render below runs once
    // everything, including the initial pane-size measurement, is wired.
    this.#viewportHandle = this.#viewport.bind(options.dataset, () => {
      if (!this.#wiring) this.render();
    });
    // Synchronous first measurement: a real ResizeObserver's own first callback is queued, not
    // immediate, so the first paint cannot wait for it. attachPaneSize below takes over from here —
    // every measurement after this one, live, for as long as the shell lives (S1.7b, #8).
    this.#applyPaneMeasurement(this.#paneLayout.measureTimelinePane());
    this.#paneSizeAttachment = attachPaneSize(this.#panes.timeline, (size) =>
      this.#applyPaneMeasurement(size),
    );
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#paneLayout.gridWidth,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = px;
      },
      commitGridWidth: (px) => this.#commitGridWidth(px),
    });
    this.#wiring = false;
    this.render();

    if (options.theme !== undefined) this.theme = options.theme;
    else this.#applyTheme();
    this.a11yLabel = options.a11yLabel ?? DEFAULT_A11Y_LABEL;
  }

  get theme(): Theme {
    return this.#theme;
  }

  /** Live (S1.10, D-S1.10-4): `'auto'` writes no attribute, letting `prefers-color-scheme` decide;
   *  `'light'`/`'dark'` pin `data-fg-theme`, which always wins over the media query on selector
   *  specificity + being attribute-scoped. */
  set theme(value: Theme) {
    this.#theme = value;
    this.#applyTheme();
  }

  #applyTheme(): void {
    if (this.#theme === 'auto') this.#host.removeAttribute('data-fg-theme');
    else this.#host.setAttribute('data-fg-theme', this.#theme);
  }

  get a11yLabel(): string {
    return this.#a11yLabel;
  }

  /** Live (S1.10, D-S1.10-4/5): sets `aria-label` on the host — the one honest tab stop this step
   *  defines (`view/pane-layout.ts`'s `role="group"`/`tabindex="0"`). */
  set a11yLabel(value: string) {
    this.#a11yLabel = value;
    this.#host.setAttribute('aria-label', value);
  }

  get gridWidth(): number {
    return this.#paneLayout.gridWidth;
  }

  /** A plain reconfiguration (`plans/02` "Reconfiguration is just assignment") still runs the same
   *  cancelable commit sequence a splitter drag runs — one write path, one place the veto lives. */
  set gridWidth(px: number) {
    this.#commitGridWidth(px);
  }

  get preset(): ViewPreset {
    return this.#viewport.preset;
  }

  set preset(ref: PresetRef) {
    this.#viewport.preset = ref;
  }

  get range(): 'fitDataset' | TimeSpan {
    return this.#viewport.range;
  }

  set range(r: 'fitDataset' | TimeSpan) {
    this.#viewport.range = r;
  }

  get zoom(): TimeScaleZoom {
    return this.#viewport.zoom;
  }

  set zoom(z: TimeScaleZoom) {
    this.#viewport.zoom = z;
  }

  get overscan(): Overscan {
    return this.#viewport.overscan;
  }

  set overscan(o: Overscan) {
    this.#viewport.overscan = o;
  }

  zoomTo(pxPerMs: number, anchorX?: number): void {
    this.#viewport.zoomTo(pxPerMs, anchorX);
  }

  zoomBy(factor: number, anchorX?: number): void {
    this.#viewport.zoomBy(factor, anchorX);
  }

  /** Finds the entry's row via the bound dataset, asks `FrameLayout` for its top and `barSpan` for
   * its x/width off the bound `TimeScale` — the same formula `computeFrame` builds bars from, so the
   * two can never drift apart — and hands the resulting `Rect` to `Viewport.reveal` (S1.9, D-S1.9-6).
   * Throws `EntryNotFoundError` for an id the dataset has no entry for. */
  reveal(entryId: EntryId): void {
    const index = this.#options.dataset.entries.findIndex((e) => e.id === entryId);
    if (index === -1) throw new EntryNotFoundError(entryId);
    const entry = this.#options.dataset.entries[index]!;
    const { x, width } = barSpan(entry, this.#viewport.timeScale);
    this.#viewport.reveal({ x, y: this.#layout.rowTop(index), width, height: this.#rowHeight });
  }

  on<K extends keyof GanttEventMap>(name: K, handler: (payload: GanttEventMap[K]) => void | false): void {
    this.#events.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: (payload: GanttEventMap[K]) => void | false): void {
    this.#events.off(name, handler);
  }

  #commitGridWidth(px: number): void {
    const from = this.#paneLayout.gridWidth;
    const to = px;
    if (this.#events.emit('beforeGridWidthChange', { from, to }) === false) {
      this.#paneLayout.gridWidth = from; // veto: the boundary goes back (D-S1.8-3)
      return;
    }
    this.#paneLayout.gridWidth = to;
    this.#events.emit('gridWidthChange', { from, to });
  }

  /** One measurement, pushed to everything it feeds (#8, #49): `--fg-row-height` and the pane size
   *  both change for the same reason — the timeline pane was just resized — so both are re-read on
   *  the same signal instead of `--fg-row-height` being read once and going stale. `size` is the
   *  timeline pane's own client box; no gutter to subtract (S1.8, D-S1.8-2) — the grid pane's width
   *  never overlapped it in the first place. */
  #applyPaneMeasurement(size: Size): void {
    this.#rowHeight = readPixelProperty(this.#host, ROW_HEIGHT_PROPERTY, ROW_HEIGHT_POLICY);
    this.#viewportHandle.setPaneSize(size);
  }

  render(): void {
    const frame = this.#layout.computeFrame({
      entries: this.#options.dataset.entries,
      scale: this.#viewport.timeScale,
      preset: this.#viewport.preset,
      visible: this.#viewport.visible,
      overscan: this.#viewport.overscan,
      rowHeight: this.#rowHeight,
      revision: this.#revision++,
    });
    this.#backend.sync(frame);
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#scrollAttachment.detach();
    this.#paneSizeAttachment.detach();
    this.#splitterAttachment.detach();
    this.#viewportHandle.unbind();
    this.#backend.destroy();
    this.#paneLayout.destroy();
    this.#destroyed = true;
  }
}
