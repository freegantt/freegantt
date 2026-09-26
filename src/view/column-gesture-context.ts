// view/ — the seam `interaction/column-gestures.ts` drives and `GanttShell` implements. Same split
// as `entry-gesture-context.ts`: `interaction/` performs no
// arithmetic of its own — every commit, every floor clamp, every capability check runs behind this
// context, which `GanttShell` builds closing over its own private state.

import type { FieldKey } from '../model/index.js';

/** One resize or reorder gesture's outcome: `GanttShell` runs the one
 *  `beforeGridColumnsChange` → commit → `gridColumnsChange` sequence and reports whether it landed.
 *  `false` means a `before*` handler vetoed it — the caller (`interaction/column-gestures.ts`) is the
 *  one holding the pre-drag state to restore, since it captured the real on-screen width/order at
 *  drag start. */
export type ColumnGestureCommit = boolean;

/** One in-flight reorder drag, as the screen shows it: the grabbed header cell rides
 *  `offsetPx` from its own slot, and the drop indicator marks where the drop would land. Both halves
 *  travel together because both change on the same `pointermove` — a cell that follows the pointer
 *  while the indicator lags a frame behind would read as two separate gestures. */
export interface ColumnReorderPreview {
  /** The header cell the pointer grabbed. */
  readonly columnKey: FieldKey;
  /** How far the pointer has travelled since the grab, in px — the grabbed cell's horizontal offset
   *  from the slot it still occupies. A transform only: the cell never leaves its slot in the flow,
   *  so no neighbour reflows and no other cell's on-screen position changes mid-drag. */
  readonly offsetPx: number;
  /** The column this drop would land before — `null` for "at the end". */
  readonly beforeColumnKey: FieldKey | null;
}

/** What `interaction/column-gestures.ts`'s pointer sequences and `GanttShell`'s own keyboard chords
 *  (Alt+Arrow move, Shift+Arrow resize) both run through — one place decides whether a
 *  column may be dragged/nudged and what a gesture actually commits. */
export interface ColumnGestureContext {
  /** `GridColumn.resizable`, resolved. Default `true`. */
  isResizable(columnKey: FieldKey): boolean;
  /** `GridColumn.movable`, resolved. Default `true`. */
  isMovable(columnKey: FieldKey): boolean;
  /** `--fg-column-min-width` off the container, fallback 40 — the same floor pattern `minGridWidth`
   *  applies to the pane splitter (#127), read live so a stylesheet change takes effect immediately. */
  minColumnWidthPx(): number;
  /** Live paint only, no event, no commit — mirrors `SplitterContext.previewGridWidth`. */
  previewColumnWidth(columnKey: FieldKey, widthPx: number): void;
  /** The one commit sequence, for a resize. Returns `false` when vetoed. */
  commitColumnWidth(columnKey: FieldKey, widthPx: number): ColumnGestureCommit;
  /** Escape, or a vetoed commit: drops the live resize paint and repaints the column's real geometry
   *  — a refused drag must leave nothing behind, so this does more than
   *  `previewColumnWidth(columnKey, startWidthPx)` would: that call still leaves the preview's
   *  `data-fixed`/inline-width override on the DOM node even when the column was flex-sized before
   *  the drag started. */
  cancelColumnResize(): void;
  /** Live paint only, no event, no commit — the grabbed header cell follows the pointer and the drop
   *  indicator marks the target edge. Never means "clear": every field of `ColumnReorderPreview`
   *  carries an on-screen meaning of its own (`beforeColumnKey: null` is "at the end", `offsetPx: 0`
   *  is "back at its own slot"), so clearing is `cancelColumnReorder`'s job. */
  previewColumnReorder(preview: ColumnReorderPreview): void;
  /** The one commit sequence, for a reorder. Returns `false` when vetoed. */
  commitColumnReorder(columnKey: FieldKey, beforeColumnKey: FieldKey | null): ColumnGestureCommit;
  /** Escape, or a vetoed commit: clears the drop indicator and parks the grabbed cell back
   *  on its own slot — a refused reorder must leave nothing behind, the same contract
   *  `cancelColumnResize` holds for a resize. */
  cancelColumnReorder(): void;
  /** A plain click (not a drag) on a header cell — or `undefined` for a click that missed every
   *  header cell. The container stays the one real tab stop until S5.11's roving pattern
   *  lands, so this is a JS-tracked "focused column" rather than a DOM focus move, the same way a bar
   *  click sets the *selection* without moving focus off the container. `CommandContext.target`
   *  (`Alt+Arrow`/`Shift+Arrow`) reads it. */
  setFocusedColumn(columnKey: FieldKey | undefined): void;
}
