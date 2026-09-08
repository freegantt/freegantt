// view/ — roving focus, one tab stop per pane (S5.11, D-S5-25/D-S5-26/D-S5-39). The grid pane is a
// treegrid: its arrows move focus, never act (its Row/cell nodes are what carry the roving
// `tabindex`). The timeline pane is a labelled region of focusable bars: its arrows act. This
// module only decides *which* bar that action lands on. The nudge/resize themselves stay
// `interaction/keyboard-editing.ts`'s job (D-GH-1), now scoped to this pane.
//
// Named `roving-focus.ts`, not `keyboard-navigation.ts` — that name is S3.7's dead pan attachment,
// kept with no production caller (§0.5 of the S5.11 plan). Two different jobs get two different
// names; the old file is a separate tidying call.
//
// Restore-by-key, not by node. A virtualized row's node comes and goes as the window scrolls; the
// row it stands for does not. So this module remembers "row `r7`, column `budget`" or "bar for
// item `e3:1`", not an `HTMLElement`. It re-resolves the element fresh after every frame, the same
// reason `ContainerDom` never keys off node identity either (I8). A row or bar that no longer
// exists (filtered away, collapsed away) falls back to its nearest surviving neighbour.
//
// Focusing a bar picks it; focusing a grid row clears the pick (Q-A11Y-3). `SegmentSelection`
// already answers "which Segments does this bar/row stand for" (`selectableSegmentsOf`) — this
// module only decides when to ask, never re-derives the answer.

import {
  BAR_CLASS,
  COLUMN_HEADER_CLASS,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_ID_ATTRIBUTE,
  ROW_LABEL_CLASS,
} from '../render/dom/dom-contract.js';
import { cssEscapeAttr } from '../render/dom/css-escape.js';
import { entryIdOfItem, itemIdFromDataset, rowIdFromDataset, segmentIdFromDataset } from '../model/index.js';
import type { EntryId, FieldKey, ItemId, RowId, SegmentId } from '../model/index.js';
import type { EntryHit } from './entry-gesture-context.js';
import type { Panes } from './pane-layout.js';

/** The `PlannedRow` fields this module reads — the same narrowing `TreeCollapseRow` takes on
 *  `tree-collapse.ts`. A grouping header row carries no `EntryId` and is never `expandable`, so
 *  `ArrowRight`/`ArrowLeft` on one already fall through to "no move" with no extra check. */
export interface RovingFocusRow {
  readonly id: RowId;
  readonly entryIds: readonly EntryId[];
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/** `GanttShell`'s one seam back for this module (mirrors `TreeCollapseContext`'s shape). Every
 *  member is a closure or a snapshot read, so this module never holds a stale collaborator. */
export interface RovingFocusPorts {
  /** The current frame's rows, in row order — the same list `TreeCollapse` and `SegmentSelection`
   *  already read. */
  plannedRows(): readonly RovingFocusRow[];
  /** Grid columns, in paint order — index 0 is the row-label column. */
  columnKeys(): readonly FieldKey[];
  rowIdForEntry(id: EntryId): RowId | undefined;
  /** How many rows one `PageDown`/`PageUp` moves — the visible row count, floored to at least one.
   *  §0.5's disclosed approximation: a viewport half a row short of the next one still counts. */
  rowsPerPage(): number;
  collapseRow(id: RowId): void;
  expandRow(id: RowId): void;
  /** Q-A11Y-3: focusing a bar or a grid row proposes the Segments that focus stands for — the same
   *  `SegmentSelection.selectableSegmentsOf` a pointer hit already asks. */
  selectOnFocus(hit: EntryHit): void;
  /** `ColumnChrome`'s own "which header cell is focused" — the same fact
   *  `Shift+ArrowLeft`/`Alt+ArrowLeft` already gate on (S5.7, D-S5-18). Keyboard-stepping into or
   *  off a header cell is one more writer of that fact, not a second one. */
  setFocusedColumn(field: FieldKey | undefined): void;
  /** Scrolls row `index` into the timeline pane's visible window and renders synchronously, so the
   *  row's node exists to focus the instant this call returns. `index` (not `id`): a caller already
   *  has it, off `plannedRows()`'s own order. */
  revealRow(index: number): void;
  /** Scrolls the given Entry or Segment's own span into view (both axes) and renders
   *  synchronously — the timeline pane's own row-reveal, plus the time axis. A focused bar passes
   *  its own Segment's id, not the owning Entry's. An Entry's full span can run wider than the one
   *  Segment the bar draws. Revealing the whole Entry would pan away from a Segment already on
   *  screen. */
  revealEntry(id: EntryId | SegmentId): void;
}

type GridFocus = { pane: 'header'; field: FieldKey } | { pane: 'row'; rowId: RowId; field?: FieldKey };

/** One roving-focus controller per Gantt (I2: no shared state between two instances). Constructed
 *  once `Panes` exist. `syncAfterRender()` then runs after every render, so a recycled node gets
 *  its `tabindex` back, and a vanished one hands focus to its neighbour (I8). */
export class RovingFocus {
  readonly #panes: Panes;
  readonly #ports: RovingFocusPorts;
  #gridFocus: GridFocus | undefined;
  #timelineFocus: ItemId | undefined;
  // `interaction/entry-gestures.ts` already owns selection for a pointer gesture. A bar click, a
  // row click, and a drag that keeps a multi-select all decide selection on their own pointerup
  // (D-S3-19). The pointerdown that starts one of those also moves real focus as its default
  // action. `#handleGridFocusIn`/`#handleTimelineFocusIn` would otherwise re-propose a narrower
  // selection right on top of it. This flag tells them to skip that proposal for a pointer-caused
  // arrival, and still run it for a keyboard or programmatic one.
  #focusFromPointer = false;
  readonly #onGridKeyDown = (event: KeyboardEvent): void => this.#handleGridKeyDown(event);
  readonly #onHeaderKeyDown = (event: KeyboardEvent): void => this.#handleHeaderKeyDown(event);
  readonly #onTimelineKeyDown = (event: KeyboardEvent): void => this.#handleTimelineKeyDown(event);
  readonly #onGridFocusIn = (event: FocusEvent): void => this.#handleGridFocusIn(event);
  readonly #onTimelineFocusIn = (event: FocusEvent): void => this.#handleTimelineFocusIn(event);
  readonly #onPointerDown = (): void => {
    this.#focusFromPointer = true;
  };

  constructor(panes: Panes, ports: RovingFocusPorts) {
    this.#panes = panes;
    this.#ports = ports;
    this.#panes.rows.addEventListener('keydown', this.#onGridKeyDown);
    this.#panes.gridHeader.addEventListener('keydown', this.#onHeaderKeyDown);
    this.#panes.timeline.addEventListener('keydown', this.#onTimelineKeyDown);
    // The WAI-ARIA APG roving-tabindex pattern: a click or a Tab can move real focus without going
    // through `#handleGridKeyDown`/`#handleTimelineKeyDown` at all. `focusin` bubbles, unlike
    // `focus`, so one listener per pane catches every arrival, whatever the path (#0.5, S5.11).
    this.#panes.rows.addEventListener('focusin', this.#onGridFocusIn);
    this.#panes.gridHeader.addEventListener('focusin', this.#onGridFocusIn);
    this.#panes.timeline.addEventListener('focusin', this.#onTimelineFocusIn);
    // `#focusFromPointer`'s own source: a pointerdown always precedes the focus it causes. Both
    // fire in the same synchronous dispatch, so setting it here always beats the `focusin` after.
    this.#panes.rows.addEventListener('pointerdown', this.#onPointerDown);
    this.#panes.gridHeader.addEventListener('pointerdown', this.#onPointerDown);
    this.#panes.timeline.addEventListener('pointerdown', this.#onPointerDown);
  }

  detach(): void {
    this.#panes.rows.removeEventListener('keydown', this.#onGridKeyDown);
    this.#panes.gridHeader.removeEventListener('keydown', this.#onHeaderKeyDown);
    this.#panes.timeline.removeEventListener('keydown', this.#onTimelineKeyDown);
    this.#panes.rows.removeEventListener('focusin', this.#onGridFocusIn);
    this.#panes.gridHeader.removeEventListener('focusin', this.#onGridFocusIn);
    this.#panes.timeline.removeEventListener('focusin', this.#onTimelineFocusIn);
    this.#panes.rows.removeEventListener('pointerdown', this.#onPointerDown);
    this.#panes.gridHeader.removeEventListener('pointerdown', this.#onPointerDown);
    this.#panes.timeline.removeEventListener('pointerdown', this.#onPointerDown);
  }

  /** The node real DOM focus currently sits on, if it is one this module manages. This is what
   *  `GanttShell#buildCommandContext` reads to fill `CommandTarget` for a chord (D-S5-39). The
   *  splitter is a sibling of the two panes, not a descendant of either (`pane-layout.ts`), so it
   *  gets its own equality check rather than falling out of a `contains()` call like a row or a
   *  bar does. */
  focusedElement(): HTMLElement | undefined {
    const doc = this.#panes.rows.ownerDocument;
    const active = doc.activeElement;
    if (!(active instanceof HTMLElement)) return undefined;
    if (active === this.#panes.splitter) return active;
    if (this.#panes.rows.contains(active) || this.#panes.gridHeader.contains(active)) return active;
    if (this.#panes.timeline.contains(active)) return active;
    return undefined;
  }

  /** Called once per render, after the backend has synced the DOM to the new frame. Reassigns
   *  `tabindex` so exactly one node per pane carries `0`. Refocuses the remembered row or bar too,
   *  if real focus was on the node this frame just recycled or dropped (I8). */
  syncAfterRender(): void {
    this.#syncGridTabIndex();
    this.#syncTimelineTabIndex();
  }

  // ---- grid pane: header cells --------------------------------------------------------------

  #headerCells(): readonly HTMLElement[] {
    return Array.from(this.#panes.gridHeader.querySelectorAll<HTMLElement>(`.${COLUMN_HEADER_CLASS}`));
  }

  #handleHeaderKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const cells = this.#headerCells();
    if (cells.length === 0) return;
    const currentField = this.#gridFocus?.pane === 'header' ? this.#gridFocus.field : undefined;
    const index = cells.findIndex((cell) => cell.dataset['field'] === currentField);

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = index + (event.key === 'ArrowRight' ? 1 : -1);
      if (next < 0 || next >= cells.length) return;
      event.preventDefault();
      this.#focusHeaderCell(cells[next]!);
      return;
    }
    if (event.key === 'ArrowDown') {
      const rows = this.#ports.plannedRows();
      const first = rows[0];
      if (first === undefined) return;
      event.preventDefault();
      this.#focusGridRow(first.id, currentField);
    }
  }

  #focusHeaderCell(cell: HTMLElement): void {
    const field = cell.dataset['field'] as FieldKey | undefined;
    this.#gridFocus = field !== undefined ? { pane: 'header', field } : undefined;
    this.#ports.setFocusedColumn(field);
    this.#applyGridTabIndex();
    cell.focus();
  }

  // ---- grid pane: rows and cells ------------------------------------------------------------

  #handleGridKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const rows = this.#ports.plannedRows();
    if (rows.length === 0) return;
    const focus = this.#gridFocus?.pane === 'row' ? this.#gridFocus : undefined;
    const rowIndex = focus === undefined ? -1 : rows.findIndex((row) => row.id === focus.rowId);
    const row = rowIndex >= 0 ? rows[rowIndex] : rows[0];
    if (row === undefined) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const next = clamp(
          (rowIndex < 0 ? 0 : rowIndex) + (event.key === 'ArrowDown' ? 1 : -1),
          0,
          rows.length - 1,
        );
        event.preventDefault();
        this.#gotoRow(rows, next, focus?.field);
        return;
      }
      case 'Home':
        event.preventDefault();
        this.#gotoRow(rows, 0, focus?.field);
        return;
      case 'End':
        event.preventDefault();
        this.#gotoRow(rows, rows.length - 1, focus?.field);
        return;
      case 'PageDown':
      case 'PageUp': {
        const step = Math.max(1, this.#ports.rowsPerPage()) * (event.key === 'PageDown' ? 1 : -1);
        const next = clamp((rowIndex < 0 ? 0 : rowIndex) + step, 0, rows.length - 1);
        event.preventDefault();
        this.#gotoRow(rows, next, focus?.field);
        return;
      }
      case 'ArrowRight':
        event.preventDefault();
        this.#onHorizontal(row, rows, rowIndex, 1, focus?.field);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.#onHorizontal(row, rows, rowIndex, -1, focus?.field);
        return;
      case ' ':
        if (event.shiftKey) {
          event.preventDefault();
          this.#selectRow(row);
        }
        return;
      default:
        return;
    }
  }

  /** `ArrowRight`/`ArrowLeft`, on either a row or a cell (D-S5-26's grid-pane table). Going right,
   *  a row expands or steps into its first cell; going left, it collapses or stays put. A cell
   *  steps to its neighbour, clamped, and a cell 0 `ArrowLeft` steps back out to the row. */
  #onHorizontal(
    row: RovingFocusRow,
    rows: readonly RovingFocusRow[],
    rowIndex: number,
    direction: 1 | -1,
    field: FieldKey | undefined,
  ): void {
    const columns = this.#ports.columnKeys();
    if (field === undefined) {
      if (direction === 1) {
        if (row.expandable && !row.expanded) {
          this.#ports.expandRow(row.id);
          this.#applyGridTabIndex();
          return;
        }
        const first = columns[0];
        if (first !== undefined) this.#gotoRow(rows, rowIndex < 0 ? 0 : rowIndex, first);
        return;
      }
      if (row.expandable && row.expanded) this.#ports.collapseRow(row.id);
      // Collapsed already, or a leaf: no move (the pattern's own rule, D-S5-26).
      this.#applyGridTabIndex();
      return;
    }
    const columnIndex = columns.indexOf(field);
    const nextIndex = columnIndex + direction;
    if (nextIndex < 0) {
      this.#gotoRow(rows, rowIndex < 0 ? 0 : rowIndex, undefined);
      return;
    }
    const nextField = columns[nextIndex];
    if (nextField === undefined) return; // last cell: no move
    this.#gotoRow(rows, rowIndex < 0 ? 0 : rowIndex, nextField);
  }

  #gotoRow(rows: readonly RovingFocusRow[], index: number, field: FieldKey | undefined): void {
    const row = rows[index];
    if (row === undefined) return;
    this.#focusGridRow(row.id, field, index);
  }

  #focusGridRow(rowId: RowId, field: FieldKey | undefined, knownIndex?: number): void {
    this.#gridFocus = field !== undefined ? { pane: 'row', rowId, field } : { pane: 'row', rowId };
    this.#ports.setFocusedColumn(undefined);
    const rows = this.#ports.plannedRows();
    const index = knownIndex ?? rows.findIndex((row) => row.id === rowId);
    if (index >= 0) this.#ports.revealRow(index);
    const entryId = this.#firstEntryOf(rows, rowId);
    if (entryId !== undefined) this.#ports.selectOnFocus({ kind: 'row', rowId });
    this.#applyGridTabIndex();
    const element = this.#gridRowElement(rowId, field);
    element?.focus();
  }

  #firstEntryOf(rows: readonly RovingFocusRow[], rowId: RowId): EntryId | undefined {
    return rows.find((row) => row.id === rowId)?.entryIds[0];
  }

  #selectRow(row: RovingFocusRow): void {
    this.#ports.selectOnFocus({ kind: 'row', rowId: row.id });
  }

  /** The `GridFocus` a bare DOM node stands for — a header cell's `data-field`, or a row's
   *  `data-row-id`. When the node is one of the row's own cells, this also reads that cell's
   *  `data-field`. `undefined` for a node this module does not recognise (an empty pane's own
   *  fallback stop). */
  #focusOf(node: HTMLElement): GridFocus | undefined {
    if (node.classList.contains(COLUMN_HEADER_CLASS)) {
      const field = node.dataset['field'] as FieldKey | undefined;
      return field === undefined ? undefined : { pane: 'header', field };
    }
    const row = node.closest<HTMLElement>(`.${ROW_CLASS}`);
    const rowId = rowIdFromDataset(row?.dataset['rowId']);
    if (rowId === undefined) return undefined;
    const field = node.dataset['field'] as FieldKey | undefined;
    return field === undefined ? { pane: 'row', rowId } : { pane: 'row', rowId, field };
  }

  /** A click or a Tab can land real focus on a header cell or a row without ever reaching
   *  `#handleGridKeyDown`/`#handleHeaderKeyDown`. This keeps `#gridFocus` true for that arrival
   *  too — and with it, the column-focus and row-pick facts `#gridFocus` drives. Not only for a
   *  focus this module moved itself: `#focusGridRow`/`#focusHeaderCell` already fire this same
   *  event on `.focus()`. The equality check below skips redoing their work. */
  #handleGridFocusIn(event: FocusEvent): void {
    const fromPointer = this.#focusFromPointer;
    this.#focusFromPointer = false;
    if (!(event.target instanceof HTMLElement)) return;
    const focus = this.#focusOf(event.target);
    if (focus === undefined || this.#sameGridFocus(focus, this.#gridFocus)) return;
    this.#gridFocus = focus;
    if (focus.pane === 'header') {
      this.#ports.setFocusedColumn(focus.field);
      return;
    }
    this.#ports.setFocusedColumn(undefined);
    // A pointer gesture on this same row already proposed its own selection on pointerup
    // (`interaction/entry-gestures.ts`, D-S3-19). A row click selects every Segment the row owns.
    // A drag that grabs an already-selected bar keeps that selection through the drag.
    // Re-proposing here from focus alone would narrow either one back down.
    if (fromPointer) return;
    if (this.#firstEntryOf(this.#ports.plannedRows(), focus.rowId) !== undefined) {
      this.#ports.selectOnFocus({ kind: 'row', rowId: focus.rowId });
    }
  }

  #sameGridFocus(a: GridFocus, b: GridFocus | undefined): boolean {
    if (b === undefined || a.pane !== b.pane) return false;
    return a.pane === 'header' && b.pane === 'header'
      ? a.field === b.field
      : a.pane === 'row' && b.pane === 'row' && a.rowId === b.rowId && a.field === b.field;
  }

  #gridRowElement(rowId: RowId, field: FieldKey | undefined): HTMLElement | undefined {
    const row = this.#panes.rows.querySelector<HTMLElement>(
      `.${ROW_CLASS}[${ROW_ID_ATTRIBUTE}="${cssEscapeAttr(rowId)}"]`,
    );
    if (row === null) return undefined;
    if (field === undefined) return row;
    return (
      row.querySelector<HTMLElement>(
        `.${ROW_LABEL_CLASS}[data-field="${cssEscapeAttr(field)}"], .${ROW_CELL_CLASS}[data-field="${cssEscapeAttr(field)}"]`,
      ) ?? row
    );
  }

  /** One sweep per render, bounded by the windowed row count, not the dataset (I3). Every row and
   *  cell node in the current frame gets `tabindex="-1"`, and the one the remembered focus names
   *  gets `0`. A vanished remembered row falls back to its nearest surviving neighbour, and moves
   *  real focus there too, if real focus was on it (I8). */
  #syncGridTabIndex(): void {
    const rowElements = Array.from(this.#panes.rows.querySelectorAll<HTMLElement>(`.${ROW_CLASS}`));
    const headerCells = this.#headerCells();
    for (const row of rowElements) {
      row.tabIndex = -1;
      for (const cell of Array.from(
        row.querySelectorAll<HTMLElement>(`.${ROW_LABEL_CLASS}, .${ROW_CELL_CLASS}`),
      )) {
        cell.tabIndex = -1;
      }
    }
    for (const cell of headerCells) cell.tabIndex = -1;
    this.#panes.grid.tabIndex = rowElements.length === 0 && headerCells.length === 0 ? 0 : -1;
    this.#applyGridTabIndex(rowElements, headerCells);
  }

  #applyGridTabIndex(
    rowElements = Array.from(this.#panes.rows.querySelectorAll<HTMLElement>(`.${ROW_CLASS}`)),
    headerCells = this.#headerCells(),
  ): void {
    const hadRealFocus = this.focusedElement() !== undefined || document.activeElement === this.#panes.grid;
    const focus = this.#gridFocus;
    let target: HTMLElement | undefined;
    if (focus?.pane === 'header') {
      target = headerCells.find((cell) => cell.dataset['field'] === focus.field);
    } else if (focus?.pane === 'row') {
      const rowElement = rowElements.find((row) => row.dataset['rowId'] === focus.rowId);
      target =
        rowElement === undefined
          ? undefined
          : focus.field === undefined
            ? rowElement
            : (rowElement.querySelector<HTMLElement>(`[data-field="${cssEscapeAttr(focus.field)}"]`) ??
              rowElement);
    }
    if (target === undefined) {
      target = rowElements[0] ?? headerCells[0];
      this.#gridFocus = target === undefined ? undefined : this.#focusOf(target);
    }
    if (target !== undefined) {
      target.tabIndex = 0;
      if (hadRealFocus && this.focusedElement() === undefined) target.focus();
    }
  }

  // ---- timeline pane: bars -------------------------------------------------------------------

  #barElements(): readonly HTMLElement[] {
    return Array.from(this.#panes.timeline.querySelectorAll<HTMLElement>(`.${BAR_CLASS}`));
  }

  #handleTimelineKeyDown(event: KeyboardEvent): void {
    // Plain and Shift+Arrow nudge/resize, and Mod+Arrow segment-stepping, are
    // `interaction/keyboard-editing.ts`'s and the keymap's jobs — both listen on this same pane.
    // This handler only ever moves *which* bar is focused.
    if (event.ctrlKey || event.metaKey) return;
    const bars = this.#barElements();
    if (bars.length === 0) return;
    const current = this.#timelineFocus;
    const currentIndex =
      current === undefined ? -1 : bars.findIndex((bar) => bar.dataset['itemId'] === current);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const target = this.#nearestBarInAdjacentRow(bars, currentIndex, event.key === 'ArrowDown' ? 1 : -1);
      if (target === undefined) return;
      event.preventDefault();
      this.#focusBar(target);
      return;
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.shiftKey && !event.altKey) {
      // Nudge, not navigation — `keyboard-editing.ts` handles it. Nothing to do here.
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      const rowBars = this.#barsInSameRow(bars, currentIndex);
      const target = event.key === 'Home' ? rowBars[0] : rowBars[rowBars.length - 1];
      if (target === undefined) return;
      event.preventDefault();
      this.#focusBar(target);
      return;
    }
    if (event.key === ' ' && !event.shiftKey) {
      if (current === undefined) return;
      event.preventDefault();
      this.#ports.selectOnFocus({ kind: 'bar', itemId: current });
    }
  }

  #barsInSameRow(bars: readonly HTMLElement[], index: number): readonly HTMLElement[] {
    const anchor = bars[index];
    if (anchor === undefined) return bars.length > 0 ? [bars[0]!] : [];
    const rowId = this.#rowIdOfBar(anchor);
    return bars.filter((bar) => this.#rowIdOfBar(bar) === rowId);
  }

  #rowIdOfBar(bar: HTMLElement): RowId | undefined {
    const itemIdAttr = bar.dataset['itemId'];
    const id = itemIdFromDataset(itemIdAttr);
    if (id === undefined) return undefined;
    return this.#ports.rowIdForEntry(entryIdOfItem(id));
  }

  /** The nearest bar one row up or down from the current one, skipping rows that draw no bar at all
   *  (D-S5-26's timeline table). Rows are already in row order (`plannedRows`'s own contract), so a
   *  linear scan off the current bar's row is enough — no second geometry pass. */
  #nearestBarInAdjacentRow(
    bars: readonly HTMLElement[],
    index: number,
    direction: 1 | -1,
  ): HTMLElement | undefined {
    const rows = this.#ports.plannedRows();
    const anchor = bars[index];
    const anchorRowId = anchor === undefined ? undefined : this.#rowIdOfBar(anchor);
    let rowIndex = anchorRowId === undefined ? -1 : rows.findIndex((row) => row.id === anchorRowId);
    if (rowIndex < 0) rowIndex = direction === 1 ? -1 : rows.length;
    for (let next = rowIndex + direction; next >= 0 && next < rows.length; next += direction) {
      const candidateRow = rows[next]!;
      const bar = bars.find((candidate) => this.#rowIdOfBar(candidate) === candidateRow.id);
      if (bar !== undefined) return bar;
    }
    return undefined;
  }

  /** The reveal target for a focused bar: the Segment it draws, when it draws one. That keeps a
   *  discontiguous Entry's other Segments from pulling the pan wider than the one bar on screen.
   *  A bar with no Segment (a group, a milestone, a plugin's own kind) has only its Entry to name. */
  #revealTargetOfBar(bar: HTMLElement): EntryId | SegmentId {
    const id = itemIdFromDataset(bar.dataset['itemId'])!;
    return segmentIdFromDataset(bar.dataset['segmentId']) ?? entryIdOfItem(id);
  }

  #focusBar(bar: HTMLElement): void {
    const id = itemIdFromDataset(bar.dataset['itemId']);
    if (id === undefined) return;
    this.#timelineFocus = id;
    this.#ports.selectOnFocus({ kind: 'bar', itemId: id });
    this.#ports.revealEntry(this.#revealTargetOfBar(bar));
    this.#applyTimelineTabIndex();
    this.#barElements()
      .find((candidate) => candidate.dataset['itemId'] === id)
      ?.focus();
  }

  /** A click or a Tab can land real focus on a bar without `#handleTimelineKeyDown` ever running.
   *  Same reasoning as `#handleGridFocusIn`: this keeps `#timelineFocus` — and the pick it drives —
   *  true for that arrival too. The id-equality check skips redoing `#focusBar`'s own work when
   *  this fires from its `.focus()` call. */
  #handleTimelineFocusIn(event: FocusEvent): void {
    const fromPointer = this.#focusFromPointer;
    this.#focusFromPointer = false;
    if (!(event.target instanceof HTMLElement)) return;
    const id = itemIdFromDataset(event.target.dataset['itemId']);
    if (id === undefined || id === this.#timelineFocus) return;
    this.#timelineFocus = id;
    // Same reasoning as `#handleGridFocusIn`: a pointer gesture on this bar already proposed its
    // own selection on pointerdown/pointerup. A drag that grabs an already-selected bar keeps the
    // whole selection through the drag (D-S3-19) — this must not narrow it back down.
    if (fromPointer) return;
    this.#ports.selectOnFocus({ kind: 'bar', itemId: id });
    // `revealEntry` scrolls and renders synchronously (its own doc comment) — right for a keyboard
    // arrival, which can land on a bar off screen. A pointer arrival never needs it: the user just
    // clicked this bar, so it is already visible, and `entry-gestures.ts`'s own drag start runs in
    // this same pointerdown. A synchronous render right then reflows mid-gesture and breaks the
    // drag's own geometry read (regression found this slice, e2e/plugins.spec.ts's locked-Entry
    // drag test).
    this.#ports.revealEntry(this.#revealTargetOfBar(event.target));
  }

  #syncTimelineTabIndex(): void {
    const bars = this.#barElements();
    for (const bar of bars) bar.tabIndex = -1;
    this.#panes.timeline.tabIndex = bars.length === 0 ? 0 : -1;
    this.#applyTimelineTabIndex(bars);
  }

  #applyTimelineTabIndex(bars = this.#barElements()): void {
    const hadRealFocus =
      this.focusedElement() !== undefined || document.activeElement === this.#panes.timeline;
    let target = bars.find((bar) => bar.dataset['itemId'] === this.#timelineFocus);
    if (target === undefined) {
      target = bars[0];
      this.#timelineFocus = target === undefined ? undefined : itemIdFromDataset(target.dataset['itemId']);
    }
    if (target !== undefined) {
      target.tabIndex = 0;
      if (hadRealFocus && this.focusedElement() === undefined) target.focus();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
