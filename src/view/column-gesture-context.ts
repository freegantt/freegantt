// view/ — the seam `interaction/column-gestures.ts` drives and `GanttShell` implements (S5.7,
// D-S5-18). Same split as `entry-gesture-context.ts` (S3, D-S3-5): `interaction/` performs no
// arithmetic of its own — every commit, every floor clamp, every capability check runs behind this
// context, which `GanttShell` builds closing over its own private state.

import type { FieldKey } from '../model/index.js';

/** One resize or reorder gesture's outcome (S5.7, D-S5-18): `GanttShell` runs the one
 *  `beforeGridColumnsChange` → commit → `gridColumnsChange` sequence and reports whether it landed.
 *  `false` means a `before*` handler vetoed it — the caller (`interaction/column-gestures.ts`) is the
 *  one holding the pre-drag state to restore, since it captured the real on-screen width/order at
 *  drag start. */
export type ColumnGestureCommit = boolean;

/** What `interaction/column-gestures.ts`'s pointer sequences and `GanttShell`'s own keyboard chords
 *  (Alt+Arrow move, Shift+Arrow resize, D-S5-26) both run through — one place decides whether a
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
   *  — a refused drag must leave nothing behind (D-S5-18), so this does more than
   *  `previewColumnWidth(columnKey, startWidthPx)` would: that call still leaves the preview's
   *  `data-fixed`/inline-width override on the DOM node even when the column was flex-sized before
   *  the drag started. */
  cancelColumnResize(): void;
  /** Live paint only: `null` means "at the end" — everywhere else names the column this key would
   *  land before. Toggles `.fg-column-drop` on the target header cell. Never means "clear" — that is
   *  `cancelColumnReorder`'s job, since `null` already carries its own on-screen meaning. */
  previewColumnDrop(beforeColumnKey: FieldKey | null): void;
  /** The one commit sequence, for a reorder. Returns `false` when vetoed. */
  commitColumnReorder(columnKey: FieldKey, beforeColumnKey: FieldKey | null): ColumnGestureCommit;
  /** Escape, or a vetoed commit (D-S5-18): clears the live drop indicator entirely — a refused
   *  reorder must leave nothing behind, the same contract `cancelColumnResize` holds for a resize. */
  cancelColumnReorder(): void;
  /** A plain click (not a drag) on a header cell — or `undefined` for a click that missed every
   *  header cell. D-S1.10-5 keeps the container the one real tab stop until S5.11's roving pattern
   *  lands, so this is a JS-tracked "focused column" rather than a DOM focus move, the same way a bar
   *  click sets the *selection* without moving focus off the container. `CommandContext.target`
   *  (`Alt+Arrow`/`Shift+Arrow`, D-S5-26) reads it. */
  setFocusedColumn(columnKey: FieldKey | undefined): void;
}
