// layout/ — renderer callback vocabulary (S5.4, D-S5-10/11/12). These point types reference
// FrameBar/FrameRow/ResolvedColumn (layout-owned) alongside Entry (model-owned), so they live here
// rather than model/render.ts (ElementDescription's own file) — model/ is a leaf and may import
// nothing (model-is-leaf, dependency-cruiser). `layout/index.ts` re-exports them the same way it
// already re-exports ElementDescription, so `render/dom` (layout-only import) and `view/`/`api/`
// (both allowed to import layout/) reach them through one seam.

import type { Entry, PluginId } from '../model/index.js';
import type { ElementDescription } from '../model/index.js';
import type { FrameBar, FrameRow } from './frame.js';
import type { ResolvedColumn } from './column.js';

/** One of the four renderer points (D-S5-11): one slot each. */
export type RendererPoint = 'bar' | 'cell' | 'header' | 'tooltip';

export interface BarRendererContext {
  entry: Entry;
  item: FrameBar;
}
/** `undefined` keeps the library's own output for this one bar (D-S5-11). */
export type BarRenderer = (ctx: BarRendererContext) => ElementDescription | undefined;

/** Per-kind map for `barRenderer` only (D-S5-12) — a cell belongs to a column and a header to a
 *  column/band, neither has a kind to key on. `'*'` is the catch-all; an exact `entry.kind` match
 *  wins over it, and the library default wins when neither matches. */
export type RendererByKind = Readonly<Record<string, BarRenderer>>;

export interface CellRendererContext {
  /** Undefined for a row with no backing Entry — a group or custom row (`layout/rows`). */
  entry?: Entry;
  row: FrameRow;
  column: ResolvedColumn;
  /** What the grid paints: the column's Field value, through the Field's own `formatValue`. */
  value: string;
  /** The same Field value before formatting — what `dataset.entries.fieldValue(id, column.field)`
   *  answers, for every Field source alike (review H3). A renderer that branches on magnitude reads
   *  this; one that paints text reads `value`. `undefined` on a row with no Entry. */
  fieldValue: unknown;
}
export type CellRenderer = (ctx: CellRendererContext) => ElementDescription | undefined;

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
 *  accept for one `point` — only `bar` also takes the per-kind map form (D-S5-12). */
export type RendererFor<P extends RendererPoint> = P extends 'bar'
  ? BarRenderer | RendererByKind
  : P extends 'cell'
    ? CellRenderer
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
