// layout/ — renderer callback vocabulary (S5.4, D-S5-10/11/12). These point types reference
// FrameBar/FrameRow/ResolvedColumn (layout-owned) alongside Entry (model-owned), so they live here
// rather than model/render.ts (ElementDescription's own file) — model/ is a leaf and may import
// nothing (model-is-leaf, dependency-cruiser). `layout/index.ts` re-exports them the same way it
// already re-exports ElementDescription, so `render/dom` (layout-only import) and `view/`/`api/`
// (both allowed to import layout/) reach them through one seam.

import type { Entry, FieldKey, PluginId } from '../model/index.js';
import type { ElementDescription } from '../model/index.js';
import type { FrameBar, FrameRow } from './frame.js';
import type { ResolvedColumn } from './column.js';

/** One of the four renderer points (D-S5-11): one slot each. */
export type RendererPoint = 'bar' | 'gridCell' | 'header' | 'tooltip';

/** Which side of the bar the label paints on. This is the *answer* for one bar at one width, not the
 *  `barLabels` policy that produced it: `'fitBar'` reads `'inside'` for a bar the text fits and
 *  `'outside'` for one it does not. */
export type BarLabelPlacement = 'inside' | 'outside';

/** The label the library resolved for one bar — the text, and the side it paints on. A `barRenderer`
 *  paints it in its own markup and needs no text ruler of its own: the library measures, in one
 *  place, for its own label and for a renderer's alike (J1). */
export interface ResolvedBarLabel {
  text: string;
  placement: BarLabelPlacement;
}

export interface BarRendererContext {
  entry: Entry;
  item: FrameBar;
  /** Absent when the consumer asked for no label (`barLabels: 'none'`) — so a renderer reads "this
   *  bar has a label, here is where it goes" or nothing, and "a label with nowhere to paint" stays
   *  unrepresentable. */
  label?: ResolvedBarLabel;
}
/** `undefined` keeps the library's own output for this one bar (D-S5-11). */
export type BarRenderer = (ctx: BarRendererContext) => ElementDescription | undefined;

export interface GridCellRendererContext {
  /** Undefined for a row with no backing Entry — a group or custom row (`layout/rows`). */
  entry?: Entry | undefined;
  row: FrameRow;
  column: ResolvedColumn;
  /** What the grid paints: the column's Field value, through the Field's own `formatValue`. */
  value: string;
  /** The same Field value before formatting — what `entry.read(column.field)` answers, for every
   *  Field source alike (review H3). A renderer that branches on magnitude reads
   *  this; one that paints text reads `value`. `undefined` on a row with no Entry. */
  fieldValue: unknown;
}
export type GridCellRenderer = (ctx: GridCellRendererContext) => ElementDescription | undefined;

export interface HeaderRendererContext {
  column: ResolvedColumn;
}
export type HeaderRenderer = (ctx: HeaderRendererContext) => ElementDescription | undefined;

export interface TooltipRendererContext {
  entry: Entry;
  item: FrameBar;
}
export type TooltipRenderer = (ctx: TooltipRendererContext) => ElementDescription | undefined;

/** What `ctx.view.registerRenderer(point, renderer)` and `GanttOptions`'s four renderer keys both
 *  accept for one `point`. Four points, four function types, one slot each.
 *
 *  ADR 0018 retired the `bar` point's per-kind map. It was a fifth site for a variant's name, and a
 *  variant's own `paint` is where that job lives now. */
export type RendererFor<P extends RendererPoint> = P extends 'bar'
  ? BarRenderer
  : P extends 'gridCell'
    ? GridCellRenderer
    : P extends 'header'
      ? HeaderRenderer
      : TooltipRenderer;

/** One point's resolved renderer, plus the plugin id it came from when it did (issue #137 F14: the
 *  dev-log a throwing renderer gets names the point and, when it came from a plugin, that plugin's
 *  id). No `pluginId` means it came from the consumer's own `GanttOptions`. */
export interface ResolvedRenderer<TRenderer> {
  renderer: TRenderer;
  pluginId?: PluginId;
}

/** Where the default bar label paints, when no `barRenderer` already owns the bar's content (J1).
 *  `'fitBar'` (the default) reads inside when the label fits, outside to the right when it does not,
 *  and falls back to inside, ellipsised, when neither fits — a family with the shipped
 *  `range: 'fitDataset'` and `gridWidth: 'fitColumns'`. `'inside'` and `'outside'` force one placement
 *  regardless of fit (ellipsised inside, or clipped at the pane edge outside — the same load-bearing
 *  fallback `'fitBar'`'s third clause takes). `'none'` paints no label at all, and a `barRenderer`
 *  sees no `ctx.label` either — one answer to "did the consumer ask for a label", for the library's
 *  own paint and for a renderer's alike.
 *
 *  Named `Policy`, not `BarLabels`: this is one Gantt-wide or per-variant setting's placement half
 *  (#421 C5). `BarLabels` below is the wider public type a consumer actually writes. */
export type BarLabelPolicy = 'fitBar' | 'inside' | 'outside' | 'none';

/** The expert form of `barLabels`: which Field prints, and where it paints. Both keys are optional,
 *  so `{ field: 'hours' }` alone keeps whichever placement policy is already in force, and
 *  `{ placement: 'outside' }` alone keeps whichever Field is already in force (`mergeBarLabels`). */
export interface BarLabelSpec {
  /** The Field a bar's label reads — `formatValue` prints it, the same as a Grid cell (#421 C5).
   *  Defaults to `'name'`. */
  field?: FieldKey;
  /** Which side the label paints on, at whatever fit rule `BarLabelPolicy` states. Defaults to
   *  `'fitBar'`. */
  placement?: BarLabelPolicy;
}

/** What `gantt.barLabels` and `EntryVariant.barLabels` both take. The short form (`'fitBar'` etc.)
 *  is the common case: placement only, `name` printed. `{ field, placement }` is the expert form,
 *  for a bar that prints a different Field, or a variant that overrides only one of the two (#421
 *  C5). */
export type BarLabels = BarLabelPolicy | BarLabelSpec;

const DEFAULT_BAR_LABEL_FIELD: FieldKey = 'name';
const DEFAULT_BAR_LABEL_PLACEMENT: BarLabelPolicy = 'fitBar';

/** One `BarLabels` value, filled out to both keys. The short form names placement alone and prints
 *  `'name'`; the long form fills whichever key it omits from these same two defaults. */
function normalizeBarLabels(labels: BarLabels): BarLabelSpec {
  return typeof labels === 'string' ? { placement: labels } : labels;
}

/** Call: `mergeBarLabels(gantt.barLabels, variantFor(entry).barLabels)`. Merges key by key —
 *  `override`'s own `field` wins when it names one, `override`'s own `placement` wins when it names
 *  one, and `base`'s answer (or the library's default) carries whichever key `override` leaves
 *  unnamed. So a variant that sets only `{ placement: 'outside' }` never drops the Gantt's own
 *  `field` (#421 C5). Pure: reads nothing, keeps no state. */
export function mergeBarLabels(base: BarLabels, override: BarLabels | undefined): Required<BarLabelSpec> {
  const baseSpec = normalizeBarLabels(base);
  const overrideSpec = override === undefined ? {} : normalizeBarLabels(override);
  return {
    field: overrideSpec.field ?? baseSpec.field ?? DEFAULT_BAR_LABEL_FIELD,
    placement: overrideSpec.placement ?? baseSpec.placement ?? DEFAULT_BAR_LABEL_PLACEMENT,
  };
}
