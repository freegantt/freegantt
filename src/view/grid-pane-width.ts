// view/ — the grid pane's width rules: the #127 floor, and the #139 ceiling over the resolved
// columns' own right edge. Also the #157 `'fitColumns'` standing instruction, which keeps the pane
// sitting on the columns' own edge across every rebind. Split out of `GanttShell` so the rules are
// reviewable and testable on their own. `GanttShell` is the only caller, closing over its own
// private state through `GridPaneWidthPorts` — the same way `column-chrome.ts` closes over
// `ColumnChromePorts` (S5.7, D-S5-18's precedent).

/** What `GridPaneWidth` calls back into `GanttShell` for: the pane's own stored width and floor
 *  (`PaneLayout`'s), and the resolved columns' own edge (`ColumnChrome`'s). Also the shared
 *  cancelable commit sequence every other Gantt-state change already goes through
 *  (`#proposeChange`). This module owns no DOM and no `PaneLayout` reference of its own. */
export interface GridPaneWidthPorts {
  /** `paneLayout.gridWidth`'s current value, in px. */
  readWidth(): number;
  /** `paneLayout.minGridWidth`'s current value, in px — the #127 floor. */
  readMinWidth(): number;
  /** Writes a new floor. Raising it above the current width is `GridPaneWidth`'s own job to react
   *  to, not this write's. */
  writeMinWidth(px: number): void;
  /** The last resolved column's right edge, in px — the #139 ceiling and the #157 `'fitColumns'`
   *  target are the same fact read for two purposes. `undefined` when a `flex` column names no
   *  edge (#139). */
  columnsEdge(): number | undefined;
  /** Runs `beforeGridWidthChange` → apply → `gridWidthChange` and applies/rolls back the pane's own
   *  width. Returns whether the change survived the veto. */
  commitWidth(px: number): boolean;
}

/** A number is px; `'fitColumns'` (#157) sits the pane on its columns' own edge and keeps it there
 *  across every later rebind. Re-exported by `gantt-shell.ts` so `GanttShellOptions.gridWidth` names
 *  one type, not two copies of it. */
export type GridWidth = number | 'fitColumns';

/** One instance per Gantt (I2), owned by `GanttShell` alongside other view state — never shared,
 *  never a module-level singleton. */
export class GridPaneWidth {
  readonly #ports: GridPaneWidthPorts;
  /** #157: `gridWidth = 'fitColumns'` is a standing instruction, not a one-off width, so this
   *  remembers it and re-measures on every rebind (`resizeToColumns`). `PaneLayout` holds the px it
   *  resolves to — it knows nothing about columns. */
  #fitsColumns: boolean;

  constructor(ports: GridPaneWidthPorts, fitsColumns: boolean) {
    this.#ports = ports;
    this.#fitsColumns = fitsColumns;
  }

  /** Always px: a consumer asking how wide the pane is gets the unit the question is about.
   *  `'fitColumns'` reads back as the width it resolved to. */
  get width(): number {
    return this.#ports.readWidth();
  }

  /** The #127 floor a splitter drag clamps `width` to. */
  get floor(): number {
    return this.#ports.readMinWidth();
  }

  /** The #139 ceiling a splitter drag clamps `width` to — `undefined` when the resolved columns
   *  name no edge (a `flex` column, #139). S5.11's splitter reads this for `aria-valuemax`, and
   *  falls back to the container's own outer bound when it is `undefined` (`splitter.ts`). */
  get ceiling(): number | undefined {
    return this.#columnsEdge();
  }

  /** `gantt.gridWidth = width`'s own rule. One write path, one place the veto lives (through
   *  `commitWidth`). #139 caps a px width at the columns' own edge — a width past the last column
   *  would only be dead space. `'fitColumns'` (#157) puts the pane exactly on that edge and keeps
   *  it there through every later rebind. Nothing floors either form — an explicit `width = 0`
   *  still collapses the pane on purpose (#127). */
  resize(width: GridWidth): void {
    this.#fitsColumns = width === 'fitColumns';
    this.#commit(
      width === 'fitColumns' ? (this.#columnsEdge() ?? this.#ports.readWidth()) : this.#ceiling(width),
    );
  }

  /** `gantt.minGridWidth = px`'s own rule. Raising the floor above the current `width` lifts it
   *  through the same cancelable commit sequence a splitter drag runs. So a veto leaves `width`
   *  exactly where it was. */
  setFloor(px: number): void {
    this.#ports.writeMinWidth(px);
    const lifted = this.#floor(this.#ports.readWidth());
    if (lifted !== this.#ports.readWidth()) this.#commit(lifted);
  }

  /** What a splitter drag may reach while it is live: the #127 floor under the #139 ceiling. The
   *  floor wins when the two disagree — a pane narrower than the floor is a collapsed pane, which
   *  is the accident #127 closed. Live paint only, no event, no commit — the caller writes the
   *  pane's width directly with this value. */
  previewDrag(px: number): number {
    return this.#withinSplitterBounds(px);
  }

  /** A completed drag is the consumer changing their mind, so a survived commit stops the pane
   *  following the columns (#157). A vetoed drag changes neither the width nor that tracking. */
  commitDrag(px: number): void {
    if (this.#commit(this.#withinSplitterBounds(px))) this.#fitsColumns = false;
  }

  /** The columns just moved — one is resized, one is hidden, a plugin registered one. So the pane
   *  answers to them again, through the same cancelable commit sequence a splitter drag runs. A
   *  pane already the right width is left alone, which is most rebinds.
   *
   *  `'fitColumns'` (#157) sits the pane *on* the columns' edge, in both directions. It widens with
   *  a widened set as readily as it comes in with a narrowed one. Any other width only gets the
   *  #139 ceiling — never wider than the columns, narrower whenever the consumer said so. A set
   *  holding a `flex` column names no edge, so neither form has anything to follow and the pane
   *  keeps the width it has. */
  resizeToColumns(): void {
    const current = this.#ports.readWidth();
    const target = this.#fitsColumns ? (this.#columnsEdge() ?? current) : this.#ceiling(current);
    if (target !== current) this.#commit(target);
  }

  /** The one place the #127 floor is applied. Nothing else consults it, so an explicit `width = 0`
   *  collapses the pane and a vetoed change rolls back to its own width. */
  #floor(px: number): number {
    return Math.max(this.#ports.readMinWidth(), px);
  }

  /** The #139 ceiling: the grid pane never sits wider than its own columns, whoever asked. Narrower
   *  is always legal — the columns then overflow and the pane scrolls to reach them (#126). A flex
   *  column names no edge, so a column set holding one has no ceiling at all. */
  #ceiling(px: number): number {
    const edge = this.#columnsEdge();
    return edge === undefined ? px : Math.min(edge, px);
  }

  #columnsEdge(): number | undefined {
    return this.#ports.columnsEdge();
  }

  #withinSplitterBounds(px: number): number {
    return this.#floor(this.#ceiling(px));
  }

  #commit(px: number): boolean {
    return this.#ports.commitWidth(px);
  }
}
