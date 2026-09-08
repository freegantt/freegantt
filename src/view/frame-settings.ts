// view/ — one Gantt's Frame settings. They are every live setting that says what the next frame
// draws, plus the one table saying what each change invalidates (#167). `GanttShell` used to hold
// these twelve fields itself. Each of its twelve setters re-derived its own rule by hand.
//
// No DOM. Every pixel arrives through the injected `readPixelProperty` port. So this file's unit
// test runs in the `pure` vitest project (`vitest.workspace.ts`), with no DOM env at all. The
// invalidation table is then a plain Node test, instead of a claim only a mounted Gantt can check.
//
// The settings speak the public config vocabulary a consumer writes (`rowSource`, `locale`), not
// `LayoutInput`'s own key names. `toLayoutInput` below is the one place the two meet.

import {
  DEFAULT_BAR_HEIGHT_PX,
  DEFAULT_DIAMOND_SIZE_PX,
  DEFAULT_LANE_GAP_PX,
  DEFAULT_MIN_BAR_WIDTH_PX,
  DEFAULT_ROW_SOURCE,
  DEFAULT_TICK_BOX_FLOOR_PX,
} from '../layout/index.js';
import type {
  BarLabels,
  BarRenderer,
  CellRenderer,
  DateLine,
  FieldCompare,
  HeaderRenderer,
  LayoutInput,
  RendererByKind,
  RowSource,
  TooltipRenderer,
} from '../layout/index.js';
import type { FieldContext, Instant } from '../model/index.js';
import type { PixelPropertyPolicy } from '../render/dom/pixel-property.js';

/** CSS custom property that owns row height (plans/02 §4, level 1 of the customization ladder) —
 *  not a constructor option (#39). */
const ROW_HEIGHT_PROPERTY = '--fg-row-height';
export const DEFAULT_ROW_HEIGHT = 36;
/** A zero-height row is not a row: only a positive value is an authored row height. */
const ROW_HEIGHT_POLICY = { fallback: DEFAULT_ROW_HEIGHT, accepts: 'positive' } as const;

const TICK_BOX_FLOOR_PROPERTY = '--fg-tick-box-floor';
/** A zero floor would re-open thin straddles painting at the CSS box minimum. */
const TICK_BOX_FLOOR_POLICY = { fallback: DEFAULT_TICK_BOX_FLOOR_PX, accepts: 'positive' } as const;

const DIAMOND_SIZE_PROPERTY = '--fg-diamond-size';
/** A zero size would re-open a zero-width milestone bar (bug hunt). */
const DIAMOND_SIZE_POLICY = { fallback: DEFAULT_DIAMOND_SIZE_PX, accepts: 'positive' } as const;

const LANE_GAP_PROPERTY = '--fg-lane-gap';
/** Zero gap is authored: packed bars may sit flush. */
const LANE_GAP_POLICY = { fallback: DEFAULT_LANE_GAP_PX, accepts: 'zeroOrMore' } as const;

const MIN_BAR_WIDTH_PROPERTY = '--fg-bar-min-width';
/** Zero is authored. A consumer who wants a zero-width span to paint opted out of the floor on
 *  purpose. `DIAMOND_SIZE_POLICY` differs: a zero milestone glyph is never useful. */
const MIN_BAR_WIDTH_POLICY = { fallback: DEFAULT_MIN_BAR_WIDTH_PX, accepts: 'zeroOrMore' } as const;

const BAR_HEIGHT_PROPERTY = '--fg-bar-height';
/** A zero-height bar is not a bar: only a positive value is an authored bar height. */
const BAR_HEIGHT_POLICY = { fallback: DEFAULT_BAR_HEIGHT_PX, accepts: 'positive' } as const;

/** The six px sizes a Gantt reads off its own Container's CSS, not off a constructor option. They
 *  are not settings: nothing writes one, and `refreshPixelProperties` re-reads all six together. */
interface PixelMetrics {
  rowHeight: number;
  laneGapPx: number;
  tickBoxFloorPx: number;
  diamondSizePx: number;
  minBarWidthPx: number;
  barHeightPx: number;
}

/** The six `--fg-*` properties this Gantt measures itself against. Each row carries the rule that
 *  decides whether an authored value is usable, and the metric it answers.
 *  `refreshPixelProperties` below is the whole reader: one loop, no per-property code. */
interface PixelPropertyRead {
  property: string;
  policy: PixelPropertyPolicy;
  metric: keyof PixelMetrics;
}

const PIXEL_PROPERTIES: readonly PixelPropertyRead[] = Object.freeze([
  { property: ROW_HEIGHT_PROPERTY, policy: ROW_HEIGHT_POLICY, metric: 'rowHeight' },
  { property: LANE_GAP_PROPERTY, policy: LANE_GAP_POLICY, metric: 'laneGapPx' },
  { property: TICK_BOX_FLOOR_PROPERTY, policy: TICK_BOX_FLOOR_POLICY, metric: 'tickBoxFloorPx' },
  { property: DIAMOND_SIZE_PROPERTY, policy: DIAMOND_SIZE_POLICY, metric: 'diamondSizePx' },
  { property: MIN_BAR_WIDTH_PROPERTY, policy: MIN_BAR_WIDTH_POLICY, metric: 'minBarWidthPx' },
  { property: BAR_HEIGHT_PROPERTY, policy: BAR_HEIGHT_POLICY, metric: 'barHeightPx' },
]);

/** Default for `todayLineMarginTicks`: how many of the current preset's own ticks sit between the
 *  pane's left edge and `panToToday`'s landing (S1.13 follow-up). Two ticks are enough that the
 *  today line reads as "near the start", and does not sit flush on the edge. They leave a sliver of
 *  the timeline visible to its left. */
export const DEFAULT_TODAY_LINE_MARGIN_TICKS = 2;

/** What a changed setting invalidates. The two structural answers are supersets of the third: a
 *  `rebindFields` and an `invalidateItems` each end in the same repaint `'repaint'` asks for. No
 *  setting needs both structural answers, so one value per setting says everything. */
export type FrameInvalidation = 'none' | 'repaint' | 'rebindFields' | 'invalidateItems';

/** The Frame settings' seams back into `GanttShell`. Every name here is the shell's own port
 *  vocabulary, unchanged: `ColumnChromePorts` already says `requestFrame` and `rebindFields`, and
 *  `GanttShellPorts` already says `invalidateItems`. One word per job across all three. */
export interface FrameSettingsPorts {
  /** Paint again. What the frame draws changed; which rows exist did not. */
  requestFrame(): void;
  /** Resolve this Gantt's Fields again. A column's own text is produced at this locale. */
  rebindFields(): void;
  /** Drop the cached row plan. Which rows exist changed, so no cached Item survives it. */
  invalidateItems(): void;
  /** Read one `--fg-*` property off the Container, in px (`render/dom/pixel-property.ts`). Injected
   *  rather than imported, so this module stays DOM-free. */
  readPixelProperty(property: string, policy: PixelPropertyPolicy): number;
}

/** Every setting, with the value it currently holds. Five of them may honestly be unset, and say so
 *  with an explicit `| undefined`. The other six always hold a value. */
interface FrameSettingsValues {
  locale: Intl.LocalesArgument | undefined;
  todayLine: boolean | Instant;
  dateLines: readonly DateLine[];
  todayLineMarginTicks: number;
  rowSource: RowSource;
  barLabels: BarLabels;
  barRenderer: BarRenderer | RendererByKind | undefined;
  cellRenderer: CellRenderer | undefined;
  headerRenderer: HeaderRenderer | undefined;
  tooltipRenderer: TooltipRenderer | undefined;
  /** Written by the Field bind itself (`GanttShell`'s `#bindColumns`), never by a consumer. */
  fieldCompares: readonly FieldCompare[];
  /** Written by the Field bind, same as `fieldCompares`. */
  fieldContext: FieldContext | undefined;
}

/** What `set` takes: any subset of the settings. Derived, so a new setting is one line above and
 *  nothing else. `exactOptionalPropertyTypes` then keeps the two kinds of key honest. A setting that
 *  may be unset accepts `undefined` and clears; one that may not, does not compile.
 *  So `set` walks the patch's own keys and never tests a value against `undefined`. */
export type FrameSettingsPatch = Partial<FrameSettingsValues>;

/** One name for every setting, so a loop over a patch's keys is typed. */
type FrameSettingKey = keyof FrameSettingsValues;

/** The library's own answer for every setting, before a consumer says anything. A function, not a
 *  constant: each Gantt takes its own copy, and no two Gantts share one object (I2). */
function defaultSettings(): FrameSettingsValues {
  return {
    locale: undefined,
    todayLine: true,
    dateLines: [],
    todayLineMarginTicks: DEFAULT_TODAY_LINE_MARGIN_TICKS,
    rowSource: DEFAULT_ROW_SOURCE,
    barLabels: 'fitBar',
    barRenderer: undefined,
    cellRenderer: undefined,
    headerRenderer: undefined,
    tooltipRenderer: undefined,
    fieldCompares: [],
    fieldContext: undefined,
  };
}

/** The one invalidation table (#167). One row per setting, and the row is the whole rule: nothing
 *  outside this object decides what a changed setting costs.
 *
 *  `todayLineMarginTicks` invalidates nothing on purpose. The next `panToToday()` call reads it, and
 *  it moves no scroll position by itself. The two Field-bind outputs invalidate nothing for the
 *  opposite reason. The bind that writes them already owns the frame it asked for. A repaint here
 *  would make every rebind paint twice. */
const INVALIDATION: { readonly [K in FrameSettingKey]: FrameInvalidation } = Object.freeze({
  locale: 'rebindFields',
  todayLine: 'repaint',
  dateLines: 'repaint',
  todayLineMarginTicks: 'none',
  rowSource: 'invalidateItems',
  barLabels: 'repaint',
  barRenderer: 'repaint',
  cellRenderer: 'repaint',
  headerRenderer: 'repaint',
  tooltipRenderer: 'repaint',
  fieldCompares: 'none',
  fieldContext: 'none',
});

/** The `LayoutInput` keys the Frame settings answer for. Every other key arrives fresh per frame.
 *  Spelled in `LayoutInput`'s own words, which is why `rows` appears here and `rowSource` does not. */
type SettingLayoutInputKey =
  | 'rowHeight'
  | 'laneGapPx'
  | 'tickBoxFloorPx'
  | 'diamondSizePx'
  | 'minBarWidthPx'
  | 'barHeightPx'
  | 'locale'
  | 'todayLine'
  | 'dateLines'
  | 'rows'
  | 'fieldCompares'
  | 'fieldContext';

/** The other half of a `LayoutInput`: what the viewport, the dataset and the registries contribute,
 *  fresh on every frame. Derived from `LayoutInput`, so a new key there lands here with no edit. A
 *  key these settings start to own is one line above. */
export type PerFrameLayoutInput = Omit<LayoutInput, SettingLayoutInputKey>;

export class FrameSettings {
  #ports: FrameSettingsPorts;
  #values: FrameSettingsValues = defaultSettings();

  #metrics: PixelMetrics = {
    rowHeight: DEFAULT_ROW_HEIGHT,
    laneGapPx: DEFAULT_LANE_GAP_PX,
    tickBoxFloorPx: DEFAULT_TICK_BOX_FLOOR_PX,
    diamondSizePx: DEFAULT_DIAMOND_SIZE_PX,
    minBarWidthPx: DEFAULT_MIN_BAR_WIDTH_PX,
    barHeightPx: DEFAULT_BAR_HEIGHT_PX,
  };

  /** `initial` is written straight into the values, with no port call. A Gantt under construction
   *  has no columns to rebind and no frame to request yet, and it paints once at the end anyway. */
  constructor(ports: FrameSettingsPorts, initial: FrameSettingsPatch = {}) {
    this.#ports = ports;
    this.#write(initial);
  }

  get locale(): Intl.LocalesArgument | undefined {
    return this.#values.locale;
  }

  get todayLine(): boolean | Instant {
    return this.#values.todayLine;
  }

  get dateLines(): readonly DateLine[] {
    return this.#values.dateLines;
  }

  get todayLineMarginTicks(): number {
    return this.#values.todayLineMarginTicks;
  }

  get rowSource(): RowSource {
    return this.#values.rowSource;
  }

  get barLabels(): BarLabels {
    return this.#values.barLabels;
  }

  get barRenderer(): BarRenderer | RendererByKind | undefined {
    return this.#values.barRenderer;
  }

  get cellRenderer(): CellRenderer | undefined {
    return this.#values.cellRenderer;
  }

  get headerRenderer(): HeaderRenderer | undefined {
    return this.#values.headerRenderer;
  }

  get tooltipRenderer(): TooltipRenderer | undefined {
    return this.#values.tooltipRenderer;
  }

  /** Row height in px, from `--fg-row-height`. Read by keyboard row paging and by `reveal`. */
  get rowHeight(): number {
    return this.#metrics.rowHeight;
  }

  /** Diamond size in px, from `--fg-diamond-size` — a milestone's painted-span floor. */
  get diamondSizePx(): number {
    return this.#metrics.diamondSizePx;
  }

  /** Minimum painted bar width in px, from `--fg-bar-min-width` — every kind's painted-span floor. */
  get minBarWidthPx(): number {
    return this.#metrics.minBarWidthPx;
  }

  /** Live reconfiguration, for one setting or several. A value identical to the one already held
   *  invalidates nothing, so assigning what is already set never costs a frame. Every other key runs
   *  its own row of `INVALIDATION`, and the strongest answer among them wins.
   *
   *  Identity is the whole test, and object-valued settings get no exemption (#187). A caller who
   *  mutates the object they already gave, and assigns that same object again, gets no frame. A
   *  config value is a value: `plans/02` §2 states that rule and names the copy that asks for the
   *  repaint. An exemption would put a second rule beside the table above, per setting. */
  set(patch: FrameSettingsPatch): void {
    this.#invalidate(this.#write(patch));
  }

  /** Re-read the four `--fg-*` pixel properties (#8, #49). The caller re-measures because the pane
   *  changed size, and that same change already brings a frame with it. So this asks for none. */
  refreshPixelProperties(): void {
    for (const { property, policy, metric } of PIXEL_PROPERTIES) {
      this.#metrics[metric] = this.#ports.readPixelProperty(property, policy);
    }
  }

  /** One `LayoutInput` from these settings plus what this frame contributes. The two settings that
   *  may honestly be unset are spread in, because `exactOptionalPropertyTypes` refuses to read an
   *  assigned `undefined` back as "absent". */
  toLayoutInput(perFrame: PerFrameLayoutInput): LayoutInput {
    return {
      ...perFrame,
      rowHeight: this.#metrics.rowHeight,
      laneGapPx: this.#metrics.laneGapPx,
      tickBoxFloorPx: this.#metrics.tickBoxFloorPx,
      diamondSizePx: this.#metrics.diamondSizePx,
      minBarWidthPx: this.#metrics.minBarWidthPx,
      barHeightPx: this.#metrics.barHeightPx,
      todayLine: this.#values.todayLine,
      dateLines: this.#values.dateLines,
      rows: this.#values.rowSource,
      fieldCompares: this.#values.fieldCompares,
      ...(this.#values.locale !== undefined ? { locale: this.#values.locale } : {}),
      ...(this.#values.fieldContext !== undefined ? { fieldContext: this.#values.fieldContext } : {}),
    };
  }

  /** Writes each key the patch carries and answers which ones actually changed value. A key the
   *  patch omits is untouched; a key it carries as `undefined` clears that setting.
   *
   *  The write goes through an index signature. TypeScript cannot correlate `patch[key]` with
   *  `#values[key]` while `key` is the whole union. One cast here is cheaper than eleven
   *  hand-written branches a reader would have to check the invalidation table against. Every read
   *  of `#values` is typed, and the patch type is derived from it. So the two sides cannot drift
   *  apart. */
  #write(patch: FrameSettingsPatch): readonly FrameSettingKey[] {
    const changed: FrameSettingKey[] = [];
    const values = this.#values as Record<FrameSettingKey, unknown>;
    for (const key of Object.keys(patch) as FrameSettingKey[]) {
      const next = patch[key];
      if (Object.is(values[key], next)) continue;
      values[key] = next;
      changed.push(key);
    }
    return changed;
  }

  /** Runs the table for the keys that changed. `rebindFields` and `invalidateItems` each finish with
   *  the repaint a plain `'repaint'` asks for, and each runs at most once per `set`. */
  #invalidate(changed: readonly FrameSettingKey[]): void {
    let repaint = false;
    let rebindFields = false;
    let invalidateItems = false;
    for (const key of changed) {
      const effect = INVALIDATION[key];
      if (effect === 'none') continue;
      if (effect === 'rebindFields') rebindFields = true;
      if (effect === 'invalidateItems') invalidateItems = true;
      repaint = true;
    }
    if (rebindFields) this.#ports.rebindFields();
    if (invalidateItems) this.#ports.invalidateItems();
    if (repaint) this.#ports.requestFrame();
  }
}
