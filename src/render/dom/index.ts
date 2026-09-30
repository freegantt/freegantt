// render/dom — default backend: absolutely-positioned rows/bars/header ticks, keyed reconciler
// (plans/01 §8.1). Scope is hard-bounded: attr/class/style/text + keyed child recycling only.

import type {
  BarFlags,
  BarLabelPlacement,
  BarLabelPolicy,
  BarRenderer,
  BarRendererContext,
  DateLineLabelPlacement,
  ElementDescription,
  Entry,
  EntryId,
  FrameBar,
  FrameHeaderBand,
  FrameHeaderTick,
  FrameRow,
  GeometryFrame,
  BarId,
  BarPreview,
  RaiseError,
  ResolvedRenderer,
  RowId,
  ClientPoint,
} from '../../layout/index.js';
import type { ColumnAlign, FrameColumn } from '../../layout/index.js';
import type { RenderBackend, RenderSurfaces, InteractionState, HitResult } from '../backend.js';
import {
  DEFAULT_DATE_LINE_LABEL_PLACEMENT,
  entryIdOfBar,
  barIdFromDataset,
  rowIdFromDataset,
  BAR_FLAG_KEYS,
} from '../../layout/index.js';
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
  VISUALLY_HIDDEN_CLASS,
  DEFAULT_BAR_LABEL_GAP_PX,
  ENTRY_ID_KEY,
  FIELD_KEY,
  BAR_ID_KEY,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_ID_KEY,
  ROW_LABEL_CLASS,
  ROW_LABEL_TEXT_CLASS,
  ROW_TESTID,
  ROW_TWISTY_CLASS,
  TESTID_KEY,
} from './dom-contract.js';

/** A cell's renderer, already bound to its `ResolvedColumn` (render/dom never receives that type —
 *  `column.format` "stays on `ResolvedColumn` and never reaches a backend", `layout/column.ts`) and
 *  keyed by `GanttShell` per `FrameColumn.field` (S5.4). */
type BoundGridCellRenderer = (ctx: {
  entry?: Entry | undefined;
  row: FrameRow;
  value: string;
}) => ElementDescription | undefined;

/** A header renderer, already bound to its `ResolvedColumn` the same way `BoundGridCellRenderer` above
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
  /** S5.12: where a renderer that threw is reported. `GanttShell` passes the raiser bound to
   *  its own `error` bus. Omitted — a test backend built with no options — the console fallback runs
   *  every time, which is the honest answer when there is no bus for anyone to subscribe to. */
  raiseError?: RaiseError;
  /** #421 C5. Per entry, not per frame: `EntryVariant.barLabels` merges key by key over the
   *  Gantt's own `barLabels`, and a merge needs the row's own variant. Read fresh every `syncBars`
   *  call, same live-reconfiguration posture `resolveBarRenderer` below already takes. Omitted — a
   *  test backend built with no options — falls back to `'fitBar'` for every entry. */
  resolveBarLabelPolicy?: (entry: Entry) => BarLabelPolicy;
  /** #318 follow-up. Read fresh every `sync` call, same posture as `resolveBarLabelPolicy` above. Omitted —
   *  a test backend built with no options — falls back to `DEFAULT_DATE_LINE_LABEL_PLACEMENT`. */
  readDateLineLabelPlacement?: () => DateLineLabelPlacement;
  resolveBarRenderer: (entry: Entry) => ResolvedRenderer<BarRenderer> | undefined;
  resolveGridCellRenderer: (columnKey: string) => ResolvedRenderer<BoundGridCellRenderer> | undefined;
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
    // Issue #137: one bad renderer degrades one bar or cell, never the paint pass.
    // S5.12: the report always goes out; the `console.error` behind it is a fallback that
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
  /** 1-based position among the configured Grid columns — `aria-colindex` (S5.11). 1-based
   *  because that is what the attribute counts in; a reorder moves it, which is the point. */
  columnIndex: number;
  align: ColumnAlign;
  width?: number;
  flex?: number;
  expandable: boolean;
  expanded: boolean;
  /** S5.4: a resolved `columnRenderer`'s output for this one cell — undefined keeps `text`. */
  content?: ElementDescription;
  /** S5.7: header cells only — `cellItemsForRow`'s row cells never set these. */
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
  /** S5.7: default `true` when absent — painted as an attribute so the base stylesheet can
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
  gridCells: readonly string[];
  index: number;
  rowCount: number;
  /** S5.11: `aria-level`, `aria-expanded`, `aria-posinset` and `aria-setsize` belong to a
   *  `treegrid` row. A flat `grid` row takes `aria-rowindex` alone. */
  tree: boolean;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  matched?: boolean;
  locked?: boolean;
};
/** The timeline pane's own zebra band for one row — the same paint `.fg-row` carries in the grid
 *  pane, from the same `FrameRow`, so both panes stripe the same rows (I9's pixel identity applies
 *  to the row's background too, not just its top/height). */
type RowBandGeom = {
  top: number;
  height: number;
  parity: RowParity;
};
/** The `data-label` token `patch` paints, and whether a `.fg-bar-label` child exists at all (#435
 *  follow-up). `BarLabelPlacement`'s two values still mean "paints, on this side." `'hidden'`
 *  adds a third: the child exists, measured, but must not paint — `'insideOrNone'` on a bar too
 *  narrow reaches this, not the plain "no child at all" case `undefined` keeps. Named for the DOM
 *  state it describes, not for the `BarLabelPolicy` value that produces it (`'none'`) — a consumer
 *  reading `[data-label='hidden']` in a stylesheet sees a present-but-unpainted child, where `'none'`
 *  would have read as "no label," the opposite of the truth (pass-2 branch review, #435).
 *  The split matters on the resize hot path (`applyBarPreview`): that path only flips `data-label`,
 *  never adds or removes the child, so a mode that can flip mid-drag needs a child to already exist,
 *  hidden, at the far end of the flip — `undefined` cannot express "hidden but present," and deleting
 *  the attribute of a bar that owns no child mid-drag would leave nothing to reveal on the way back.
 *
 *  Cost of always mounting that child for a too-narrow `insideOrNone` bar: one hidden
 *  `.fg-bar-label` span, mounted cold by `patch` during `syncBars` — never on the hot path, which
 *  only ever flips the attribute — and bounded to the visible slice by the horizontal cull
 *  (`layout/frame.ts`'s `intersectsHorizontally`) and the row window, not to the dataset. `display:
 *  none` drops it from layout and paint, so the bound is node memory, not frame time (pass-2
 *  branch review). A bar with `capabilities.resize: false` still gets the hidden child even though
 *  it can never enter the mid-drag flip this exists for — the renderer has no capability resolution
 *  at `sync` to gate on, and no consumer has asked for that narrowing yet. */
type BarLabelToken = BarLabelPlacement | 'hidden';
type BarGeom = Pick<
  FrameBar,
  'variant' | 'label' | 'x' | 'y' | 'width' | 'height' | 'flags' | 'a11yLabel' | 'span'
> & {
  /** `true` for a locked Entry's bar. */
  locked: boolean;
  /** S5.4: a resolved `barRenderer`'s output for this one bar — undefined keeps `label`. */
  content?: ElementDescription;
  /** This frame's label token — see `BarLabelToken` for what each value means and costs.
   *  `undefined` means no label child at all. */
  labelPlacement: BarLabelToken | undefined;
};
/** 1-based, so the first row reads 'odd' — the same counting `--fg-row-odd-bg` is named for. The
 *  absolute frame row index drives it, never DOM child position: the row layer only holds the
 *  windowed rows, so `:nth-child` flips the whole zebra one row out of phase as soon as the pane
 *  scrolls. */
type RowParity = 'odd' | 'even';

function rowParity(index: number): RowParity {
  return index % 2 === 0 ? 'odd' : 'even';
}

/** `BarLabelPolicy`'s rule (`layout/renderer.ts`), as pure arithmetic — no DOM read. Two notes the
 *  policy doc does not need: an `'outside'` placement past `contentWidth` would inflate the pane's
 *  own scrollable extent (`e2e/timeline-content-width.spec.ts`), which no forced mode is worth
 *  breaking for, so a forced side with no room still falls back to inside; and `undefined` textWidth
 *  (no 2d context to measure with) always reads `'inside'` — today's exact behaviour, so a stub DOM
 *  never invents pixels it cannot measure. Returns `undefined` only for `'none'` or for
 *  `'insideOrNone'` on a bar too narrow — callers map that second case to the `'hidden'` token
 *  (`BarLabelToken`), not to "no child," on any bar this function can be asked about twice. */
function resolveBarLabelPlacement(
  mode: BarLabelPolicy,
  textWidth: number | undefined,
  barX: number,
  barWidth: number,
  gapPx: number,
  contentWidth: number,
): BarLabelPlacement | undefined {
  if (mode === 'none') return undefined;
  if (textWidth === undefined || mode === 'inside') return 'inside';
  const fitsInside = textWidth + 2 * gapPx <= barWidth;
  if (mode === 'insideOrNone') return fitsInside ? 'inside' : undefined;
  if (mode === 'fitBar' && fitsInside) return 'inside';
  const fitsOutside = barX + barWidth + gapPx + textWidth <= contentWidth;
  if (mode === 'outside') return fitsOutside ? 'outside' : 'inside';
  // 'fitBar' remaining: outside when it fits there, inside (ellipsised) as the last resort.
  return fitsOutside ? 'outside' : 'inside';
}

/** Does this paint own the bar's content, or only decorate it (ADR 0018)? A description that
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
/** What the shared handle pair needs to place itself over a committed bar — a narrower slice
 *  than `BarGeom`, which also carries paint fields the handles don't read. */
type HandleGeom = Pick<FrameBar, 'x' | 'y' | 'width' | 'height'>;
/** Bands carry no per-frame geometry of their own yet (height/stacking is S1.9/S1.10) — an always-
 * equal geom means `syncKeyed` patches a band node once, at creation, and never again. */
type BandGeom = Record<string, never>;
const EMPTY_BAND_GEOM: BandGeom = Object.freeze({});

/** `data-flag` is generated from `BAR_FLAG_KEYS` (S1.10) — adding a new key to that list
 * needs no edit here (U7). Iterating the list, not `Object.keys(flags)`, also fixes the token
 * order and drops a stray key the type does not carry. */
function flagTokens(flags: BarFlags): string {
  return BAR_FLAG_KEYS.filter((k) => flags[k]).join(' ');
}

function cellItemsFor(
  gridCells: readonly string[],
  columns: readonly FrameColumn[],
  expandable: boolean,
  expanded: boolean,
): readonly CellItem[] {
  return gridCells.map((text, i) => {
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
  const { entryById, resolveBarRenderer, resolveGridCellRenderer, resolveHeaderRenderer } = options;
  const resolveBarLabelPolicy = options.resolveBarLabelPolicy ?? ((): BarLabelPolicy => 'fitBar');
  const readDateLineLabelPlacement =
    options.readDateLineLabelPlacement ?? ((): DateLineLabelPlacement => DEFAULT_DATE_LINE_LABEL_PLACEMENT);
  // No injected raiser means no bus, so nothing can be subscribed and the fallback always runs.
  const raiseError: RaiseError = options.raiseError ?? ((_report, fallback) => fallback?.());
  // The grid pane's row layer (RenderSurfaces.grid) — created by `view/pane-layout.ts`, not this
  // backend (S1.8). No scrollbar of its own: it follows the timeline pane's scroll
  // position by one `translateY(-visible.y)` per frame, written in `sync()` below.
  let gridLayer: HTMLElement | undefined;
  let gridHeaderLayer: HTMLElement | undefined;
  /** S5.7: written by `syncGridHeader`, read by `applyState`'s drop-indicator paint for the
   *  `beforeColumnKey: null` ("at the end") case. */
  let lastHeaderColumnKeys: readonly string[] = [];
  /** What `applyState`'s resize-preview paint last touched (S5.7) — diff-and-touch-only,
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
  // #225: `.fg-header` itself stays `overflow: visible` so the Date line label (an
  // absolutely-positioned child of `.fg-header` itself) can sit at `top: 100%` of `.fg-header`'s own
  // height, right below the bands, with no clip cutting it off. `headerBandsHost` is the exact-band-
  // height box that carries the width-to-contentWidth clip `.fg-header` used to carry itself
  // (S1.12, `e2e/timeline-content-width.spec.ts`).
  let headerBandsHost: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;
  let rowBandLayer: HTMLElement | undefined;
  let contentSizer: HTMLElement | undefined;
  let dateLines: DateLineAttachment | undefined;
  let tickLines: TickLineAttachment | undefined;
  let decorations: DecorationsAttachment | undefined;
  // One shared handle pair, created once at mount() and moved/parked by applyState — never
  // one pair per bar.
  let startHandle: HTMLElement | undefined;
  let endHandle: HTMLElement | undefined;
  // S3.8: Cursor line singletons, created once at mount() and moved/parked by applyState.
  let cursorLine: HTMLElement | undefined;
  let cursorLineLabel: HTMLElement | undefined;
  let cursorLineHeight = 0;
  // One ruler per backend instance (I2 — never module-level). Built in mount(), off the bar
  // layer's own computed font, and never rebuilt after — a label's font does not change mid-life.
  let textRuler: TextRuler | undefined;
  // --fg-bar-label-gap (px), read once at mount (pixel-property.ts's own re-read cadence rule: a
  // caller states its cadence, and a label's gap does not change with the pane's size).
  let barLabelGapPx = DEFAULT_BAR_LABEL_GAP_PX;
  // The last frame's contentWidth (the "outside" clause needs it, and it arrives with `sync`, not
  // with each bar) — read by `toGeom` below, so the fit test always runs against the frame that is
  // actually being painted.
  let contentWidthPx = 0;
  // #425: the last frame's pane width — `paintDropLine` needs it alongside `contentWidthPx` to size
  // the timeline Insertion line the same way `syncRowBands` sizes a row band.
  let paneWidthPx = 0;

  const bandLayer = new KeyedLayer<FrameHeaderBand, number, BandGeom>();
  // One tick layer per band index — a nested keyed list is still a keyed list (plans/01 §8.1's
  // reconciler scope: attr/class/style/text + keyed children, nothing more).
  const bandTickLayers = new NestedKeyedLayers<number, FrameHeaderTick, number, TickGeom>();
  const rowLayer = new KeyedLayer<FrameRow, RowId, RowGeom>();
  const rowBandLayerCache = new KeyedLayer<FrameRow, RowId, RowBandGeom>();
  // One cell layer per row id, same nested pattern as bandTickLayers above.
  const rowCellLayers = new NestedKeyedLayers<RowId, CellItem, string, CellGeom>();
  const headerCellLayer = new KeyedLayer<CellItem, string, HeaderCellGeom>();
  const barLayerCache = new KeyedLayer<FrameBar, BarId, BarGeom>();

  // What the last applyState() call painted, so the next call touches only the bars
  // whose token set actually changed — O(changed bars), not O(bars) (I5, [S3-A3]).
  let paintedHovered: BarId | undefined;
  let paintedSelected: ReadonlySet<BarId> = new Set();
  /** The Entry the handle pair currently brackets (#200) — Entry-keyed, like the Selection it sits
   *  beside, because the pair straddles every bar that Entry drew. */
  let paintedResizable: EntryId | undefined;
  /** #142: which of the two handles `paintedResizable` last let resize — `applyState`'s repaint
   *  gate reads this alongside `paintedResizable`/`paintedHandleBars` so a Field-driven edge flip
   *  repaints even when the bracketed Entry and its bars have not changed. */
  let paintedResizableEdges: { start: boolean; end: boolean } | undefined;
  /** The two bars `paintResizeHandles` last put the handles on. `hitTest` reads it, so a grab on a
   *  handle names the bar under the pointer instead of a Bar id built from an Entry id (#185). */
  let paintedHandleBars: { start: BarId; end: BarId } | undefined;
  let paintedMovable: BarId | undefined;
  /** S3.5: bars an unsettled `beforeEntryMove`/`beforeEntryResize` Promise is holding. */
  let paintedPending: ReadonlySet<BarId> = new Set();
  /** S3.3: bars this backend currently holds off their committed transform for a drag
   *  preview — so the next `applyState` knows which ones to park back when they drop out of the set. */
  let paintedPreview: ReadonlySet<BarId> = new Set();
  /** S3.6: split of `paintedPreview` by `BarPreview.extra` — `dragging` is the caller's own
   *  gesture, `ghost` is an installed extension hook's cascade. Tracked separately from
   *  `paintedPreview` (which drives the transform, not the token) so a `data-state` repaint touches
   *  only the bars whose *token* actually changed, same diff-and-touch pattern as `paintedPending`. */
  let paintedDragging: ReadonlySet<BarId> = new Set();
  let paintedGhost: ReadonlySet<BarId> = new Set();
  /** The Selection this backend last painted (#212, ADR 0010, ADR 0025) — Entry ids, the same list
   *  the shell wrote. `applyState` diffs against it, and both remount paths (`syncRows`, `syncBars`)
   *  restamp a freshly-created node from it. `paintedSelected` above is its bar-side reading, derived
   *  from `barIdsByEntryId` rather than authored. */
  let paintedSelectedEntryIds: ReadonlySet<EntryId> = new Set();
  /** What the last `applyState` call stamped `data-state~="selected"` on (the same
   *  diff-and-touch posture, applied to rows) — `syncRows` below is the only other writer, and only
   *  for a row it just created. */
  let paintedSelectedRows: ReadonlySet<RowId> = new Set();
  /** The row `applyState` last stamped `data-state~="hovered"` on, the same diff base its selected
   *  twin above keeps. */
  let paintedHoveredRow: RowId | undefined;
  /** #425: the row (grid pane and timeline band both) `applyState`'s vertical-drag paint last
   *  stamped `data-drop` on — a drop's target row, or its refusal row. `undefined` outside a drop. */
  let paintedDropRowId: RowId | undefined;
  /** #425: the token `paintedDropRowId` carries — `'before' | 'after' | 'into' | 'refused'`. A
   *  row that remounts mid-drag (a wheel scroll, no pointer move) reads this to restamp
   *  `data-drop` itself, the same restamp-on-remount rule `syncRows` follows for selection. */
  let paintedDropToken: string | undefined;
  /** #425: the nearest ancestor `.fg-container` — set once at mount, walked from `gridLayer`
   *  (`view/pane-layout.ts` always mounts both panes inside one). `applyState`'s refusal cursor is
   *  the only reader; every other paint in this file stays inside the two mounted panes. */
  let fgContainer: HTMLElement | undefined;
  /** #425: the vertical drag's Insertion line — one instance per pane (the grid pane indents it by
   *  depth, the timeline pane runs it full width, `view/styles.ts`'s own `.fg-drop-line` rule tells
   *  the two apart). Created once at mount, moved and parked by `applyState`. */
  let dropLineGrid: HTMLElement | undefined;
  /** The note near the pointer that says why a drop refuses. One node, created at mount, shown only
   *  while a refused row sits under the pointer. It follows `pointerX`/`pointerY`, which a container
   *  listener keeps current, so the drag frame reads the pointer and allocates no event state. */
  let dropNote: HTMLElement | undefined;
  let pointerX = 0;
  let pointerY = 0;
  const DROP_NOTE_OFFSET_PX = 16;
  function placeDropNote(): void {
    if (dropNote === undefined || dropNote.hidden) return;
    dropNote.style.transform = `translate(${pointerX + DROP_NOTE_OFFSET_PX}px, ${pointerY + DROP_NOTE_OFFSET_PX}px)`;
  }
  function trackPointer(event: PointerEvent): void {
    pointerX = event.clientX;
    pointerY = event.clientY;
    placeDropNote();
  }
  function paintDropNote(note: string | undefined): void {
    if (dropNote === undefined) return;
    if (note === undefined) {
      dropNote.hidden = true;
      return;
    }
    if (dropNote.textContent !== note) dropNote.textContent = note;
    dropNote.hidden = false;
    placeDropNote();
  }
  let dropLineTimeline: HTMLElement | undefined;
  /** The Entries each mounted row owns (a header row owns none) — what `applyState`'s row diff reads
   *  `FrameRow.entryIds` into (#230, #421), so the row diff never resolves an Entry to answer it.
   *  `syncRows` is the only writer, rebuilt from the frame's own rows every render — never grows
   *  stale across a prune. */
  const rowEntryIds = new Map<RowId, readonly EntryId[]>();
  // Committed geometry per mounted bar: what the handle pair and the future preview offsets
  // (S3.3) both read. `syncBars` is the only writer.
  const barGeomByBarId = new Map<BarId, HandleGeom>();
  /** Each mounted bar's label width, measured once in `syncBars`'s own `toGeom` and read again,
   *  with no re-measurement, by `applyBarPreview`'s mid-drag flip check — "a label's text width does
   *  not change during a drag" is the fact this cache banks on. `undefined` means either no label
   *  (`barLabels: 'none'`, or a `barRenderer` owns this bar's content) or no 2d context to measure
   *  with; both read the same as "never flips". A defined width does not promise a painting
   *  placement: `'insideOrNone'` on a bar too narrow measures the text and still stores `'hidden'` in
   *  `labelPlacementByBarId` below, so the two maps disagree on purpose for that one state. */
  const labelWidthByBarId = new Map<BarId, number | undefined>();
  /** Each mounted bar's last-committed label token — what `restoreBarTransform` puts back on
   *  `data-label` once a resize preview that flipped it mid-drag clears without a commit. Written in
   *  `syncBars`'s own `toGeom`, the same cadence `labelWidthByBarId` keeps. `'hidden'` (`BarLabelToken`)
   *  restores a hidden-but-present child, not an absent attribute. */
  const labelPlacementByBarId = new Map<BarId, BarLabelToken | undefined>();
  /** The mounted bars of each Entry (#185, #212, ADR 0010) — the Entry→Bars relation both the
   *  Selection and the resize-handle pair are keyed by. A bar draws one Entry (#421, ADR 0026), so
   *  filing it here is the whole of what used to be a Segment→Bars index. `syncBars` is the only
   *  writer, so the selection diff never scans mounted bars. */
  const barIdsByEntryId = new Map<EntryId, BarId[]>();

  /** The two bars the handle pair sits on: the Entry's leftmost mounted bar and its rightmost one
   *  (#200). A resize acts on the Entry's envelope, so an Entry a producer drew as several bars hands
   *  its `start` handle to one bar and its `end` handle to another; an Entry that drew one bar names
   *  it twice (#212, ADR 0026). Undefined when the Entry has no mounted bar to hold either handle. */
  function envelopeBarsOfEntry(id: EntryId | undefined): { start: BarId; end: BarId } | undefined {
    if (id === undefined) return undefined;
    const mounted = barIdsByEntryId.get(id);
    if (mounted === undefined || mounted.length === 0) return undefined;
    let start = mounted[0]!;
    let end = start;
    for (const barId of mounted) {
      const geom = barGeomByBarId.get(barId);
      if (geom === undefined) continue;
      if (geom.x < barGeomByBarId.get(start)!.x) start = barId;
      const endGeom = barGeomByBarId.get(end)!;
      if (geom.x + geom.width > endGeom.x + endGeom.width) end = barId;
    }
    return { start, end };
  }

  /** Same two bars, or both undefined — the identity check `applyState`'s handle repaint needs
   *  (#211). A pick can arrive while `resizableEntryId` names the same Entry it already did (a click
   *  on an already-hovered bar), so gating the repaint on Entry identity alone would leave the pair
   *  glued to its pre-pick bars while the draft it grabs has already moved. */
  function sameBars(
    a: { start: BarId; end: BarId } | undefined,
    b: { start: BarId; end: BarId } | undefined,
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

  /** Moves the shared handle pair onto `bars`' own committed geometry, or parks both when
   *  it is undefined. Each handle reads its own bar: the start handle sits on the leftmost bar
   *  and the end handle on the rightmost (#200). `hidden` is a DOM property write, not
   *  `.style` — the base stylesheet owns `[hidden] { display: none }`.
   *
   *  #142/#256: `edges` hides one handle independently of the other — one write answer can close
   *  `end` while `start` still drags. Default both open, so a caller with nothing to say about edges
   *  (there is none left in this file, but a future one might arrive with `bars` alone) still shows
   *  a whole pair, matching the pre-#142 pair-only behaviour. */
  function paintResizeHandles(
    bars: { start: BarId; end: BarId } | undefined,
    edges: { start: boolean; end: boolean } = { start: true, end: true },
  ): void {
    if (!startHandle || !endHandle) return;
    const startGeom = bars === undefined ? undefined : barGeomByBarId.get(bars.start);
    const endGeom = bars === undefined ? undefined : barGeomByBarId.get(bars.end);
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

  /** S3.8: parks the Cursor line when `x` is undefined; otherwise translates the stroke
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

  /** S5.7: a resize drag's live width, painted on the header cell and every currently
   *  mounted body cell for that column — the same `data-field` attribute `cellSpec`/`headerCellSpec`
   *  already stamp, so no second index is needed to find them. Diffs against what was last painted
   *  (I5): a no-op when neither the column nor the width actually changed. */
  /** Puts the header cell and every mounted body cell for `columnKey` back to the geometry
   *  `syncKeyed` last patched onto them — the real committed width/flex, not whatever a live resize
   *  preview overwrote it with. Used only when a resize preview clears (a refused drag must
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

  /** S5.7: `data-drop` on the header cell a reorder would land before — or, for `null`
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

  /** S5.7: the grabbed header cell follows the pointer. A `translateX` on the cell itself
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

  /** S5.7: one reorder drag's whole live paint — the grabbed cell's follow transform and
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
   *  bar returns to once the preview clears (S3.3). */
  function restoreBarTransform(id: BarId): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByBarId.get(id);
    if (!node || !geom) return;
    node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
    node.style.width = `${geom.width}px`;
    // A resize preview that flipped the label mid-drag (see applyBarPreview) must not leave that
    // flip stamped once the preview clears without a commit — restore syncBars's own last answer.
    // `undefined` means this bar owns no label child at all (see BarLabelToken); anything else,
    // `'hidden'` included, is a token `patch` already gave this bar's child, so it is safe to restamp.
    const committed = labelPlacementByBarId.get(id);
    if (committed === undefined) delete node.dataset['label'];
    else node.dataset['label'] = committed;
  }

  /** Offsets one bar's transform/width by `preview`'s px delta, on top of its committed geometry —
   *  a hot-path write only (I5): no frame recompute, no node creation. */
  function applyBarPreview(id: BarId, preview: BarPreview): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByBarId.get(id);
    if (!node || !geom) return;
    const x = geom.x + preview.dx;
    const y = geom.y + preview.dy;
    const width = geom.width + preview.dWidth;
    node.style.transform = `translate(${x}px, ${y}px)`;
    if (preview.dWidth === 0) return;
    node.style.width = `${width}px`;
    // A resize preview can cross the inside/outside fit line, or (#435 follow-up) the
    // inside/none fit line `'insideOrNone'` draws, mid-drag. Reuse the label width syncBars already
    // measured — no canvas call on the hot path — and touch the dataset only on an actual flip, the
    // same diff-and-touch-only posture every other paintedX field in this file keeps.
    const textWidth = labelWidthByBarId.get(id);
    if (textWidth === undefined) return;
    const entry = entryById(entryIdOfBar(id));
    const policy = entry === undefined ? 'fitBar' : resolveBarLabelPolicy(entry);
    const placement = resolveBarLabelPlacement(policy, textWidth, x, width, barLabelGapPx, contentWidthPx);
    // Invariant this line leans on (pass-2 branch review): `labelWidthByBarId` is defined for a
    // bar (the guard above) only when `toGeom` measured a label for it, and `toGeom` measures a label
    // only for a bar that also gets a `.fg-bar-label` child — either painting, or hidden and ready to
    // reveal (`canFlipToLabel`). So the one shape `resolveBarLabelPlacement` can return `undefined`
    // for here is `'insideOrNone'` on a bar too narrow, and that bar is guaranteed a hidden child to
    // flip onto — never a deleted attribute with nothing behind it. If `labelWidthByBarId` and the
    // child's existence ever diverge, this line is where it would surface as a missing paint.
    const token: BarLabelToken = placement ?? 'hidden';
    if (token === node.dataset['label']) return;
    node.dataset['label'] = token;
  }

  function paintPreview(previews: readonly BarPreview[] | undefined): void {
    const next = new Map<BarId, BarPreview>();
    for (const preview of previews ?? []) next.set(preview.barId, preview);
    paintedPreview.forEach((id) => {
      if (!next.has(id)) restoreBarTransform(id);
    });
    next.forEach((preview, id) => applyBarPreview(id, preview));
    paintedPreview = new Set(next.keys());

    // S3.6: `dragging` (the caller's own draft) vs `ghost` (an installed extension hook's
    // `extra`, U7) — same diff-and-touch-only-changed shape `applyState`'s selected/pending sets use.
    const nextDragging = new Set<BarId>();
    const nextGhost = new Set<BarId>();
    next.forEach((preview, id) => (preview.extra ? nextGhost : nextDragging).add(id));
    const changed = new Set<BarId>();
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
    barId: BarId,
    hovered: BarId | undefined,
    selected: ReadonlySet<BarId>,
    pending: ReadonlySet<BarId>,
    dragging: ReadonlySet<BarId>,
    ghost: ReadonlySet<BarId>,
  ): void {
    const node = barLayerCache.node(barId);
    if (!node) return;
    const tokens: string[] = [];
    if (hovered === barId) tokens.push('hovered');
    if (selected.has(barId)) tokens.push('selected');
    if (pending.has(barId)) tokens.push('pending');
    if (dragging.has(barId)) tokens.push('dragging');
    if (ghost.has(barId)) tokens.push('ghost');
    node.dataset['state'] = tokens.join(' ');
  }

  /** Adds the bars one Entry paints to `into` (#212, #421) — every bar `syncBars` filed under it. An
   *  Entry the viewport culled adds nothing, and `syncBars`'s own restamp paints its bar when it
   *  comes back. */
  function addBarsOfEntry(into: Set<BarId>, entryId: EntryId): void {
    const mounted = barIdsByEntryId.get(entryId);
    if (mounted === undefined) return;
    for (const id of mounted) into.add(id);
  }

  /** The bars the whole Selection paints (#212) — every selected Entry read through the rule above. */
  function paintedBarsOf(entryIds: ReadonlySet<EntryId>): Set<BarId> {
    const ids = new Set<BarId>();
    entryIds.forEach((entryId) => addBarsOfEntry(ids, entryId));
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

  /** #425: a vertical drag's own row paint — `data-drop` on the target or refused row and its
   *  timeline band, `data-drop="refused"` on the container for the cursor, and the Insertion line.
   *  `undefined` outside a drop, or while it sits over the source row: clears all three. */
  function paintRowDrop(rowDrop: InteractionState['rowDrop']): void {
    if (rowDrop === undefined) {
      paintDropRowToken(undefined, undefined);
      fgContainer?.removeAttribute('data-drop');
      paintDropNote(undefined);
      paintDropLine(undefined, 0);
      return;
    }
    if ('refusedRowId' in rowDrop) {
      paintDropRowToken(rowDrop.refusedRowId, 'refused');
      fgContainer?.setAttribute('data-drop', 'refused');
      paintDropNote(rowDrop.note);
      paintDropLine(undefined, 0);
      return;
    }
    paintDropRowToken(rowDrop.rowId, rowDrop.side);
    fgContainer?.removeAttribute('data-drop');
    paintDropNote(undefined);
    paintDropLine(rowDrop.lineY, rowDrop.depth);
  }

  /** Diff-and-touch-only (I5), the same posture `paintColumnDropIndicator` already keeps for the
   *  column-reorder drag: same row as last time, only the token can still differ; a different row
   *  clears the old one first. */
  function paintDropRowToken(rowId: RowId | undefined, token: string | undefined): void {
    if (rowId !== undefined && rowId === paintedDropRowId) {
      if (token !== undefined) {
        rowLayer.node(rowId)?.setAttribute('data-drop', token);
        rowBandLayerCache.node(rowId)?.setAttribute('data-drop', token);
        paintedDropToken = token;
      }
      return;
    }
    if (paintedDropRowId !== undefined) {
      rowLayer.node(paintedDropRowId)?.removeAttribute('data-drop');
      rowBandLayerCache.node(paintedDropRowId)?.removeAttribute('data-drop');
    }
    paintedDropRowId = undefined;
    paintedDropToken = undefined;
    if (rowId === undefined || token === undefined) return;
    rowLayer.node(rowId)?.setAttribute('data-drop', token);
    rowBandLayerCache.node(rowId)?.setAttribute('data-drop', token);
    paintedDropRowId = rowId;
    paintedDropToken = token;
  }

  /** Parks the Insertion line when `lineY` is undefined — an `into` drop (the target row's own
   *  outline is the indicator then) or no drop at all. `depth * --fg-indent-width` is the grid
   *  pane's own left inset (`view/styles.ts`); the timeline instance resets it to 0 (full width).
   *
   *  The timeline instance is a child of `.fg-timeline-pane` (`position: relative; overflow: auto`),
   *  the same containing block `syncRowBands` sizes a row band against (I5) — `width: 100%` alone
   *  would size to the pane's client width and vanish past one pane width of horizontal scroll. */
  function paintDropLine(lineY: number | undefined, depth: number): void {
    if (!dropLineGrid || !dropLineTimeline) return;
    if (lineY === undefined) {
      dropLineGrid.hidden = true;
      dropLineTimeline.hidden = true;
      return;
    }
    dropLineGrid.hidden = false;
    dropLineTimeline.hidden = false;
    dropLineGrid.style.transform = `translateY(${lineY}px)`;
    dropLineGrid.style.setProperty('--fg-drop-line-depth', String(depth));
    dropLineTimeline.style.width = `${Math.max(contentWidthPx, paneWidthPx)}px`;
    dropLineTimeline.style.transform = `translateY(${lineY}px)`;
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

  // Bands keyed by index, coarsest first; ticks keyed within a band. Today every shipped
  // preset has exactly one header, so this renders byte-identical output to the pre-S1.7 single list.
  function syncHeader(bands: readonly FrameHeaderBand[]): void {
    if (!headerBandsHost) return;
    bandLayer.sync(headerBandsHost, bands, {
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
      // S5.11: one Grid column's box on one Row is a `gridcell`. `tabIndex` stays off the
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
      // S5.11: one Grid column's header cell is a `columnheader`, inside the header row
      // `view/pane-layout.ts` mounts it in. `tabIndex` stays off the node here — `view/roving-focus.ts`
      // owns which one header cell is the pane's tab stop.
      const label = document.createElement('span');
      label.className = 'fg-col-header-label';
      const accessibleName = document.createElement('span');
      accessibleName.className = VISUALLY_HIDDEN_CLASS;
      const resizer = document.createElement('div');
      resizer.className = 'fg-column-resizer';
      resizer.setAttribute('aria-hidden', 'true');
      node.append(label, accessibleName, resizer);
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
      // `create` above always appends `label`, then the hidden name span.
      const label = node.children[0] as HTMLElement;
      const accessibleName = node.children[1] as HTMLElement;
      applyElementDescription(label, geom.content ?? { text: geom.text });
      // A renderer changes what the header shows, not what a screen reader hears. The header text
      // stays the accessible name, as hidden text beside the renderer's output.
      if (geom.content !== undefined) label.setAttribute('aria-hidden', 'true');
      else label.removeAttribute('aria-hidden');
      accessibleName.textContent = geom.content !== undefined ? geom.text : '';
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
    rowEntryIds.clear();
    for (const row of rows) if (row.entryIds.length > 0) rowEntryIds.set(row.id, row.entryIds);
    rowLayer.sync(gridLayer, rows, {
      key: (row) => row.id,
      create: (row, key) => {
        const node = document.createElement('div');
        node.className = ROW_CLASS;
        // S5.11: `row`, not `listitem`. A `listitem` has no `list` ancestor here and may
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
        if (row.entryIds.some((id) => paintedSelectedEntryIds.has(id))) {
          node.dataset['state'] = 'selected';
          paintedSelectedRows = new Set(paintedSelectedRows).add(key);
        }
        // #425: a wheel scroll can remount the drag's own target/refused row with no pointermove
        // in between — restamp `data-drop` here, the same rule `paintedSelectedRows` follows above.
        if (key === paintedDropRowId && paintedDropToken !== undefined) {
          node.dataset['drop'] = paintedDropToken;
        }
        return node;
      },
      toGeom: (row) => {
        const geom: RowGeom = {
          top: row.top,
          height: row.height,
          gridCells: row.gridCells,
          index: row.index,
          rowCount,
          tree,
          depth: row.depth,
          expandable: row.expandable,
          expanded: row.expanded,
        };
        if (row.matched === false) geom.matched = false;
        if (row.locked === true) geom.locked = true;
        return geom;
      },
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.style.setProperty('--fg-row-depth', String(geom.depth));
        // Only the windowed rows exist, so the row states where it sits in the whole set (I3). Every
        // pattern takes `aria-rowindex`; the three tree attributes belong to a `treegrid` alone
        // (S5.11), and the header row above the body takes index 1.
        node.setAttribute('aria-rowindex', String(geom.index + 2));
        setTreeRowAttributes(node, geom);
        node.dataset['parity'] = rowParity(geom.index);
        if (geom.matched === false) node.dataset['matched'] = 'false';
        else delete node.dataset['matched'];
        if (geom.locked === true) node.dataset['locked'] = '';
        else delete node.dataset['locked'];
      },
    });

    syncCellsForEachRow(rows, columns);
  }

  /** `aria-level`, `aria-posinset`, `aria-setsize` and `aria-expanded` describe a row's place in a
   *  tree. A flat `grid` row has no such place, and carrying them there is what `aria-allowed-attr`
   *  refuses (S5.11, §0.1). `aria-expanded` comes off the row itself, not off the twisty:
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
    renderers: readonly (ResolvedRenderer<BoundGridCellRenderer> | undefined)[],
  ): readonly CellItem[] {
    const subject = row.entryIds[0];
    const entry = subject !== undefined ? entryById(subject) : undefined;
    return cellItemsFor(row.gridCells, columns, row.expandable, row.expanded).map((item, i) => {
      const resolved = renderers[i];
      if (resolved === undefined) return item;
      const content = callRenderer(
        'gridCell',
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
    // fresh object holding a fresh closure (`view/gantt-shell.ts`'s `resolveGridCellRenderer`). Frames
    // fire on scroll, so that was two allocations per cell per scrolled frame. `plans/01` §8: the
    // hot path allocates nothing. One resolve per column per frame answers every row.
    const renderers = columns.map((column) => resolveGridCellRenderer(column.field));
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
    // S5.7: `applyState`'s drop-indicator paint needs "the last column" for the `null`
    // ("at the end") case — the only place that order is known outside `syncGridHeader` itself.
    lastHeaderColumnKeys = items.map((item) => item.key);
  }

  function syncBars(bars: readonly FrameBar[]): void {
    if (!barLayer) return;
    barGeomByBarId.clear();
    barIdsByEntryId.clear();
    for (const bar of bars) {
      barGeomByBarId.set(bar.id, { x: bar.x, y: bar.y, width: bar.width, height: bar.height });
      // #185, #421: the frame states which Entry drew this bar, so the paint side never parses an id.
      const mounted = barIdsByEntryId.get(bar.entryId);
      if (mounted === undefined) barIdsByEntryId.set(bar.entryId, [bar.id]);
      else mounted.push(bar.id);
    }
    // #212: which bars the Selection paints, read off the index this sync just built. `create` below
    // asks it rather than restating the "which Entry does this bar draw" rule a second time. One
    // statement of that rule, and the index is where it already lives.
    const selectedBars = paintedBarsOf(paintedSelectedEntryIds);
    barLayerCache.sync(barLayer, bars, {
      key: (bar) => bar.id,
      create: (bar) => {
        const node = document.createElement('div');
        node.className = BAR_CLASS;
        node.dataset[BAR_ID_KEY] = bar.id;
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
        // The row, never `bar.variant`: which paint this bar wears is the rule that matched this
        // row, and two rules may share one name.
        const entry = entryById(bar.entryId);
        // The library measures and places every bar's label first, before any renderer runs, so
        // a `barRenderer` can paint the label the library already decided on. One text ruler, in one
        // place — a renderer never needs one of its own to know inside from outside.
        // An empty label (no name, #421 C5) prints nothing: skip the placement decision entirely
        // rather than measure a zero-width string, the same `undefined` path `'none'` already takes.
        const policy = entry === undefined ? 'fitBar' : resolveBarLabelPolicy(entry);
        const textWidth = bar.label === '' || policy === 'none' ? undefined : textRuler?.widthOf(bar.label);
        const resolvedPlacement =
          bar.label === ''
            ? undefined
            : resolveBarLabelPlacement(policy, textWidth, bar.x, bar.width, barLabelGapPx, contentWidthPx);
        const resolved = entry === undefined ? undefined : resolveBarRenderer(entry);
        let content: ElementDescription | undefined;
        if (resolved !== undefined && entry !== undefined) {
          const context: BarRendererContext = { entry, bar };
          if (resolvedPlacement !== undefined) {
            context.label = { text: bar.label, placement: resolvedPlacement };
          }
          content = callRenderer('bar', resolved, context, raiseError);
        }
        // A `barRenderer` result owns this bar's content, so the library injects no label child and
        // stamps no `data-label` for it — the S5.4 seam. The renderer's own label rides in
        // its markup instead, which is also why the mid-drag restamp below skips such a bar: its
        // label placement is a frame fact for it, not a hot-path one.
        const ownsContent = content !== undefined && paintsItsOwnContent(content);
        // (#435 follow-up): a resize preview can still widen an `insideOrNone` bar past the fit
        // line mid-drag (applyBarPreview), and that hot path only flips `data-label` — it never grows
        // the child `patch` owns. So this one case gets a child up front, holding the `'hidden'` token
        // (see `BarLabelToken` for what it costs), instead of no child at all.
        const canFlipToLabel = !ownsContent && policy === 'insideOrNone' && bar.label !== '';
        const labelToken: BarLabelToken | undefined = ownsContent
          ? undefined
          : (resolvedPlacement ?? (canFlipToLabel ? 'hidden' : undefined));
        labelWidthByBarId.set(bar.id, ownsContent ? undefined : textWidth);
        labelPlacementByBarId.set(bar.id, labelToken);
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
          locked: bar.locked === true,
          labelPlacement: labelToken,
          ...(content !== undefined ? { content } : {}),
        };
      },
      patch: (node, geom) => {
        node.dataset['variant'] = geom.variant;
        // States a fact about the paint, not a judgement on the variant (plans/01 §2.5) — every bar
        // `barSpan` floors or fixes carries it the same way. Pair with `data-variant` to tell which
        // variant was floored or holds a fixed box.
        if (geom.span === 'exact') delete node.dataset['span'];
        else node.dataset['span'] = geom.span;
        node.dataset['flag'] = flagTokens(geom.flags);
        if (geom.locked) node.dataset['locked'] = '';
        else delete node.dataset['locked'];
        // See `BarLabelToken` for what `undefined` vs. each token means and costs.
        if (geom.labelPlacement === undefined) delete node.dataset['label'];
        else node.dataset['label'] = geom.labelPlacement;
        node.setAttribute('aria-label', geom.a11yLabel);
        node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
        node.style.width = `${geom.width}px`;
        node.style.height = `${geom.height}px`;
        // No child at all only for `labelPlacement === undefined` — see `BarLabelToken`. Any other
        // token gets the child, `'hidden'` included.
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
        // #425: same restamp as `syncRows` — a band that remounts mid-drag must not wait for the
        // next `applyState` to regain its `data-drop` token.
        if (key === paintedDropRowId && paintedDropToken !== undefined) {
          node.dataset['drop'] = paintedDropToken;
        }
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
      headerBandsHost = document.createElement('div');
      headerBandsHost.className = 'fg-header-bands';
      headerLayer.append(headerBandsHost);
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      // One ruler per mount, off the bar layer's own computed font — the font a label actually
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
      // Owns the native scrollable extent (S1.5 README): rows/bars are positioned absolutely,
      // so nothing else in this DOM makes `timelineHost` actually overflow — without this, neither the
      // x nor the y `ScrollAxis`'s `panTo` has anywhere real to write. Zero visual footprint; `sync()`
      // moves it to the frame's bottom-right corner every render.
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
      // children on every later sync — still painted above every bar.
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
      // S5.6: mounted before Date lines, so a registered decoration paints below the
      // today wrapper and any authored Date line — those stay the topmost stroke either way.
      decorations = attachDecorations(timelineHost, barLayer);
      // Inserted between the decorations and the bars, so the lines paint over the zebra, the
      // selected-row band, and time shading, and under every bar — the design's own paint order
      // (`rowBands` -> `decorations` -> `tickLines` -> `bars`).
      tickLines = attachTickLines(timelineHost, barLayer);
      dateLines = attachDateLines(timelineHost, headerLayer, contentSizer);
      timelineHost.append(cursorLine);
      headerLayer.append(cursorLineLabel);
      // #425: `gridLayer` (`.fg-rows`) and `timelineHost` (`.fg-timeline-pane`) both mount inside
      // one `.fg-container` (`view/pane-layout.ts`) — walked once here, not re-read per drag.
      fgContainer = gridLayer.closest<HTMLElement>('.fg-container') ?? undefined;
      dropNote = document.createElement('div');
      dropNote.className = 'fg-drop-note';
      dropNote.setAttribute('aria-hidden', 'true');
      dropNote.hidden = true;
      fgContainer?.append(dropNote);
      fgContainer?.addEventListener('pointermove', trackPointer, true);
      dropLineGrid = document.createElement('div');
      dropLineGrid.className = 'fg-drop-line';
      dropLineGrid.setAttribute('aria-hidden', 'true');
      dropLineGrid.hidden = true;
      gridLayer.append(dropLineGrid);
      dropLineTimeline = document.createElement('div');
      dropLineTimeline.className = 'fg-drop-line';
      dropLineTimeline.setAttribute('aria-hidden', 'true');
      dropLineTimeline.hidden = true;
      // Mounted ahead of `.fg-content-sizer`, the same trap `attachDateLines` documents: appended
      // after the sizer, this line's static origin sits 1px below the grid line it must sit on.
      timelineHost.insertBefore(dropLineTimeline, contentSizer);
    },
    sync(frame: GeometryFrame) {
      if (headerBandsHost) {
        // A boundary tick's cell is one full calendar unit wide and can overshoot `contentWidth` on a
        // coarse preset over a short dataset. `.fg-header-bands` clips (`overflow: hidden`) at its own
        // box edge, so the box must be exactly `contentWidth` wide — or the clip lands at the pane's
        // width instead and either hides in-range ticks or lets an oversized tick inflate native
        // scrollWidth (S1.12, `e2e/timeline-content-width.spec.ts`). Carrying this on `headerBandsHost`, not
        // `.fg-header` itself, is what leaves `.fg-header` free to stay `overflow: visible` for the
        // Date line label (#225).
        headerBandsHost.style.width = `${frame.contentWidth}px`;
      }
      syncHeader(frame.header.bands);
      syncGridHeader(frame.columns);
      syncRows(frame.rows, frame.rowCount, frame.tree, frame.columns);
      syncRowBands(frame.rows, frame.contentWidth, frame.visible.width);
      // Banked for `applyBarPreview`'s mid-drag flip check, which never receives a `frame` of its
      // own — the "outside" fit test runs against the frame actually on screen, not a stale one.
      contentWidthPx = frame.contentWidth;
      paneWidthPx = frame.visible.width;
      syncBars(frame.bars);
      // A resize commit repaints the resized bar with new geometry through this same `sync()`, but
      // `applyState`'s handle repaint is gated on `resizableEntryId` actually changing — it stays the
      // same Entry across a commit whenever the bar is still hovered or is the sole selection, so
      // that gate alone left the handle pair glued to its pre-commit position. The handle pair's
      // geometry has to track `syncBars` every frame, the same way a bar's own transform does, not
      // just on identity change.
      if (paintedResizable !== undefined) {
        paintResizeHandles(envelopeBarsOfEntry(paintedResizable), paintedResizableEdges);
      }
      tickLines?.sync(frame.tickLines, frame.contentHeight, frame.visible.height);
      dateLines?.sync({
        decorations: frame.decorations,
        contentHeight: frame.contentHeight,
        paneHeight: frame.visible.height,
        labelPlacement: readDateLineLabelPlacement(),
      });
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
        // native scroll by one transform per frame instead of a second real scroller.
        // Both panes read `top` from the same `frame.rows` array, so pixel-identity (I9) is
        // structural rather than a property this line has to maintain by hand.
        gridLayer.style.transform = `translateY(${-frame.visible.y}px)`;
      }
      if (contentSizer) {
        // The sizer itself is 1x1px, so its far edge — not its origin — must land at the content
        // extent, or the browser's native scrollable range ends up 1px past what the ScrollAxis computed.
        // No gutter to add: the timeline pane's content is `contentWidth` wide, full stop.
        const x = Math.max(0, frame.contentWidth - 1);
        const y = Math.max(0, frame.contentHeight - 1);
        contentSizer.style.transform = `translate(${x}px, ${y}px)`;
      }
    },
    applyState(state: InteractionState) {
      // Diff against what was last painted, touch only the bars whose token set
      // changed. No frame recompute, no node creation — `barLayerCache` already holds every mounted
      // bar's node from the last sync().
      const nextSelectedEntryIds = new Set(state.selectedEntryIds ?? []);
      const nextSelected = paintedBarsOf(nextSelectedEntryIds);
      const nextHovered = state.hoveredBarId;
      const nextPending = new Set(state.pendingBarIds ?? []);
      const changed = new Set<BarId>();
      // #212: the selection diff runs over Entries, then touches that Entry's bars. It is
      // O(Entries whose selection flipped), never a scan of every mounted bar (I5).
      paintedSelectedEntryIds.forEach((id) => {
        if (!nextSelectedEntryIds.has(id)) addBarsOfEntry(changed, id);
      });
      nextSelectedEntryIds.forEach((id) => {
        if (!paintedSelectedEntryIds.has(id)) addBarsOfEntry(changed, id);
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
      // from. A row paints selected when the Selection holds any Entry it owns (#212, #230, #421).
      // Still diff-and-touch-only (I5): only rows whose token actually flips get written, exactly
      // like the bar loop above.
      const nextSelectedRows = new Set<RowId>();
      rowEntryIds.forEach((entryIds, rowId) => {
        if (entryIds.some((id) => nextSelectedEntryIds.has(id))) {
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
      paintedSelectedEntryIds = nextSelectedEntryIds;
      paintedSelectedRows = nextSelectedRows;
      paintedHoveredRow = nextHoveredRow;

      // The shared handle pair follows `resizableEntryId`, positioned off the committed
      // geometry `syncBars` already recorded — never a per-bar computation of its own. #211: the
      // Selection can narrow with `resizableEntryId` unchanged (a click on the already-hovered bar),
      // so the repaint gate also has to catch a pair whose own bars moved, not only a changed Entry.
      // #142: it also has to catch `resizableEdges` flipping with the Entry unchanged — a live
      // `dataset.fields` reconfiguration can open or close an edge without touching the Selection.
      const nextResizable = state.resizableEntryId;
      const nextEdges = state.resizableEdges;
      const nextHandleBars = envelopeBarsOfEntry(nextResizable);
      if (
        nextResizable !== paintedResizable ||
        !sameBars(nextHandleBars, paintedHandleBars) ||
        !sameEdges(nextEdges, paintedResizableEdges)
      ) {
        paintResizeHandles(nextHandleBars, nextEdges);
        paintedResizable = nextResizable;
        paintedResizableEdges = nextEdges;
      }

      // `cursor: grab` follows `movableBarId` via a boolean attribute, not an inline style
      // (`no-inline-style-outside-geometry`) — the base stylesheet owns the actual `cursor` rule.
      const nextMovable = state.movableBarId;
      if (nextMovable !== paintedMovable) {
        if (paintedMovable !== undefined) barLayerCache.node(paintedMovable)?.removeAttribute('data-movable');
        if (nextMovable !== undefined) barLayerCache.node(nextMovable)?.setAttribute('data-movable', '');
        paintedMovable = nextMovable;
      }

      paintPreview(state.preview);
      paintCursorLine(state.cursorX, state.cursorLabel);
      paintColumnResizePreview(state.columnResizePreview);
      paintColumnReorderPreview(state.columnReorderPreview);
      paintRowDrop(state.rowDrop);
    },
    hitTest(at: ClientPoint): HitResult | null {
      // "The bars array is the hit index; DOM backends get hit-testing from event delegation"
      // (plans/01 §4) — no materialized hit-region array (#31).
      if (!barLayer) return null;
      const el = document.elementFromPoint(at.x, at.y);
      // S3.4: the shared handle pair sits above the bar layer in paint order, so a hit on a
      // handle is checked first — `paintedHandleBars` names the bar each handle sits on (
      // #200), a parked (hidden) handle is never returned by elementFromPoint.
      const handle = el instanceof Element ? el.closest<HTMLElement>(`.${BAR_HANDLE_CLASS}`) : null;
      if (handle && paintedHandleBars !== undefined) {
        const edge = handle.dataset['edge'];
        if (edge === 'start' || edge === 'end') {
          return { kind: 'bar', barId: paintedHandleBars[edge], edge };
        }
      }
      const bar = el instanceof Element ? el.closest<HTMLElement>(`.${BAR_CLASS}`) : null;
      if (bar && barLayer.contains(bar)) {
        const id = barIdFromDataset(bar.dataset[BAR_ID_KEY]);
        return id ? { kind: 'bar', barId: id } : null;
      }
      // Bug hunt (S5 fixes, "grid row highlight and row click"): a miss on the bar layer falls
      // through to the grid pane — a row click selects the same way a bar click does. The hit names
      // the row itself (#185): which Entries that row owns is the caller's question, and a row that
      // owns several used to lose all but the first to a made-up Bar id. A twisty click is not a
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
      barGeomByBarId.clear();
      barIdsByEntryId.clear();
      paintedHovered = undefined;
      paintedSelected = new Set();
      paintedPending = new Set();
      paintedResizable = undefined;
      paintedHandleBars = undefined;
      paintedMovable = undefined;
      paintedPreview = new Set();
      paintedDragging = new Set();
      paintedGhost = new Set();
      paintedSelectedEntryIds = new Set();
      paintedSelectedRows = new Set();
      rowEntryIds.clear();
      lastHeaderColumnKeys = [];
      paintedColumnResize = undefined;
      paintedColumnDropKey = undefined;
      paintedColumnDragKey = undefined;
      gridLayer = undefined;
      gridHeaderLayer = undefined;
      timelineHost = undefined;
      headerLayer = undefined;
      headerBandsHost = undefined;
      barLayer = undefined;
      rowBandLayer = undefined;
      contentSizer = undefined;
      startHandle = undefined;
      endHandle = undefined;
      cursorLine = undefined;
      cursorLineLabel = undefined;
      cursorLineHeight = 0;
      paintedDropRowId = undefined;
      paintedDropToken = undefined;
      fgContainer?.removeEventListener('pointermove', trackPointer, true);
      dropNote?.remove();
      dropNote = undefined;
      fgContainer = undefined;
      dropLineGrid = undefined;
      dropLineTimeline = undefined;
    },
  };
}
