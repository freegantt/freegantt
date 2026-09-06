// render/ backend contract (plans/01 §8.1). Shared by dom and null backends; DOM types are structural only —
// this file itself never touches document/window.

import type {
  EntryId,
  GeometryFrame,
  ItemId,
  ItemPreview,
  ClientPoint,
  RowId,
  SegmentId,
} from '../layout/index.js';

export interface InteractionState {
  hoveredItemId?: ItemId;
  /** The Selection itself (#212, ADR 0010): the Segment ids `Gantt.selectedSegmentIds` holds. A bar
   *  paints selected when the Selection holds that bar's own Segment. A bar that draws an Entry's
   *  whole span — a group, a milestone — paints selected when the Selection holds any Segment of that
   *  Entry. Which bar drew which Segment is the frame's own answer, never a string built from an id. */
  selectedSegmentIds?: readonly SegmentId[];
  /** The Entry the shared handle pair brackets (S3, D-S3-6/D-S3-8): the hovered bar's Entry, else
   *  the single selected one — and only when its `resize` capability resolved true. Undefined parks
   *  the handles. A resize acts on the Entry's envelope (#200), so the pair straddles every bar the
   *  Entry drew: the `start` handle on the earliest bar, the `end` handle on the latest. A backend
   *  reads those bars off the frame it synced, the same way `selectedSegmentIds` paints. The pair
   *  narrows to one bar when the Selection holds exactly one Segment of the Entry (#212). */
  resizableEntryId?: EntryId;
  /** The hovered bar, and only when its `move` capability resolved true — what gets `cursor: grab`
   *  (S3, D-S3-6). */
  movableItemId?: ItemId;
  /** S3.3, D-S3-18: an in-flight drag's per-item pixel offset, coalesced on the shell's own rAF.
   *  Undefined outside a gesture — a backend parks every previewed bar back on its committed
   *  transform the moment this clears. */
  preview?: readonly ItemPreview[];
  /** S3.5, D-S3-17: which bars a `beforeEntryMove`/`beforeEntryResize` handler's unsettled Promise is
   *  holding — painted `data-state~="pending"` (reduced opacity and a dotted outline). Undefined once
   *  it settles either way. */
  pendingItemIds?: readonly ItemId[];
  /** S3.8, D-S3-15: content-x of the Cursor line during a pointer drag. Undefined parks the
   *  singleton. Never a frame decoration. */
  cursorX?: number;
  /** S3.8, D-S3-15: snapped `formatDate` caption for `cursorX`. Empty parks the label node. */
  cursorLabel?: string;
  /** S5.7, D-S5-18: a resize drag's live px width for one column, keyed by its `FrameColumn.field`
   *  string. Undefined outside a resize drag — a hot-path paint only, no frame recompute. */
  columnResizePreview?: { columnKey: string; widthPx: number };
  /** S5.7, D-S5-18: a reorder drag's live paint — the grabbed column key (as a string), how far its
   *  header cell rides from its own slot, and the column key the drop would land before (`null` for
   *  "at the end"). Undefined outside a reorder drag — a hot-path paint only (one transform, one
   *  attribute), no frame recompute. */
  columnReorderPreview?: { columnKey: string; offsetPx: number; beforeColumnKey: string | null };
}

/** What `hitTest` found: a bar in the timeline pane, or a row in the grid pane (#185). A row hit
 *  names the row, and the row is what owns Entries — a backend never invents an Item id for it. */
export type HitResult = BarHit | RowHit;

export interface BarHit {
  kind: 'bar';
  itemId: ItemId;
  /** S3.4, D-S3-4: set when the hit landed on a resize handle rather than the bar body — which edge
   *  a resize gesture should grab. Sourced from the handle's own `data-edge` attribute (D-S3-8). */
  edge?: 'start' | 'end';
}

export interface RowHit {
  kind: 'row';
  rowId: RowId;
}

/** The two paint surfaces a backend mounts into (S1.8, D-S1.8-1): the grid pane's row layer, and the
 *  timeline pane's content layer (header bands, bars, links, decorations). The row-label gutter used
 *  to be a backend concern (`rowLabelWidth`, #46) simulated inside one paint layer — now it is the
 *  grid pane's own width, owned by `view/pane-layout.ts`, and a backend never reserves it. */
export interface RenderSurfaces<THost> {
  grid: THost;
  timeline: THost;
  /** Column header row in the grid pane. Omitted by tests that only paint body cells. */
  gridHeader?: THost;
}

/** `THost` is the seam's only DOM-shaped type parameter — `backend.ts` itself still names no DOM
 * type (#23). `createDomBackend(): RenderBackend<HTMLElement>`; a future canvas backend would be
 * `RenderBackend<HTMLCanvasElement>`, checked at the call site instead of cast blind at `mount()`. */
export interface RenderBackend<THost = unknown> {
  mount(surfaces: RenderSurfaces<THost>): void;
  sync(frame: GeometryFrame): void;
  applyState(state: InteractionState): void;
  hitTest(at: ClientPoint): HitResult | null;
  destroy(): void;
}
