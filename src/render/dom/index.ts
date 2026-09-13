// render/dom — default backend: absolutely-positioned rows/bars/header ticks, keyed reconciler
// (plans/01 §8.1). Scope is hard-bounded: attr/class/style/text + keyed child recycling only.

import type {
  BarFlags,
  BarLabelPlacement,
  BarLabels,
  BarRenderer,
  BarRendererContext,
  ElementDescription,
  Entry,
  EntryId,
  FrameBar,
  FrameHeaderBand,
  FrameHeaderTick,
  FrameRow,
  GeometryFrame,
  ItemId,
  ItemPreview,
  RaiseError,
  ResolvedRenderer,
  RowId,
  SegmentId,
  ClientPoint,
} from '../../layout/index.js';
import type { ColumnAlign, FrameColumn } from '../../layout/index.js';
import type { RenderBackend, RenderSurfaces, InteractionState, HitResult } from '../backend.js';
import { itemIdFromDataset, rowIdFromDataset } from '../../layout/index.js';
import { attachDateLines } from './date-line.js';
import { attachTickLines } from './tick-lines.js';
import type { DateLineAttachment } from './date-line.js';
import type { TickLineAttachment } from './tick-lines.js';
import { createTextRuler } from './text-ruler.js';
import type { TextRuler } from './text-ruler.js';
import { readPixelProperty } from './pixel-property.js';
import { attachDecorations } from './decorations.js';
import type { DecorationsAttachment } from './decorations.js';
import { KeyedLayer, NestedKeyedLayers } from './sync-keyed.js';
import { applyElementDescription } from './element-description.js';
import { cssEscapeAttr } from './css-escape.js';
import {
  BAR_CLASS,
  BAR_HANDLE_CLASS,
  BAR_TESTID,
  COLUMN_HEADER_CLASS,
  DEFAULT_BAR_LABEL_GAP_PX,
  ENTRY_ID_KEY,
  FIELD_KEY,
  ITEM_ID_KEY,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_ID_KEY,
  ROW_LABEL_CLASS,
  ROW_LABEL_TEXT_CLASS,
  ROW_TESTID,
  ROW_TWISTY_CLASS,
  SEGMENT_ID_KEY,
  TESTID_KEY,
} from './dom-contract.js';

/** A cell's renderer, already bound to its `ResolvedColumn` (render/dom never receives that type —
 *  `column.format` "stays on `ResolvedColumn` and never reaches a backend", `layout/column.ts`) and
 *  keyed by `GanttShell` per `FrameColumn.field` (S5.4, D-S5-11). */
type BoundCellRenderer = (ctx: {
  entry?: Entry | undefined;
  row: FrameRow;
  value: string;
}) => ElementDescription | undefined;

/** A header renderer, already bound to its `ResolvedColumn` the same way `BoundCellRenderer` above
 *  is bound (render/dom never receives `ResolvedColumn` either) — nothing else varies per header
 *  cell, so the bound form takes no context at all. */
type BoundHeaderRenderer = () => ElementDescription | undefined;

/** Every field here is mandatory, and so is the parameter that carries it (#212): a backend with no
 *  way to look up an Entry cannot answer "is this whole-span bar's Entry selected", so it must not
 *  compile. A caller with no real Entry store still names the gap out loud —
 *  `entryById: () => undefined`, `index.test.ts`'s own `paintingBackend` helper — rather than getting
 *  it for free by omitting the whole options object. */
export interface DomBackendOptions {
  entryById: (id: EntryId) => Entry | undefined;
  /** S5.12, D-S5-40: where a renderer that threw is reported. `GanttShell` passes the raiser bound to
   *  its own `error` bus. Omitted — a test backend built with no options — the console fallback runs
   *  every time, which is the honest answer when there is no bus for anyone to subscribe to. */
  raiseError?: RaiseError;
  /** J1. Read fresh every `syncBars` call, same live-reconfiguration posture `resolveBarRenderer`
   *  below already takes — a closure over `FrameSettings`, not a value snapshotted at construction.
   *  Omitted — a test backend built with no options — falls back to `'fitBar'`. */
  readBarLabels?: () => BarLabels;
  resolveBarRenderer: (entry: Entry) => ResolvedRenderer<BarRenderer> | undefined;
  resolveCellRenderer: (columnKey: string) => ResolvedRenderer<BoundCellRenderer> | undefined;
  resolveHeaderRenderer: (columnKey: string) => ResolvedRenderer<BoundHeaderRenderer> | undefined;
}

function callRenderer<TCtx>(
  point: string,
  resolved: ResolvedRenderer<(ctx: TCtx) => ElementDescription | undefined>,
  ctx: TCtx,
  raiseError: RaiseError,
): ElementDescription | undefined {
  try {
    return resolved.renderer(ctx);
  } catch (error) {
    // Issue #137 F14: one bad renderer degrades one bar or cell, never the paint pass.
    // S5.12, D-S5-41: the report always goes out; the `console.error` behind it is a fallback that
    // fires only when nothing is subscribed to `error`. It is no longer behind `isDevMode()` — that
    // helper reads `import.meta.env.DEV`, which Vite resolves when *this repo* builds `dist/`, so the
    // line was dead-code-eliminated out of every consumer's build, dev and production alike.
    const plugin = resolved.pluginId !== undefined ? ` from plugin "${resolved.pluginId}"` : '';
    const message = `${point}Renderer${plugin} threw — falling back to the default output`;
    raiseError(
      {
        code: 'renderer-failed',
        message,
        severity: 'warning',
        by: resolved.pluginId ?? 'core',
        cause: error,
      },
      () => console.error(`FreeGantt: ${message}`, error),
    );
    return undefined;
  }
}

type TickGeom = Pick<FrameHeaderTick, 'x' | 'width' | 'label'>;
type CellItem = {
  key: string;
  text: string;
  first: boolean;
  /** 1-based position among the configured Grid columns — `aria-colindex` (S5.11, D-S5-25). 1-based
   *  because that is what the attribute counts in; a reorder moves it, which is the point. */
  columnIndex: number;
  align: ColumnAlign;
  width?: number;
  flex?: number;
  expandable: boolean;
  expanded: boolean;
  /** S5.4, D-S5-11: a resolved `cellRenderer`'s output for this one cell — undefined keeps `text`. */
  content?: ElementDescription;
  /** S5.7, D-S5-18: header cells only — `cellItemsForRow`'s row cells never set these. */
  resizable?: boolean;
  movable?: boolean;
};
type CellGeom = {
  text: string;
  first: boolean;
  columnIndex: number;
  align: ColumnAlign;
  width: number;
  flex: number;
  expandable: boolean;
  expanded: boolean;
  content?: ElementDescription;
};
type HeaderCellGeom = {
  text: string;
  columnIndex: number;
  align: ColumnAlign;
  width: number;
  flex: number;
  /** S5.7, D-S5-18: default `true` when absent — painted as an attribute so the base stylesheet can
   *  hide the resizer grip / drop the movable cursor for a fixed or pinned column. */
  resizable: boolean;
  movable: boolean;
  /** Bug hunt (S5 fixes): a resolved `headerRenderer`'s output for this one header cell — undefined
   *  keeps `text`, same posture `content` already takes on `CellGeom` above. */
  content?: ElementDescription;
};
type RowGeom = {
  top: number;
  height: number;
  cells: readonly string[];
  index: number;
  rowCount: number;
  /** S5.11, D-S5-25: `aria-level`, `aria-expanded`, `aria-posinset` and `aria-setsize` belong to a
   *  `treegrid` row. A flat `grid` row takes `aria-rowindex` alone. */
  tree: boolean;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  matched?: boolean;
};
/** The timeline pane's own zebra band for one row — the same paint `.fg-row` carries in the grid
 *  pane, from the same `FrameRow`, so both panes stripe the same rows (I9's pixel identity applies
 *  to the row's background too, not just its top/height). */
type RowBandGeom = {
  top: number;
  height: number;
  parity: RowParity;
};
type BarGeom = Pick<
  FrameBar,
  'variant' | 'label' | 'x' | 'y' | 'width' | 'height' | 'flags' | 'a11yLabel' | 'span'
> & {
  /** S5.4, D-S5-11: a resolved `barRenderer`'s output for this one bar — undefined keeps `label`. */
  content?: ElementDescription;
  /** #212: the Segment this bar draws right now, or nothing for a whole-span bar. It is a per-frame
   *  fact, so it rides the geom and the stamp moves with it. */
  segmentId: SegmentId | undefined;
  /** J1: where this frame's label paints, or `undefined` for no label at all (`barLabels: 'none'`,
   *  or a `barRenderer` result already owns this bar's content). */
  labelPlacement: BarLabelPlacement | undefined;
};
/** 1-based, so the first row reads 'odd' — the same counting `--fg-row-odd-bg` is named for. The
 *  absolute frame row index drives it, never DOM child position: the row layer only holds the
 *  windowed rows, so `:nth-child` flips the whole zebra one row out of phase as soon as the pane
 *  scrolls. */
type RowParity = 'odd' | 'even';

function rowParity(index: number): RowParity {
  return index % 2 === 0 ? 'odd' : 'even';
}

/** J1's whole rule, pure arithmetic (no DOM read): `'fitBar'` reads inside when the label fits,
 *  outside to the right when it does not, and falls back to inside — ellipsised, by the CSS `.fg-
 *  bar-label` rule already carries — when neither clause holds. `'inside'`/`'outside'` force one
 *  answer, but still fall back to inside when the forced side has no room: an `'outside'` label past
 *  `contentWidth` would inflate the pane's own scrollable extent (`e2e/timeline-content-width.spec.ts`),
 *  which no forced mode is worth breaking for. `undefined` textWidth (no 2d context to measure with)
 *  always reads `'inside'` — today's exact behaviour, so a stub DOM never invents pixels it cannot
 *  measure. */
function resolveBarLabelPlacement(
  mode: BarLabels,
  textWidth: number | undefined,
  barX: number,
  barWidth: number,
  gapPx: number,
  contentWidth: number,
): BarLabelPlacement | undefined {
  if (mode === 'none') return undefined;
  if (textWidth === undefined || mode === 'inside') return 'inside';
  const fitsOutside = barX + barWidth + gapPx + textWidth <= contentWidth;
  if (mode === 'outside') return fitsOutside ? 'outside' : 'inside';
  // 'fitBar': inside first, outside only when it does not fit, inside (ellipsised) as the last resort.
  const fitsInside = textWidth + 2 * gapPx <= barWidth;
  if (fitsInside) return 'inside';
  return fitsOutside ? 'outside' : 'inside';
}

/** Does this paint own the bar's content, or only decorate it (ADR 0018, `J34`)? A description that
 *  names `text`, `html` or `children` replaces what the library would draw, label included. One that
 *  names only `class`, `style` or `attrs` says nothing about content, so the library's own label
 *  stays. Core's `parent` variant is the first caller: it adds `fg-bar-summary` and keeps the
 *  label — which is what the deleted `BAR_SHAPE_CLASS` lookup used to do, without being a table
 *  keyed by a variant name. */
function paintsItsOwnContent(description: ElementDescription): boolean {
  return (
    description.text !== undefined || description.html !== undefined || description.children !== undefined
  );
}

/** What a bar node shows: the paint's own content, the paint's decoration over the library's label,
 *  or the library's label alone. */
function barContent(painted: ElementDescription | undefined, label: ElementDescription): ElementDescription {
  if (painted === undefined) return label;
  if (paintsItsOwnContent(painted)) return painted;
  return { ...painted, ...label };
}
/** What the shared handle pair (D-S3-8) needs to place itself over a committed bar — a narrower slice
 *  than `BarGeom`, which also carries paint fields the handles don't read. */
type HandleGeom = Pick<FrameBar, 'x' | 'y' | 'width' | 'height'>;
/** Bands carry no per-frame geometry of their own yet (height/stacking is S1.9/S1.10) — an always-
 * equal geom means `syncKeyed` patches a band node once, at creation, and never again. */
type BandGeom = Record<string, never>;
const EMPTY_BAND_GEOM: BandGeom = Object.freeze({});

/** `data-flag` is generated from `BarFlags`' own keys, not hand-mapped (S1.10, D-S1.10-2) — adding a
 * new `BarFlags` key needs no edit here (U7). */
function flagTokens(flags: BarFlags): string {
  return (Object.keys(flags) as (keyof BarFlags)[]).filter((k) => flags[k]).join(' ');
}

function cellItemsFor(
  cells: readonly string[],
  columns: readonly FrameColumn[],
  expandable: boolean,
  expanded: boolean,
): readonly CellItem[] {
  return cells.map((text, i) => {
    const column = columns[i];
    const item: CellItem = {
      key: column !== undefined ? String(column.field) : String(i),
      text,
      first: i === 0,
      columnIndex: i + 1,
      align: column?.align ?? 'start',
      expandable: i === 0 && expandable,
      expanded,
    };
    if (column?.width !== undefined) item.width = column.width;
    if (column?.flex !== undefined) item.flex = column.flex;
    return item;
  });
}

function paintColumnBox(node: HTMLElement, geom: { width: number; flex: number; align: ColumnAlign }): void {
  node.dataset['align'] = geom.align;
  if (geom.width > 0) {
    node.style.width = `${geom.width}px`;
    node.setAttribute('data-fixed', '');
  } else {
    node.style.width = '';
    node.removeAttribute('data-fixed');
  }
  if (geom.flex > 0) node.style.setProperty('--fg-col-flex', String(geom.flex));
  else node.style.removeProperty('--fg-col-flex');
}

function cellGeom(item: CellItem): CellGeom {
  return {
    text: item.text,
    first: item.first,
    columnIndex: item.columnIndex,
    align: item.align,
    width: item.width ?? 0,
    flex: item.flex ?? 0,
    expandable: item.expandable,
    expanded: item.expanded,
    ...(item.content !== undefined ? { content: item.content } : {}),
  };
}

export function createDomBackend(options: DomBackendOptions): RenderBackend<HTMLElement> {
  const { entryById, resolveBarRenderer, resolveCellRenderer, resolveHeaderRenderer } = options;
  const readBarLabels = options.readBarLabels ?? ((): BarLabels => 'fitBar');
  // No injected raiser means no bus, so nothing can be subscribed and the fallback always runs.
  const raiseError: RaiseError = options.raiseError ?? ((_report, fallback) => fallback?.());
  // The grid pane's row layer (RenderSurfaces.grid) — created by `view/pane-layout.ts`, not this
  // backend (S1.8, D-S1.8-2). No scrollbar of its own: it follows the timeline pane's scroll
  // position by one `translateY(-visible.y)` per frame (D-S1.8-1), written in `sync()` below.
  let gridLayer: HTMLElement | undefined;
  let gridHeaderLayer: HTMLElement | undefined;
  /** S5.7, D-S5-18: written by `syncGridHeader`, read by `applyState`'s drop-indicator paint for the
   *  `beforeColumnKey: null` ("at the end") case. */
  let lastHeaderColumnKeys: readonly string[] = [];
  /** What `applyState`'s resize-preview paint last touched (S5.7, D-S5-18) — diff-and-touch-only,
   *  the same posture every other `paintedX` field in this file already takes (I5). */
  let paintedColumnResize: { columnKey: string; widthPx: number } | undefined;
  /** The two header cells a reorder preview last touched: the one wearing `data-drop`, and the
   *  grabbed one wearing the follow transform. Kept apart because they clear on different keys — the
   *  drop target changes on nearly every `pointermove`, the grabbed cell never does. */
  let paintedColumnDropKey: string | undefined;
  let paintedColumnDragKey: string | undefined;
  // The timeline pane's content layer (RenderSurfaces.timeline) — this backend's own header, bar
  // and sizer layers mount inside it, at x=0: no gutter to offset by, the grid pane owns that width.
  let timelineHost: HTMLElement | undefined;
  let headerLayer: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;
  let rowBandLayer: HTMLElement | undefined;
  let contentSizer: HTMLElement | undefined;
  let dateLines: DateLineAttachment | undefined;
  let tickLines: TickLineAttachment | undefined;
  let decorations: DecorationsAttachment | undefined;
  // D-S3-8: one shared handle pair, created once at mount() and moved/parked by applyState — never
  // one pair per bar.
  let startHandle: HTMLElement | undefined;
  let endHandle: HTMLElement | undefined;
  // S3.8, D-S3-15: Cursor line singletons, created once at mount() and moved/parked by applyState.
  let cursorLine: HTMLElement | undefined;
  let cursorLineLabel: HTMLElement | undefined;
  let cursorLineHeight = 0;
  // J1: one ruler per backend instance (I2 — never module-level). Built in mount(), off the bar
  // layer's own computed font, and never rebuilt after — a label's font does not change mid-life.
  let textRuler: TextRuler | undefined;
  // --fg-bar-label-gap (px), read once at mount (pixel-property.ts's own re-read cadence rule: a
  // caller states its cadence, and a label's gap does not change with the pane's size).
  let barLabelGapPx = DEFAULT_BAR_LABEL_GAP_PX;
  // The last frame's contentWidth (J1's "outside" clause needs it, and it arrives with `sync`, not
  // with each bar) — read by `toGeom` below, so the fit test always runs against the frame that is
  // actually being painted.
  let contentWidthPx = 0;

  const bandLayer = new KeyedLayer<FrameHeaderBand, number, BandGeom>();
  // One tick layer per band index — a nested keyed list is still a keyed list (plans/01 §8.1's
  // reconciler scope: attr/class/style/text + keyed children, nothing more).
  const bandTickLayers = new NestedKeyedLayers<number, FrameHeaderTick, number, TickGeom>();
  const rowLayer = new KeyedLayer<FrameRow, RowId, RowGeom>();
  const rowBandLayerCache = new KeyedLayer<FrameRow, RowId, RowBandGeom>();
  // One cell layer per row id, same nested pattern as bandTickLayers above.
  const rowCellLayers = new NestedKeyedLayers<RowId, CellItem, string, CellGeom>();
  const headerCellLayer = new KeyedLayer<CellItem, string, HeaderCellGeom>();
  const barLayerCache = new KeyedLayer<FrameBar, ItemId, BarGeom>();

  // D-S3-6/D-S3-7: what the last applyState() call painted, so the next call touches only the bars
  // whose token set actually changed — O(changed items), not O(bars) (I5, [S3-A3]).
  let paintedHovered: ItemId | undefined;
  let paintedSelected: ReadonlySet<ItemId> = new Set();
  /** The Entry the handle pair currently brackets (#200) — Entry-keyed, like the Selection it sits
   *  beside, because the pair straddles every bar that Entry drew. */
  let paintedResizable: EntryId | undefined;
  /** #142: which of the two handles `paintedResizable` last let resize — `applyState`'s repaint
   *  gate reads this alongside `paintedResizable`/`paintedHandleBars` so a Field-driven edge flip
   *  repaints even when the bracketed Entry and its bars have not changed. */
  let paintedResizableEdges: { start: boolean; end: boolean } | undefined;
  /** The two bars `paintResizeHandles` last put the handles on. `hitTest` reads it, so a grab on a
   *  handle names the bar under the pointer instead of an Item id built from an Entry id (#185). */
  let paintedHandleBars: { start: ItemId; end: ItemId } | undefined;
  let paintedMovable: ItemId | undefined;
  /** S3.5, D-S3-17: bars an unsettled `beforeEntryMove`/`beforeEntryResize` Promise is holding. */
  let paintedPending: ReadonlySet<ItemId> = new Set();
  /** S3.3, D-S3-18: items this backend currently holds off their committed transform for a drag
   *  preview — so the next `applyState` knows which ones to park back when they drop out of the set. */
  let paintedPreview: ReadonlySet<ItemId> = new Set();
  /** S3.6, D-S3-18: split of `paintedPreview` by `ItemPreview.extra` — `dragging` is the caller's own
   *  gesture, `ghost` is an installed extension hook's cascade. Tracked separately from
   *  `paintedPreview` (which drives the transform, not the token) so a `data-state` repaint touches
   *  only the items whose *token* actually changed, same diff-and-touch pattern as `paintedPending`. */
  let paintedDragging: ReadonlySet<ItemId> = new Set();
  let paintedGhost: ReadonlySet<ItemId> = new Set();
  /** The Selection this backend last painted (#212, ADR 0010) — Segment ids, the same list the shell
   *  wrote. `applyState` diffs against it, and both remount paths (`syncRows`, `syncBars`) restamp a
   *  freshly-created node from it. `paintedSelected` above is its bar-side reading, derived from
   *  `itemIdsBySegmentId` rather than authored. */
  let paintedSelectedSegmentIds: ReadonlySet<SegmentId> = new Set();
  /** What the last `applyState` call stamped `data-state~="selected"` on (D-S3-6/D-S3-7's own
   *  diff-and-touch posture, applied to rows) — `syncRows` below is the only other writer, and only
   *  for a row it just created. */
  let paintedSelectedRows: ReadonlySet<RowId> = new Set();
  /** The row `applyState` last stamped `data-state~="hovered"` on, the same diff base its selected
   *  twin above keeps. */
  let paintedHoveredRow: RowId | undefined;
  /** The Segments each mounted row owns (a header row owns none) — what `applyState`'s row diff
   *  reads `FrameRow.segmentIds` into (#230 R5), so the row diff never resolves an Entry to answer
   *  it. `syncRows` is the only writer, rebuilt from the frame's own rows every render — never grows
   *  stale across a prune. */
  const rowSegmentIds = new Map<RowId, readonly SegmentId[]>();
  // Committed geometry per mounted bar (D-S3-6): what the handle pair and the future preview offsets
  // (S3.3) both read. `syncBars` is the only writer.
  const barGeomByItemId = new Map<ItemId, HandleGeom>();
  /** J1: each mounted bar's label width, measured once in `syncBars`'s own `toGeom` and read again,
   *  with no re-measurement, by `applyBarPreview`'s mid-drag flip check — "a label's text width does
   *  not change during a drag" is the fact this cache banks on. `undefined` means either no label
   *  (`barLabels: 'none'`, or a `barRenderer` owns this bar's content) or no 2d context to measure
   *  with; both read the same as "never flips to outside". */
  const labelWidthByItemId = new Map<ItemId, number | undefined>();
  /** J1: each mounted bar's last-committed label placement — what `restoreBarTransform` puts back on
   *  `data-label` once a resize preview that flipped it mid-drag clears without a commit. Written in
   *  `syncBars`'s own `toGeom`, the same cadence `labelWidthByItemId` keeps. */
  const labelPlacementByItemId = new Map<ItemId, BarLabelPlacement | undefined>();
  /** The mounted bars of each Entry (#185) — the Entry→Items relation, read straight off the frame
   *  `syncBars` synced. It is what turns the Entry-keyed Selection into the bars that paint, so no
   *  paint step ever builds an Item id out of an Entry id. `syncBars` is the only writer. */
  const itemIdsByEntryId = new Map<EntryId, ItemId[]>();
  /** The mounted bars that paint for each Segment (#212, ADR 0010) — the Segment→Items relation the
   *  Selection is keyed by. A bar that drew one Segment is filed under it. A bar that drew an Entry's
   *  whole span (a parent, or a plugin's own variant) is filed under every Segment of that Entry,
   *  because any of them selects it. `syncBars` is the only writer, so the selection diff never scans
   *  mounted bars. */
  const itemIdsBySegmentId = new Map<SegmentId, ItemId[]>();
  /** Which Segment each mounted bar drew, or nothing for a whole-span bar. The handle pair reads it
   *  to find the one bar a one-Segment Selection named. `syncBars` is the only writer. */
  const segmentIdByItemId = new Map<ItemId, SegmentId>();

  /** The two bars the handle pair sits on: the Entry's leftmost mounted bar and its rightmost one
   *  (#200). A resize acts on the Entry's envelope, so a segmented Entry hands its `start` handle to
   *  one bar and its `end` handle to another; an Entry that drew one bar names it twice, exactly as
   *  before. Undefined when the Entry has no mounted bar to hold either handle. */
  function envelopeBarsOfEntry(id: EntryId | undefined): { start: ItemId; end: ItemId } | undefined {
    if (id === undefined) return undefined;
    const mounted = itemIdsByEntryId.get(id);
    if (mounted === undefined || mounted.length === 0) return undefined;
    let start = mounted[0]!;
    let end = start;
    for (const item of mounted) {
      const geom = barGeomByItemId.get(item);
      if (geom === undefined) continue;
      if (geom.x < barGeomByItemId.get(start)!.x) start = item;
      const endGeom = barGeomByItemId.get(end)!;
      if (geom.x + geom.width > endGeom.x + endGeom.width) end = item;
    }
    return { start, end };
  }

  /** The two bars the handle pair sits on for `id`, read from the Selection the bars already paint
   *  from (#211, #212). A Selection that holds exactly one Segment of this Entry gets both handles on
   *  that one bar, because a resize on it writes only that Segment's edge. Anything else — every
   *  Segment selected, or none — falls back to the envelope pair above. */
  function resizeHandleBarsOfEntry(id: EntryId | undefined): { start: ItemId; end: ItemId } | undefined {
    if (id === undefined) return undefined;
    const selected = selectedBarsOfEntry(id);
    const sole = selected.length === 1 ? selected[0]! : undefined;
    if (sole !== undefined && barGeomByItemId.has(sole)) return { start: sole, end: sole };
    return envelopeBarsOfEntry(id);
  }

  /** The mounted bars of this Entry whose own Segment the Selection holds (#212). A whole-span bar
   *  names no Segment, so it never appears here and the Entry falls back to its envelope. */
  function selectedBarsOfEntry(id: EntryId): readonly ItemId[] {
    const mounted = itemIdsByEntryId.get(id);
    if (mounted === undefined) return [];
    return mounted.filter((item) => {
      const segmentId = segmentIdByItemId.get(item);
      return segmentId !== undefined && paintedSelectedSegmentIds.has(segmentId);
    });
  }

  /** Same two bars, or both undefined — the identity check `applyState`'s handle repaint needs
   *  (#211). A pick can arrive while `resizableEntryId` names the same Entry it already did (a click
   *  on an already-hovered bar), so gating the repaint on Entry identity alone would leave the pair
   *  glued to its pre-pick bars while the draft it grabs has already moved. */
  function sameBars(
    a: { start: ItemId; end: ItemId } | undefined,
    b: { start: ItemId; end: ItemId } | undefined,
  ): boolean {
    if (a === undefined || b === undefined) return a === b;
    return a.start === b.start && a.end === b.end;
  }

  /** #142: the identity check `applyState`'s handle repaint needs for the per-edge answer, the same
   *  role `sameBars` fills for which bars the pair sits on. */
  function sameEdges(
    a: { start: boolean; end: boolean } | undefined,
    b: { start: boolean; end: boolean } | undefined,
  ): boolean {
    if (a === undefined || b === undefined) return a === b;
    return a.start === b.start && a.end === b.end;
  }

  /** Moves the shared handle pair onto `bars`' own committed geometry, or parks both (D-S3-8) when
   *  it is undefined. Each handle reads its own bar, so a packed Entry whose Segments sit in two
   *  lanes still gets each handle on the right row (#200). `hidden` is a DOM property write, not
   *  `.style` — the base stylesheet owns `[hidden] { display: none }`.
   *
   *  #142/#256: `edges` hides one handle independently of the other — one write answer can close
   *  `end` while `start` still drags. Default both open, so a caller with nothing to say about edges
   *  (there is none left in this file, but a future one might arrive with `bars` alone) still shows
   *  a whole pair, matching the pre-#142 pair-only behaviour. */
  function paintResizeHandles(
    bars: { start: ItemId; end: ItemId } | undefined,
    edges: { start: boolean; end: boolean } = { start: true, end: true },
  ): void {
    if (!startHandle || !endHandle) return;
    const startGeom = bars === undefined ? undefined : barGeomByItemId.get(bars.start);
    const endGeom = bars === undefined ? undefined : barGeomByItemId.get(bars.end);
    const showStart = startGeom !== undefined && edges.start;
    const showEnd = endGeom !== undefined && edges.end;
    if (!showStart && !showEnd) {
      startHandle.hidden = true;
      endHandle.hidden = true;
      paintedHandleBars = undefined;
      return;
    }
    startHandle.hidden = !showStart;
    if (startGeom !== undefined && edges.start) {
      startHandle.style.transform = `translate(${startGeom.x}px, ${startGeom.y}px)`;
      startHandle.style.height = `${startGeom.height}px`;
    }
    endHandle.hidden = !showEnd;
    if (endGeom !== undefined && edges.end) {
      endHandle.style.transform = `translate(${endGeom.x + endGeom.width}px, ${endGeom.y}px)`;
      endHandle.style.height = `${endGeom.height}px`;
    }
    paintedHandleBars = bars;
  }

  /** S3.8, D-S3-15: parks the Cursor line when `x` is undefined; otherwise translates the stroke
   *  and writes the snapped caption. Height comes from the last `sync()`, same rule as Date lines. */
  function paintCursorLine(x: number | undefined, label: string | undefined): void {
    if (!cursorLine || !cursorLineLabel) return;
    if (x === undefined) {
      cursorLine.hidden = true;
      cursorLineLabel.hidden = true;
      return;
    }
    cursorLine.hidden = false;
    cursorLine.style.transform = `translateX(${x}px)`;
    cursorLine.style.height = `${cursorLineHeight}px`;
    cursorLineLabel.hidden = label === undefined || label === '';
    cursorLineLabel.style.transform = `translateX(${x}px)`;
    cursorLineLabel.textContent = label ?? '';
  }

  /** S5.7, D-S5-18: a resize drag's live width, painted on the header cell and every currently
   *  mounted body cell for that column — the same `data-field` attribute `cellSpec`/`headerCellSpec`
   *  already stamp, so no second index is needed to find them. Diffs against what was last painted
   *  (I5): a no-op when neither the column nor the width actually changed. */
  /** Puts the header cell and every mounted body cell for `columnKey` back to the geometry
   *  `syncKeyed` last patched onto them — the real committed width/flex, not whatever a live resize
   *  preview overwrote it with. Used only when a resize preview clears (D-S5-18: "a refused drag must
   *  leave nothing behind") — the queued `requestFrame()` will still repaint on the next frame, but
   *  that must not be the only thing standing between a veto and a stuck `width: …px` in the meantime. */
  function restoreColumnBox(columnKey: string): void {
    const headerGeom = headerCellLayer.geom(columnKey);
    const header = headerCellLayer.node(columnKey);
    if (header && headerGeom) paintColumnBox(header, headerGeom);
    rowCellLayers.forEach((layer) => {
      const geom = layer.geom(columnKey);
      const node = layer.node(columnKey);
      if (node && geom) paintColumnBox(node, geom);
    });
  }

  function paintColumnResizePreview(preview: { columnKey: string; widthPx: number } | undefined): void {
    if (
      preview !== undefined &&
      paintedColumnResize !== undefined &&
      paintedColumnResize.columnKey === preview.columnKey &&
      paintedColumnResize.widthPx === preview.widthPx
    ) {
      return;
    }
    const clearedColumnKey = paintedColumnResize?.columnKey;
    paintedColumnResize = preview;
    if (preview === undefined) {
      if (clearedColumnKey !== undefined) restoreColumnBox(clearedColumnKey);
      return;
    }
    const px = `${preview.widthPx}px`;
    const header = headerCellLayer.node(preview.columnKey);
    if (header) {
      header.style.width = px;
      header.setAttribute('data-fixed', '');
    }
    if (gridLayer) {
      const selector = `[data-field="${cssEscapeAttr(preview.columnKey)}"]`;
      gridLayer.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        node.style.width = px;
        node.setAttribute('data-fixed', '');
      });
    }
  }

  /** S5.7, D-S5-18: `data-drop` on the header cell a reorder would land before — or, for `null`
   *  ("at the end"), on the last header cell with `data-drop="after"` instead of `"before"`, so the
   *  stylesheet can paint the indicator on the correct edge. */
  function paintColumnDropIndicator(beforeColumnKey: string | null): void {
    const targetKey = beforeColumnKey ?? lastHeaderColumnKeys[lastHeaderColumnKeys.length - 1];
    if (targetKey === paintedColumnDropKey && targetKey !== undefined) {
      // Same cell as last move: only the edge can still differ, and setting the same value again is
      // free — no attribute churn on the neighbours (I5).
      headerCellLayer
        .node(targetKey)
        ?.setAttribute('data-drop', beforeColumnKey === null ? 'after' : 'before');
      return;
    }
    clearColumnDropIndicator();
    if (targetKey === undefined) return;
    const node = headerCellLayer.node(targetKey);
    if (!node) return;
    node.setAttribute('data-drop', beforeColumnKey === null ? 'after' : 'before');
    paintedColumnDropKey = targetKey;
  }

  function clearColumnDropIndicator(): void {
    if (paintedColumnDropKey === undefined) return;
    headerCellLayer.node(paintedColumnDropKey)?.removeAttribute('data-drop');
    paintedColumnDropKey = undefined;
  }

  /** S5.7, D-S5-18: the grabbed header cell follows the pointer. A `translateX` on the cell itself
   *  plus one `data-dragging` attribute for the lifted bar — a hot-path write only (I5): the cell
   *  keeps its slot in the header's flex flow, so no neighbour reflows and every other cell's
   *  on-screen position holds still for the whole drag. */
  function paintColumnDrag(columnKey: string, offsetPx: number): void {
    if (paintedColumnDragKey !== undefined && paintedColumnDragKey !== columnKey) clearColumnDrag();
    const node = headerCellLayer.node(columnKey);
    if (!node) return;
    node.style.transform = `translateX(${offsetPx}px)`;
    node.setAttribute('data-dragging', '');
    paintedColumnDragKey = columnKey;
  }

  function clearColumnDrag(): void {
    if (paintedColumnDragKey === undefined) return;
    const node = headerCellLayer.node(paintedColumnDragKey);
    if (node) {
      node.style.removeProperty('transform');
      node.removeAttribute('data-dragging');
    }
    paintedColumnDragKey = undefined;
  }

  /** S5.7, D-S5-18: one reorder drag's whole live paint — the grabbed cell's follow transform and
   *  the drop indicator, which always move together. `undefined` (Escape, or a vetoed drop) parks
   *  both: a refused reorder leaves nothing behind. */
  function paintColumnReorderPreview(preview: InteractionState['columnReorderPreview']): void {
    if (preview === undefined) {
      clearColumnDrag();
      clearColumnDropIndicator();
      return;
    }
    paintColumnDrag(preview.columnKey, preview.offsetPx);
    paintColumnDropIndicator(preview.beforeColumnKey);
  }

  /** Applies the base committed transform (`syncBars`'s own geometry) to one bar — what a previewed
   *  bar returns to once the preview clears (S3.3, D-S3-18). */
  function restoreBarTransform(id: ItemId): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByItemId.get(id);
    if (!node || !geom) return;
    node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
    node.style.width = `${geom.width}px`;
    // J1: a resize preview that flipped the label mid-drag (see applyBarPreview) must not leave that
    // flip stamped once the preview clears without a commit — restore syncBars's own last answer.
    const committed = labelPlacementByItemId.get(id);
    if (committed === undefined) delete node.dataset['label'];
    else node.dataset['label'] = committed;
  }

  /** Offsets one bar's transform/width by `preview`'s px delta, on top of its committed geometry —
   *  a hot-path write only (I5): no frame recompute, no node creation. */
  function applyBarPreview(id: ItemId, preview: ItemPreview): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByItemId.get(id);
    if (!node || !geom) return;
    const x = geom.x + preview.dx;
    const width = geom.width + preview.dWidth;
    node.style.transform = `translate(${x}px, ${geom.y}px)`;
    if (preview.dWidth === 0) return;
    node.style.width = `${width}px`;
    // J1: a resize preview can cross the inside/outside fit line mid-drag. Reuse the label width
    // syncBars already measured — no canvas call on the hot path — and touch the dataset only on an
    // actual flip, the same diff-and-touch-only posture every other paintedX field in this file keeps.
    const textWidth = labelWidthByItemId.get(id);
    if (textWidth === undefined) return;
    const placement = resolveBarLabelPlacement(
      readBarLabels(),
      textWidth,
      x,
      width,
      barLabelGapPx,
      contentWidthPx,
    );
    if (placement === (node.dataset['label'] as BarLabelPlacement | undefined)) return;
    if (placement === undefined) delete node.dataset['label'];
    else node.dataset['label'] = placement;
  }

  function paintPreview(previews: readonly ItemPreview[] | undefined): void {
    const next = new Map<ItemId, ItemPreview>();
    for (const preview of previews ?? []) next.set(preview.itemId, preview);
    paintedPreview.forEach((id) => {
      if (!next.has(id)) restoreBarTransform(id);
    });
    next.forEach((preview, id) => applyBarPreview(id, preview));
    paintedPreview = new Set(next.keys());

    // S3.6, D-S3-18: `dragging` (the caller's own draft) vs `ghost` (an installed extension hook's
    // `extra`, U7) — same diff-and-touch-only-changed shape `applyState`'s selected/pending sets use.
    const nextDragging = new Set<ItemId>();
    const nextGhost = new Set<ItemId>();
    next.forEach((preview, id) => (preview.extra ? nextGhost : nextDragging).add(id));
    const changed = new Set<ItemId>();
    paintedDragging.forEach((id) => {
      if (!nextDragging.has(id)) changed.add(id);
    });
    nextDragging.forEach((id) => {
      if (!paintedDragging.has(id)) changed.add(id);
    });
    paintedGhost.forEach((id) => {
      if (!nextGhost.has(id)) changed.add(id);
    });
    nextGhost.forEach((id) => {
      if (!paintedGhost.has(id)) changed.add(id);
    });
    changed.forEach((id) =>
      paintDataState(id, paintedHovered, paintedSelected, paintedPending, nextDragging, nextGhost),
    );
    paintedDragging = nextDragging;
    paintedGhost = nextGhost;
  }

  function paintDataState(
    itemId: ItemId,
    hovered: ItemId | undefined,
    selected: ReadonlySet<ItemId>,
    pending: ReadonlySet<ItemId>,
    dragging: ReadonlySet<ItemId>,
    ghost: ReadonlySet<ItemId>,
  ): void {
    const node = barLayerCache.node(itemId);
    if (!node) return;
    const tokens: string[] = [];
    if (hovered === itemId) tokens.push('hovered');
    if (selected.has(itemId)) tokens.push('selected');
    if (pending.has(itemId)) tokens.push('pending');
    if (dragging.has(itemId)) tokens.push('dragging');
    if (ghost.has(itemId)) tokens.push('ghost');
    node.dataset['state'] = tokens.join(' ');
  }

  /** Adds the bars one Segment paints to `into` (#212) — its own bar, plus the whole-span bar of the
   *  Entry that owns it. A Segment the viewport culled adds nothing, and `syncBars`'s own restamp
   *  paints its bar when it comes back. */
  function addBarsOfSegment(into: Set<ItemId>, segmentId: SegmentId): void {
    const mounted = itemIdsBySegmentId.get(segmentId);
    if (mounted === undefined) return;
    for (const id of mounted) into.add(id);
  }

  /** The bars the whole Selection paints (#212) — every selected Segment read through the rule above. */
  function paintedBarsOf(segmentIds: ReadonlySet<SegmentId>): Set<ItemId> {
    const ids = new Set<ItemId>();
    segmentIds.forEach((segmentId) => addBarsOfSegment(ids, segmentId));
    return ids;
  }

  /** A row's own paint — two of the bar's five tokens, never the other three (a row has no
   *  pending/drag/ghost state). Written to the grid row *and* to that row's timeline band, off one
   *  answer, so a hovered or selected row reads the same on both sides of the splitter. A row whose
   *  band the viewport culled just misses that half; the next `syncRowBands` restamps it. */
  function paintRowState(rowId: RowId, selected: boolean, hovered: boolean): void {
    const tokens: string[] = [];
    if (hovered) tokens.push('hovered');
    if (selected) tokens.push('selected');
    const state = tokens.join(' ');
    const row = rowLayer.node(rowId);
    if (row) row.dataset['state'] = state;
    const band = rowBandLayerCache.node(rowId);
    if (band) band.dataset['state'] = state;
  }

  const tickSpec = {
    key: (_tick: FrameHeaderTick, i: number) => i,
    create: (): HTMLElement => {
      const node = document.createElement('div');
      node.className = 'fg-tick';
      return node;
    },
    toGeom: (tick: FrameHeaderTick): TickGeom => ({ x: tick.x, width: tick.width, label: tick.label }),
    patch: (node: HTMLElement, geom: TickGeom): void => {
      node.style.transform = `translateX(${geom.x}px)`;
      node.style.width = `${geom.width}px`;
      node.textContent = geom.label;
    },
  };

  // Bands keyed by index, coarsest first (D-S1.7-6); ticks keyed within a band. Today every shipped
  // preset has exactly one header, so this renders byte-identical output to the pre-S1.7 single list.
  function syncHeader(bands: readonly FrameHeaderBand[]): void {
    if (!headerLayer) return;
    bandLayer.sync(headerLayer, bands, {
      key: (_band, i) => i,
      create: () => {
        const node = document.createElement('div');
        node.className = 'fg-band';
        return node;
      },
      toGeom: () => EMPTY_BAND_GEOM,
      patch: () => {},
    });

    bands.forEach((band, i) => {
      const bandNode = bandLayer.node(i);
      if (!bandNode) return;
      bandTickLayers.layerFor(i).sync(bandNode, band.ticks, tickSpec);
    });

    bandTickLayers.prune(new Set(bands.map((_band, i) => i)));
  }

  const cellSpec = {
    key: (cell: CellItem) => cell.key,
    create: (_cell: CellItem, key: string): HTMLElement => {
      const node = document.createElement('div');
      node.dataset[FIELD_KEY] = key;
      // S5.11, D-S5-25: one Grid column's box on one Row is a `gridcell`. `tabIndex` stays off the
      // node here — `view/roving-focus.ts` owns which one cell in the pane is the tab stop.
      node.setAttribute('role', 'gridcell');
      const twisty = document.createElement('button');
      twisty.type = 'button';
      twisty.className = ROW_TWISTY_CLASS;
      twisty.hidden = true;
      twisty.setAttribute('aria-label', 'Toggle row');
      const label = document.createElement('span');
      label.className = ROW_LABEL_TEXT_CLASS;
      node.append(twisty, label);
      return node;
    },
    toGeom: (cell: CellItem): CellGeom => cellGeom(cell),
    patch: (node: HTMLElement, geom: CellGeom): void => {
      node.className = geom.first ? ROW_LABEL_CLASS : ROW_CELL_CLASS;
      node.setAttribute('aria-colindex', String(geom.columnIndex));
      paintColumnBox(node, geom);
      const twisty = node.firstElementChild as HTMLButtonElement;
      const label = node.lastElementChild as HTMLElement;
      twisty.hidden = !geom.first || !geom.expandable;
      if (twisty.hidden) twisty.removeAttribute('aria-expanded');
      else twisty.setAttribute('aria-expanded', geom.expanded ? 'true' : 'false');
      applyElementDescription(label, geom.content ?? { text: geom.text });
    },
  };

  const headerCellSpec = {
    key: (cell: CellItem) => cell.key,
    create: (_cell: CellItem, key: string): HTMLElement => {
      const node = document.createElement('div');
      node.className = COLUMN_HEADER_CLASS;
      node.dataset[FIELD_KEY] = key;
      node.setAttribute('role', 'columnheader');
      // S5.11, D-S5-25: one Grid column's header cell is a `columnheader`, inside the header row
      // `view/pane-layout.ts` mounts it in. `tabIndex` stays off the node here — `view/roving-focus.ts`
      // owns which one header cell is the pane's tab stop.
      const label = document.createElement('span');
      label.className = 'fg-col-header-label';
      const resizer = document.createElement('div');
      resizer.className = 'fg-column-resizer';
      resizer.setAttribute('aria-hidden', 'true');
      node.append(label, resizer);
      return node;
    },
    toGeom: (cell: CellItem): HeaderCellGeom => ({
      text: cell.text,
      columnIndex: cell.columnIndex,
      align: cell.align,
      width: cell.width ?? 0,
      flex: cell.flex ?? 0,
      resizable: cell.resizable ?? true,
      movable: cell.movable ?? true,
      ...(cell.content !== undefined ? { content: cell.content } : {}),
    }),
    patch: (node: HTMLElement, geom: HeaderCellGeom): void => {
      // `create` above always appends `label` first — the same structural guarantee the row-cell
      // spec's own twisty/label pair relies on just above.
      const label = node.firstElementChild as HTMLElement;
      applyElementDescription(label, geom.content ?? { text: geom.text });
      node.setAttribute('aria-colindex', String(geom.columnIndex));
      paintColumnBox(node, geom);
      if (geom.resizable) node.removeAttribute('data-resizable-off');
      else node.setAttribute('data-resizable-off', '');
      if (geom.movable) node.removeAttribute('data-movable-off');
      else node.setAttribute('data-movable-off', '');
    },
  };

  function syncRows(
    rows: readonly FrameRow[],
    rowCount: number,
    tree: boolean,
    columns: readonly FrameColumn[],
  ): void {
    if (!gridLayer) return;
    rowSegmentIds.clear();
    for (const row of rows) if (row.segmentIds.length > 0) rowSegmentIds.set(row.id, row.segmentIds);
    rowLayer.sync(gridLayer, rows, {
      key: (row) => row.id,
      create: (row, key) => {
        const node = document.createElement('div');
        node.className = ROW_CLASS;
        // S5.11, D-S5-25: `row`, not `listitem`. A `listitem` has no `list` ancestor here and may
        // not carry `aria-level`, which is what made axe red before this step.
        node.setAttribute('role', 'row');
        node.dataset[TESTID_KEY] = ROW_TESTID;
        node.dataset[ROW_ID_KEY] = key;
        // The Entry this row's cells describe (#185) — the row's subject, not the set it owns. A
        // header row describes none, so it carries no `data-entry-id` at all.
        const subject = row.entryIds[0];
        if (subject !== undefined) node.dataset[ENTRY_ID_KEY] = subject;
        // Bug hunt (S5 fixes): virtualization can create this node well after the selection that
        // ought to paint it — a remounted row must not wait for the next selection change to catch
        // up (D-S5's own "restamp on remount" fix). `paintedSelectedRows` (applyState's own diff
        // set) gains this row too, or the next `applyState` call would see a spurious diff and
        // repaint a node that is already correct.
        if (row.segmentIds.some((id) => paintedSelectedSegmentIds.has(id))) {
          node.dataset['state'] = 'selected';
          paintedSelectedRows = new Set(paintedSelectedRows).add(key);
        }
        return node;
      },
      toGeom: (row) => {
        const geom: RowGeom = {
          top: row.top,
          height: row.height,
          cells: row.cells,
          index: row.index,
          rowCount,
          tree,
          depth: row.depth,
          expandable: row.expandable,
          expanded: row.expanded,
        };
        if (row.matched === false) geom.matched = false;
        return geom;
      },
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.style.setProperty('--fg-row-depth', String(geom.depth));
        // Only the windowed rows exist, so the row states where it sits in the whole set (I3). Every
        // pattern takes `aria-rowindex`; the three tree attributes belong to a `treegrid` alone
        // (S5.11, D-S5-25), and the header row above the body takes index 1.
        node.setAttribute('aria-rowindex', String(geom.index + 2));
        setTreeRowAttributes(node, geom);
        node.dataset['parity'] = rowParity(geom.index);
        if (geom.matched === false) node.dataset['matched'] = 'false';
        else delete node.dataset['matched'];
      },
    });

    syncCellsForEachRow(rows, columns);
  }

  /** `aria-level`, `aria-posinset`, `aria-setsize` and `aria-expanded` describe a row's place in a
   *  tree. A flat `grid` row has no such place, and carrying them there is what `aria-allowed-attr`
   *  refuses (S5.11, D-S5-25, §0.1). `aria-expanded` comes off the row itself, not off the twisty:
   *  the twisty is a button inside the row and states its own expanded status separately. */
  function setTreeRowAttributes(node: HTMLElement, geom: RowGeom): void {
    if (!geom.tree) {
      node.removeAttribute('aria-posinset');
      node.removeAttribute('aria-setsize');
      node.removeAttribute('aria-level');
      node.removeAttribute('aria-expanded');
      return;
    }
    node.setAttribute('aria-posinset', String(geom.index + 1));
    node.setAttribute('aria-setsize', String(geom.rowCount));
    node.setAttribute('aria-level', String(geom.depth + 1));
    if (geom.expandable) node.setAttribute('aria-expanded', geom.expanded ? 'true' : 'false');
    else node.removeAttribute('aria-expanded');
  }

  /** Each row owns a nested keyed list of cells (one per configured column), the same "keyed list
   * inside a keyed list" pattern `syncHeader` uses for ticks inside bands. Split out from `syncRows`
   * because it needs its own per-row layer lookup and its own prune pass.
   *
   * `renderers` is resolved once per frame by the caller, never here (#175) — see below. */
  function cellItemsForRow(
    row: FrameRow,
    columns: readonly FrameColumn[],
    renderers: readonly (ResolvedRenderer<BoundCellRenderer> | undefined)[],
  ): readonly CellItem[] {
    const subject = row.entryIds[0];
    const entry = subject !== undefined ? entryById(subject) : undefined;
    return cellItemsFor(row.cells, columns, row.expandable, row.expanded).map((item, i) => {
      const resolved = renderers[i];
      if (resolved === undefined) return item;
      const content = callRenderer(
        'cell',
        resolved,
        {
          ...(entry !== undefined ? { entry } : {}),
          row,
          value: item.text,
        },
        raiseError,
      );
      return content === undefined ? item : { ...item, content };
    });
  }

  function syncCellsForEachRow(rows: readonly FrameRow[], columns: readonly FrameColumn[]): void {
    // #175: which renderer paints a cell depends on the column alone, never on the row. Resolving
    // inside the per-cell map asked the same question once per painted cell, and each answer is a
    // fresh object holding a fresh closure (`view/gantt-shell.ts`'s `resolveCellRenderer`). Frames
    // fire on scroll, so that was two allocations per cell per scrolled frame. `plans/01` §8: the
    // hot path allocates nothing. One resolve per column per frame answers every row.
    const renderers = columns.map((column) => resolveCellRenderer(column.field));
    rows.forEach((row) => {
      const rowNode = rowLayer.node(row.id);
      if (!rowNode) return;
      rowCellLayers.layerFor(row.id).sync(rowNode, cellItemsForRow(row, columns, renderers), cellSpec);
    });

    rowCellLayers.prune(new Set(rows.map((row) => row.id)));
  }

  function syncGridHeader(columns: readonly FrameColumn[]): void {
    if (!gridHeaderLayer) return;
    const items: CellItem[] = columns.map((column, i) => {
      const item: CellItem = {
        key: String(column.field),
        text: column.header,
        first: i === 0,
        columnIndex: i + 1,
        align: column.align,
        expandable: false,
        expanded: false,
      };
      if (column.width !== undefined) item.width = column.width;
      if (column.flex !== undefined) item.flex = column.flex;
      if (column.resizable !== undefined) item.resizable = column.resizable;
      if (column.movable !== undefined) item.movable = column.movable;
      const resolved = resolveHeaderRenderer(column.field);
      if (resolved !== undefined) {
        const content = callRenderer('header', resolved, undefined, raiseError);
        if (content !== undefined) item.content = content;
      }
      return item;
    });
    headerCellLayer.sync(gridHeaderLayer, items, headerCellSpec);
    // S5.7, D-S5-18: `applyState`'s drop-indicator paint needs "the last column" for the `null`
    // ("at the end") case — the only place that order is known outside `syncGridHeader` itself.
    lastHeaderColumnKeys = items.map((item) => item.key);
  }

  /** Files one bar under every Segment that paints it (#212, #230). The frame states which Segments
   *  a bar stands for, so this paint side reads `bar.segmentIds` and never asks an Entry of its own.
   *  `segmentIdByItemId` records the other, narrower fact — the one Segment this bar drew — which
   *  the resize-handle pair reads. */
  function indexBarBySegment(bar: FrameBar): void {
    if (bar.segmentId !== undefined) segmentIdByItemId.set(bar.id, bar.segmentId);
    for (const segmentId of bar.segmentIds) {
      const mounted = itemIdsBySegmentId.get(segmentId);
      if (mounted === undefined) itemIdsBySegmentId.set(segmentId, [bar.id]);
      else mounted.push(bar.id);
    }
  }

  function syncBars(bars: readonly FrameBar[]): void {
    if (!barLayer) return;
    // One read per frame answers every bar (the same "resolve once per frame" posture `syncRowCells`
    // keeps for its column renderers) — the setting cannot change part-way through one sync.
    const barLabels = readBarLabels();
    barGeomByItemId.clear();
    itemIdsByEntryId.clear();
    itemIdsBySegmentId.clear();
    segmentIdByItemId.clear();
    for (const bar of bars) {
      barGeomByItemId.set(bar.id, { x: bar.x, y: bar.y, width: bar.width, height: bar.height });
      // #185: the frame states which Entry drew this bar, so the paint side never parses an id.
      const mounted = itemIdsByEntryId.get(bar.entryId);
      if (mounted === undefined) itemIdsByEntryId.set(bar.entryId, [bar.id]);
      else mounted.push(bar.id);
      indexBarBySegment(bar);
    }
    // #212: which bars the Selection paints, read off the index this sync just built. `create` below
    // asks it rather than restating the "own Segment, else any Segment of the Entry" rule a second
    // time. One statement of that rule, and the index is where it already lives.
    const selectedBars = paintedBarsOf(paintedSelectedSegmentIds);
    barLayerCache.sync(barLayer, bars, {
      key: (bar) => bar.id,
      create: (bar) => {
        const node = document.createElement('div');
        node.className = BAR_CLASS;
        node.dataset[ITEM_ID_KEY] = bar.id;
        node.dataset[TESTID_KEY] = BAR_TESTID;
        node.setAttribute('role', 'img');
        // #185: virtualization can create this node well after the selection that ought to paint
        // it — a bar scrolled back into view must not wait for the next selection change to catch
        // up. `syncRows` has had this line since the last bug hunt; bars never did, so a remounted
        // bar came back unpainted. `paintedSelected` gains it too, or the next `applyState` call
        // would see a spurious diff and repaint a node that is already correct.
        if (selectedBars.has(bar.id)) {
          node.dataset['state'] = 'selected';
          paintedSelected = new Set(paintedSelected).add(bar.id);
        }
        return node;
      },
      toGeom: (bar) => {
        // J1: the library measures and places every bar's label first, before any renderer runs, so
        // a `barRenderer` can paint the label the library already decided on. One text ruler, in one
        // place — a renderer never needs one of its own to know inside from outside.
        const textWidth = barLabels === 'none' ? undefined : textRuler?.widthOf(bar.label);
        const resolvedPlacement = resolveBarLabelPlacement(
          barLabels,
          textWidth,
          bar.x,
          bar.width,
          barLabelGapPx,
          contentWidthPx,
        );
        // The row, never `bar.variant`: which paint this bar wears is the rule that claimed this
        // row, and two rules may share one name (`F3`).
        const entry = entryById(bar.entryId);
        const resolved = entry === undefined ? undefined : resolveBarRenderer(entry);
        let content: ElementDescription | undefined;
        if (resolved !== undefined && entry !== undefined) {
          const context: BarRendererContext = { entry, item: bar };
          if (resolvedPlacement !== undefined) {
            context.label = { text: bar.label, placement: resolvedPlacement };
          }
          content = callRenderer('bar', resolved, context, raiseError);
        }
        // A `barRenderer` result owns this bar's content, so the library injects no label child and
        // stamps no `data-label` for it — the S5.4 seam (D-S5-11). The renderer's own label rides in
        // its markup instead, which is also why the mid-drag restamp below skips such a bar: its
        // label placement is a frame fact for it, not a hot-path one.
        const ownsContent = content !== undefined && paintsItsOwnContent(content);
        const paintedPlacement = ownsContent ? undefined : resolvedPlacement;
        labelWidthByItemId.set(bar.id, ownsContent ? undefined : textWidth);
        labelPlacementByItemId.set(bar.id, paintedPlacement);
        return {
          variant: bar.variant,
          label: bar.label,
          x: bar.x,
          y: bar.y,
          width: bar.width,
          height: bar.height,
          flags: bar.flags,
          a11yLabel: bar.a11yLabel,
          span: bar.span,
          // #212: the geom carries the Segment, so `shallowEqual` sees a Segment change and patches.
          // The key stays present and may hold `undefined`, which keeps the key count stable.
          segmentId: bar.segmentId,
          labelPlacement: paintedPlacement,
          ...(content !== undefined ? { content } : {}),
        };
      },
      patch: (node, geom) => {
        node.dataset['variant'] = geom.variant;
        // #212: which Segment a bar draws is a frame fact, not a birth fact, so `patch` writes it.
        // A bar node's key is `${entryId}:${segmentIndex}`, and an index renumbers when a Segment
        // goes. The node survives and draws its neighbour, so a stamp written once at creation lies.
        if (geom.segmentId === undefined) delete node.dataset[SEGMENT_ID_KEY];
        else node.dataset[SEGMENT_ID_KEY] = geom.segmentId;
        // States a fact about the paint, not a judgement on the variant (plans/01 §2.5) — every bar
        // `barSpan` floors or fixes carries it the same way. Pair with `data-variant` to tell which
        // variant was floored or holds a fixed box.
        if (geom.span === 'exact') delete node.dataset['span'];
        else node.dataset['span'] = geom.span;
        node.dataset['flag'] = flagTokens(geom.flags);
        // J1: `undefined` covers both `barLabels: 'none'` and a `barRenderer` result — neither gets a
        // `data-label` stamp, so `.fg-bar-label`'s placement rules never fire for either case.
        if (geom.labelPlacement === undefined) delete node.dataset['label'];
        else node.dataset['label'] = geom.labelPlacement;
        node.setAttribute('aria-label', geom.a11yLabel);
        node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
        node.style.width = `${geom.width}px`;
        node.style.height = `${geom.height}px`;
        // `content === undefined && labelPlacement === undefined` only happens for `barLabels: 'none'`
        // (a barRenderer result took the `geom.content` branch instead) — no label child at all, not
        // an unplaced one, because 'none' means the bar paints no label.
        const defaultContent: ElementDescription =
          geom.labelPlacement === undefined
            ? { text: '' }
            : { children: [{ key: 'label', class: { 'fg-bar-label': true }, text: geom.label }] };
        applyElementDescription(node, barContent(geom.content, defaultContent));
      },
    });
  }

  /** One band per windowed row, keyed by row id exactly like the grid pane's own row layer. Every
   *  row gets a node — an even row paints `--fg-row-even-bg` (transparent by default), so the two
   *  panes keep one rule set instead of one pane skipping nodes the other paints. */
  function syncRowBands(rows: readonly FrameRow[], contentWidth: number, paneWidth: number): void {
    if (!rowBandLayer) return;
    // A band is as wide as the scrollable content, not as the pane: `width: 100%` alone would stop
    // the zebra at the pane's right edge and leave bare background once the pane scrolls right.
    rowBandLayer.style.width = `${Math.max(contentWidth, paneWidth)}px`;
    rowBandLayerCache.sync(rowBandLayer, rows, {
      key: (row) => row.id,
      create: (_row, key) => {
        const node = document.createElement('div');
        node.className = 'fg-row-band';
        node.setAttribute('aria-hidden', 'true');
        // The row this band paints — the same `data-row-id` the grid pane's own `.fg-row` carries,
        // so a viewer (or a test) can line the two panes up row by row.
        node.dataset[ROW_ID_KEY] = key;
        // Same restamp-on-remount rule `syncRows` and `syncBars` already follow: virtualization can
        // build this band long after the selection or hover that ought to paint it, and a band
        // scrolled back into view must not wait for the next state change to catch up.
        const tokens: string[] = [];
        if (paintedHoveredRow === key) tokens.push('hovered');
        if (paintedSelectedRows.has(key)) tokens.push('selected');
        node.dataset['state'] = tokens.join(' ');
        return node;
      },
      toGeom: (row) => ({ top: row.top, height: row.height, parity: rowParity(row.index) }),
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.dataset['parity'] = geom.parity;
      },
    });
  }

  return {
    mount(surfaces: RenderSurfaces<HTMLElement>) {
      gridLayer = surfaces.grid;
      gridLayer.replaceChildren();
      gridHeaderLayer = surfaces.gridHeader;
      gridHeaderLayer?.replaceChildren();
      timelineHost = surfaces.timeline;
      timelineHost.replaceChildren();

      headerLayer = document.createElement('div');
      headerLayer.className = 'fg-header';
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      // J1: one ruler per mount, off the bar layer's own computed font — the font a label actually
      // paints in, whatever the consumer's stylesheet cascades onto `.fg-bars`.
      textRuler = createTextRuler(barLayer);
      barLabelGapPx = readPixelProperty(barLayer, '--fg-bar-label-gap', {
        fallback: DEFAULT_BAR_LABEL_GAP_PX,
        accepts: 'zeroOrMore',
      });
      // Below the decoration layers `attachDecorations` mounts (it inserts them around `barLayer`),
      // so a plugin's own rowStripe still paints on top of the pane's zebra.
      rowBandLayer = document.createElement('div');
      rowBandLayer.className = 'fg-row-bands';
      // Owns the native scrollable extent (S1.5 README D-S1.5-9): rows/bars are positioned absolutely,
      // so nothing else in this DOM makes `timelineHost` actually overflow — without this, ScrollModel's
      // `panTo` has nowhere real to write. Zero visual footprint; `sync()` moves it to the frame's
      // bottom-right corner every render.
      contentSizer = document.createElement('div');
      contentSizer.setAttribute('aria-hidden', 'true');
      contentSizer.className = 'fg-content-sizer';
      startHandle = document.createElement('div');
      startHandle.className = BAR_HANDLE_CLASS;
      startHandle.dataset['edge'] = 'start';
      startHandle.hidden = true;
      endHandle = document.createElement('div');
      endHandle.className = BAR_HANDLE_CLASS;
      endHandle.dataset['edge'] = 'end';
      endHandle.hidden = true;
      // The handle pair's `transform` (paintResizeHandles) uses the same geometry as a bar's own
      // `transform` (syncBars) — both must share one coordinate origin. That origin is `.fg-bars`
      // (barLayer), which sits below `.fg-header` in normal flow; a handle appended to `timelineHost`
      // instead would position absolute against the pane itself and land one header-height too high.
      // `syncKeyed` (sync-keyed.ts) only reorders the bar nodes it tracks and never touches a foreign
      // child, so appending the handles here once leaves them undisturbed at the end of barLayer's
      // children on every later sync — still painted above every bar (D-S3-8).
      barLayer.append(startHandle, endHandle);
      cursorLine = document.createElement('div');
      cursorLine.className = 'fg-cursor-line';
      cursorLine.setAttribute('aria-hidden', 'true');
      cursorLine.hidden = true;
      cursorLineLabel = document.createElement('div');
      cursorLineLabel.className = 'fg-cursor-line-label';
      cursorLineLabel.setAttribute('aria-hidden', 'true');
      cursorLineLabel.hidden = true;
      timelineHost.append(headerLayer, rowBandLayer, barLayer, contentSizer);
      // S5.6, D-S5-15: mounted before Date lines, so a registered decoration paints below the
      // today wrapper and any authored Date line — those stay the topmost stroke either way.
      decorations = attachDecorations(timelineHost, barLayer);
      // Inserted between the decorations and the bars, so the lines paint over the zebra, the
      // selected-row band, and weekend shading, and under every bar — the design's own paint
      // order (`bands` -> `shades` -> `gridLines` -> bars, #<J2 fix>).
      tickLines = attachTickLines(timelineHost, barLayer);
      dateLines = attachDateLines(timelineHost, headerLayer);
      timelineHost.append(cursorLine);
      headerLayer.append(cursorLineLabel);
    },
    sync(frame: GeometryFrame) {
      if (headerLayer) {
        // A boundary tick's cell is one full calendar unit wide and can overshoot `contentWidth` on a
        // coarse preset over a short dataset. `.fg-header` clips (`overflow: hidden`) at its own box
        // edge, so the box must be exactly `contentWidth` wide — or the clip lands at the pane's width
        // instead and either hides in-range ticks or lets an oversized tick inflate native scrollWidth.
        headerLayer.style.width = `${frame.contentWidth}px`;
      }
      syncHeader(frame.header.bands);
      syncGridHeader(frame.columns);
      syncRows(frame.rows, frame.rowCount, frame.tree, frame.columns);
      syncRowBands(frame.rows, frame.contentWidth, frame.visible.width);
      // J1: banked for `applyBarPreview`'s mid-drag flip check, which never receives a `frame` of its
      // own — the "outside" fit test runs against the frame actually on screen, not a stale one.
      contentWidthPx = frame.contentWidth;
      syncBars(frame.bars);
      // A resize commit repaints the resized bar with new geometry through this same `sync()`, but
      // `applyState`'s handle repaint is gated on `resizableEntryId` actually changing — it stays the
      // same Entry across a commit whenever the bar is still hovered or is the sole selection, so
      // that gate alone left the handle pair glued to its pre-commit position. The handle pair's
      // geometry has to track `syncBars` every frame, the same way a bar's own transform does, not
      // just on identity change.
      if (paintedResizable !== undefined) {
        paintResizeHandles(resizeHandleBarsOfEntry(paintedResizable), paintedResizableEdges);
      }
      tickLines?.sync(frame.tickLines, frame.contentHeight, frame.visible.height);
      dateLines?.sync(frame.decorations, frame.contentHeight, frame.visible.height);
      decorations?.sync(
        frame.underBars,
        frame.overBars,
        frame.rows,
        frame.contentHeight,
        frame.visible.height,
      );
      cursorLineHeight = Math.max(frame.contentHeight, frame.visible.height);
      if (cursorLine && !cursorLine.hidden) cursorLine.style.height = `${cursorLineHeight}px`;
      if (gridLayer) {
        // The grid pane has no scrollbar of its own; its row layer follows the timeline pane's
        // native scroll by one transform per frame instead of a second real scroller (D-S1.8-1).
        // Both panes read `top` from the same `frame.rows` array, so pixel-identity (I9) is
        // structural rather than a property this line has to maintain by hand.
        gridLayer.style.transform = `translateY(${-frame.visible.y}px)`;
      }
      if (contentSizer) {
        // The sizer itself is 1x1px, so its far edge — not its origin — must land at the content
        // extent, or the browser's native scrollable range ends up 1px past what ScrollModel computed.
        // No gutter to add: the timeline pane's content is `contentWidth` wide, full stop (D-S1.8-1).
        const x = Math.max(0, frame.contentWidth - 1);
        const y = Math.max(0, frame.contentHeight - 1);
        contentSizer.style.transform = `translate(${x}px, ${y}px)`;
      }
    },
    applyState(state: InteractionState) {
      // D-S3-6/D-S3-7: diff against what was last painted, touch only the bars whose token set
      // changed. No frame recompute, no node creation — `barLayerCache` already holds every mounted
      // bar's node from the last sync().
      const nextSelectedSegmentIds = new Set(state.selectedSegmentIds ?? []);
      const nextSelected = paintedBarsOf(nextSelectedSegmentIds);
      const nextHovered = state.hoveredItemId;
      const nextPending = new Set(state.pendingItemIds ?? []);
      const changed = new Set<ItemId>();
      // #212: the selection diff runs over Segments, then touches that Segment's bars. It is
      // O(Segments whose selection flipped), never a scan of every mounted bar (I5).
      paintedSelectedSegmentIds.forEach((id) => {
        if (!nextSelectedSegmentIds.has(id)) addBarsOfSegment(changed, id);
      });
      nextSelectedSegmentIds.forEach((id) => {
        if (!paintedSelectedSegmentIds.has(id)) addBarsOfSegment(changed, id);
      });
      paintedPending.forEach((id) => {
        if (!nextPending.has(id)) changed.add(id);
      });
      nextPending.forEach((id) => {
        if (!paintedPending.has(id)) changed.add(id);
      });
      if (paintedHovered !== nextHovered) {
        if (paintedHovered !== undefined) changed.add(paintedHovered);
        if (nextHovered !== undefined) changed.add(nextHovered);
      }
      changed.forEach((id) =>
        paintDataState(id, nextHovered, nextSelected, nextPending, paintedDragging, paintedGhost),
      );
      paintedSelected = nextSelected;
      paintedHovered = nextHovered;
      paintedPending = nextPending;

      // Bug hunt (S5 fixes): `.fg-row`'s own selection paint, off the same Selection the bars paint
      // from. A row paints selected when the Selection holds any Segment it owns (#212, #230 R5).
      // Still diff-and-touch-only (I5): only rows whose token actually flips get written, exactly
      // like the bar loop above.
      const nextSelectedRows = new Set<RowId>();
      rowSegmentIds.forEach((segmentIds, rowId) => {
        if (segmentIds.some((id) => nextSelectedSegmentIds.has(id))) {
          nextSelectedRows.add(rowId);
        }
      });
      const changedRows = new Set<RowId>();
      paintedSelectedRows.forEach((rowId) => {
        if (!nextSelectedRows.has(rowId)) changedRows.add(rowId);
      });
      nextSelectedRows.forEach((rowId) => {
        if (!paintedSelectedRows.has(rowId)) changedRows.add(rowId);
      });
      // The hovered row joins the same diff — two rows at most flip per pointer move, and the
      // repaint stays the write of one attribute on each (I5).
      const nextHoveredRow = state.hoveredRowId;
      if (paintedHoveredRow !== nextHoveredRow) {
        if (paintedHoveredRow !== undefined) changedRows.add(paintedHoveredRow);
        if (nextHoveredRow !== undefined) changedRows.add(nextHoveredRow);
      }
      changedRows.forEach((rowId) =>
        paintRowState(rowId, nextSelectedRows.has(rowId), nextHoveredRow === rowId),
      );
      paintedSelectedSegmentIds = nextSelectedSegmentIds;
      paintedSelectedRows = nextSelectedRows;
      paintedHoveredRow = nextHoveredRow;

      // D-S3-8: the shared handle pair follows `resizableEntryId`, positioned off the committed
      // geometry `syncBars` already recorded — never a per-item computation of its own. #211: the
      // Selection can narrow with `resizableEntryId` unchanged (a click on the already-hovered bar),
      // so the repaint gate also has to catch a pair whose own bars moved, not only a changed Entry.
      // #142: it also has to catch `resizableEdges` flipping with the Entry unchanged — a live
      // `dataset.fields` reconfiguration can open or close an edge without touching the Selection.
      const nextResizable = state.resizableEntryId;
      const nextEdges = state.resizableEdges;
      const nextHandleBars = resizeHandleBarsOfEntry(nextResizable);
      if (
        nextResizable !== paintedResizable ||
        !sameBars(nextHandleBars, paintedHandleBars) ||
        !sameEdges(nextEdges, paintedResizableEdges)
      ) {
        paintResizeHandles(nextHandleBars, nextEdges);
        paintedResizable = nextResizable;
        paintedResizableEdges = nextEdges;
      }

      // D-S3-6: `cursor: grab` follows `movableItemId` via a boolean attribute, not an inline style
      // (`no-inline-style-outside-geometry`) — the base stylesheet owns the actual `cursor` rule.
      const nextMovable = state.movableItemId;
      if (nextMovable !== paintedMovable) {
        if (paintedMovable !== undefined) barLayerCache.node(paintedMovable)?.removeAttribute('data-movable');
        if (nextMovable !== undefined) barLayerCache.node(nextMovable)?.setAttribute('data-movable', '');
        paintedMovable = nextMovable;
      }

      paintPreview(state.preview);
      paintCursorLine(state.cursorX, state.cursorLabel);
      paintColumnResizePreview(state.columnResizePreview);
      paintColumnReorderPreview(state.columnReorderPreview);
    },
    hitTest(at: ClientPoint): HitResult | null {
      // "The bars array is the hit index; DOM backends get hit-testing from event delegation"
      // (plans/01 §4) — no materialized hit-region array (#31).
      if (!barLayer) return null;
      const el = document.elementFromPoint(at.x, at.y);
      // S3.4, D-S3-4: the shared handle pair sits above the bar layer in paint order, so a hit on a
      // handle is checked first — `paintedHandleBars` names the bar each handle sits on (D-S3-8,
      // #200), a parked (hidden) handle is never returned by elementFromPoint.
      const handle = el instanceof Element ? el.closest<HTMLElement>(`.${BAR_HANDLE_CLASS}`) : null;
      if (handle && paintedHandleBars !== undefined) {
        const edge = handle.dataset['edge'];
        if (edge === 'start' || edge === 'end') {
          return { kind: 'bar', itemId: paintedHandleBars[edge], edge };
        }
      }
      const bar = el instanceof Element ? el.closest<HTMLElement>(`.${BAR_CLASS}`) : null;
      if (bar && barLayer.contains(bar)) {
        const id = itemIdFromDataset(bar.dataset[ITEM_ID_KEY]);
        return id ? { kind: 'bar', itemId: id } : null;
      }
      // Bug hunt (S5 fixes, "grid row highlight and row click"): a miss on the bar layer falls
      // through to the grid pane — a row click selects the same way a bar click does. The hit names
      // the row itself (#185): which Entries that row owns is the caller's question, and a row that
      // owns several used to lose all but the first to a made-up Item id. A twisty click is not a
      // row hit at all: collapse stays on the twisty, never selection, and a miss there still counts
      // as a genuine grid miss (no clear).
      if (el instanceof Element && el.closest(`.${ROW_TWISTY_CLASS}`)) return null;
      const row = el instanceof Element ? el.closest<HTMLElement>(`.${ROW_CLASS}`) : null;
      if (row && gridLayer?.contains(row)) {
        const id = rowIdFromDataset(row.dataset[ROW_ID_KEY]);
        // A header row carries no Entry, so it is never selectable — `entriesForRow` answers none.
        if (id !== undefined) return { kind: 'row', rowId: id };
      }
      return null;
    },
    destroy() {
      dateLines?.destroy();
      dateLines = undefined;
      tickLines?.destroy();
      tickLines = undefined;
      decorations?.destroy();
      decorations = undefined;
      gridLayer?.replaceChildren();
      timelineHost?.replaceChildren();
      bandLayer.clear();
      bandTickLayers.clear();
      rowLayer.clear();
      rowBandLayerCache.clear();
      rowCellLayers.clear();
      headerCellLayer.clear();
      barLayerCache.clear();
      barGeomByItemId.clear();
      itemIdsByEntryId.clear();
      itemIdsBySegmentId.clear();
      segmentIdByItemId.clear();
      paintedHovered = undefined;
      paintedSelected = new Set();
      paintedPending = new Set();
      paintedResizable = undefined;
      paintedHandleBars = undefined;
      paintedMovable = undefined;
      paintedPreview = new Set();
      paintedDragging = new Set();
      paintedGhost = new Set();
      paintedSelectedSegmentIds = new Set();
      paintedSelectedRows = new Set();
      rowSegmentIds.clear();
      lastHeaderColumnKeys = [];
      paintedColumnResize = undefined;
      paintedColumnDropKey = undefined;
      paintedColumnDragKey = undefined;
      gridLayer = undefined;
      gridHeaderLayer = undefined;
      timelineHost = undefined;
      headerLayer = undefined;
      barLayer = undefined;
      rowBandLayer = undefined;
      contentSizer = undefined;
      startHandle = undefined;
      endHandle = undefined;
      cursorLine = undefined;
      cursorLineLabel = undefined;
      cursorLineHeight = 0;
    },
  };
}
