// view/ — the core command catalog (S5.2, D-S5-6). Split out of GanttShell so the commands are
// reviewable as a table, not interleaved with shell construction. `GanttShell` is the
// only caller: it builds a `CoreCommandPorts` closing over its own private state and hands it here
// with its own `CommandRegistry` — this file never touches a shell field directly.

import type { EntryId, FieldKey } from '../model/index.js';
import { MutationCancelledError } from '../model/index.js';
import type { Command, CommandContext } from '../extensions/commands.js';

/** The shell verbs the core catalog calls — pan, zoom, select, collapse/expand. Undo/redo read
 *  `CommandContext.dataset` directly (D-S5-6 already gives every command that), so they need no
 *  port here. `GanttShell` builds one of these per registration pass, closing over its own private
 *  fields; nothing else may implement it. */
export interface CoreCommandPorts {
  collapseAll(): void;
  expandAll(): void;
  collapseRow(id: EntryId): void;
  expandRow(id: EntryId): void;
  canZoomIn(): boolean;
  canZoomOut(): boolean;
  zoomIn(): void;
  zoomOut(): void;
  panToToday(): void;
  selectAll(): void;
  clearSelection(): void;
  hasSelection(): boolean;
  keyboardPanEnabled(): boolean;
  nothingSelected(): boolean;
  /** #212, ADR 0010: moves the Selection to the next or previous Segment of the row it sits on. */
  selectNextSegment(): void;
  selectPreviousSegment(): void;
  pageDown(): void;
  pageUp(): void;
  panToStart(): void;
  panToEnd(): void;
  panRight(): void;
  panLeft(): void;
  panDown(): void;
  panUp(): void;
  /** S5.7, D-S5-18/D-S5-26. */
  isColumnResizable(key: FieldKey): boolean;
  isColumnMovable(key: FieldKey): boolean;
  resizeColumnStep(key: FieldKey, direction: 1 | -1): void;
  moveColumnStep(key: FieldKey, direction: 1 | -1): void;
}

/** D-S5-6: the twenty-one commands every consumer already has as a public method or default
 *  keybinding, named under the `freegantt.*` namespace. Registered before any plugin, so a plugin
 *  can override any of them (D-S5-7). Mechanical extraction from `GanttShell`'s old
 *  `#registerCoreCommands`/`#registerNavigationCommands` — ids, labels, and `when` clauses are
 *  unchanged; default keybindings still bind in `GanttShell` itself (a separate concern from the
 *  catalog). */
export function registerCoreCommands(
  registry: { register(command: Command<unknown>): void },
  ports: CoreCommandPorts,
): void {
  const asCtx = (ctx: unknown): CommandContext<unknown> => ctx as CommandContext<unknown>;
  const register = (command: Command<unknown>): void => registry.register(command);

  register({ id: 'freegantt.collapseAll', label: 'Collapse all', run: () => ports.collapseAll() });
  register({ id: 'freegantt.expandAll', label: 'Expand all', run: () => ports.expandAll() });
  register({
    id: 'freegantt.collapseRow',
    label: 'Collapse row',
    when: (ctx) => asCtx(ctx).entry !== undefined,
    run: (ctx) => {
      const entry = asCtx(ctx).entry;
      if (entry !== undefined) ports.collapseRow(entry.id);
    },
  });
  register({
    id: 'freegantt.expandRow',
    label: 'Expand row',
    when: (ctx) => asCtx(ctx).entry !== undefined,
    run: (ctx) => {
      const entry = asCtx(ctx).entry;
      if (entry !== undefined) ports.expandRow(entry.id);
    },
  });
  register({
    id: 'freegantt.zoomIn',
    label: 'Zoom in',
    when: () => ports.canZoomIn(),
    run: () => ports.zoomIn(),
  });
  register({
    id: 'freegantt.zoomOut',
    label: 'Zoom out',
    when: () => ports.canZoomOut(),
    run: () => ports.zoomOut(),
  });
  register({
    id: 'freegantt.panToToday',
    label: 'Pan to today',
    run: () => ports.panToToday(),
  });
  register({
    id: 'freegantt.selectAll',
    label: 'Select all',
    run: () => ports.selectAll(),
  });
  register({
    id: 'freegantt.clearSelection',
    label: 'Clear selection',
    when: () => ports.hasSelection(),
    run: () => ports.clearSelection(),
  });
  // #212, ADR 0010: the Selection holds Segments, so a row that draws several bars needs a keyboard
  // way to move between them. Both step within one row and clamp at its ends, so neither ever leaves
  // the row the user is on.
  register({
    id: 'freegantt.selectNextSegment',
    label: 'Select next segment',
    when: () => ports.hasSelection(),
    run: () => ports.selectNextSegment(),
  });
  register({
    id: 'freegantt.selectPreviousSegment',
    label: 'Select previous segment',
    when: () => ports.hasSelection(),
    run: () => ports.selectPreviousSegment(),
  });
  // #212, ADR 0010: the right-click menu and the `Delete` key run this one command. Both read
  // `ctx.target.segmentIds` and call `removeSegments` — a grid-row Delete needs no special case,
  // because removing an Entry's last Segment already removes the Entry, in the same transaction.
  // A `beforeChange` handler may refuse the removal. That refusal is a normal outcome, not a fault,
  // so it stops here instead of reaching `CommandRegistry.run` uncaught (the same swallow `api/`'s
  // `attemptMutation` does; `view/` cannot import `api/`, so this repeats that one line inline).
  register({
    id: 'freegantt.deleteSelection',
    label: 'Delete',
    when: (ctx) => (asCtx(ctx).target?.segmentIds?.length ?? 0) > 0,
    run: (ctx) => {
      const segmentIds = asCtx(ctx).target?.segmentIds;
      if (segmentIds === undefined || segmentIds.length === 0) return;
      try {
        asCtx(ctx).dataset?.entries.removeSegments(segmentIds);
      } catch (error) {
        if (!(error instanceof MutationCancelledError)) throw error;
      }
    },
  });
  // #160, D-S5-47: registered first and inert (`when` always declines), so a Gantt with no
  // `inlineEditing()` carries no editor code (D-S5-19). The plugin overrides this the moment it
  // installs (D-S5-7) — Q2/Q5's real `when`/`run`, closing over its own `CellEditing`.
  //
  // The registration alone is the point: `gantt.commands.run('freegantt.discardCellEdit')` answers
  // on every Gantt instead of throwing `UnknownCommandError`. `run` stays empty because a declining
  // `when` means the registry never calls it (#231 F3), so a port here would be one a reader traces
  // to nothing.
  register({
    id: 'freegantt.discardCellEdit',
    label: 'Discard edit',
    when: () => false,
    run: () => {},
  });
  register({
    id: 'freegantt.undo',
    label: 'Undo',
    when: (ctx) => asCtx(ctx).dataset?.canUndo === true,
    run: (ctx) => asCtx(ctx).dataset?.undo(),
  });
  register({
    id: 'freegantt.redo',
    label: 'Redo',
    when: (ctx) => asCtx(ctx).dataset?.canRedo === true,
    run: (ctx) => asCtx(ctx).dataset?.redo(),
  });

  register({
    id: 'freegantt.pageDown',
    label: 'Page down',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.pageDown(),
  });
  register({
    id: 'freegantt.pageUp',
    label: 'Page up',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.pageUp(),
  });
  register({
    id: 'freegantt.panToStart',
    label: 'Pan to start',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panToStart(),
  });
  register({
    id: 'freegantt.panToEnd',
    label: 'Pan to end',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panToEnd(),
  });
  // S5.11, D-S5-26: `nothingSelected()` used to gate these four, back when a bare arrow chord
  // panned only when nothing carried an edit focus (D-S3-13's shared-chord disambiguation).
  // `RovingFocus` now pairs a focused bar with a selection (Q-A11Y-3). That gate would then block
  // `Alt+Arrow`'s pan the moment any bar has focus. That is the opposite of a Gantt-wide fallback.
  // Pan and nudge sit on separate chords now, so the gate no longer disambiguates anything. This
  // drops it.
  register({
    id: 'freegantt.panRight',
    label: 'Pan right',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panRight(),
  });
  register({
    id: 'freegantt.panLeft',
    label: 'Pan left',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panLeft(),
  });
  register({
    id: 'freegantt.panDown',
    label: 'Pan down',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panDown(),
  });
  register({
    id: 'freegantt.panUp',
    label: 'Pan up',
    when: () => ports.keyboardPanEnabled(),
    run: () => ports.panUp(),
  });

  // S5.7, D-S5-18/D-S5-26: `Alt+Arrow` moves, `Shift+Arrow` resizes — both scoped to a focused
  // header cell (`ctx.target.kind === 'header'`) and gated on the same `resizable`/`movable` a
  // pointer drag already refuses (`interaction/column-gestures.ts`). Both run the same
  // `#commitColumnWidth`/`#commitColumnReorder` a pointer drag's commit runs.
  const focusedHeaderField = (ctx: unknown): FieldKey | undefined => {
    const target = asCtx(ctx).target;
    return target?.kind === 'header' ? target.field : undefined;
  };
  /** One shape for all four column chords: differ only in id/label, which capability gates them
   *  (`resizable` vs `movable`), and which step they run. */
  const registerColumnStepCommand = (
    id: string,
    label: string,
    capable: (key: FieldKey) => boolean,
    step: (key: FieldKey) => void,
  ): void => {
    register({
      id,
      label,
      when: (ctx) => {
        const key = focusedHeaderField(ctx);
        return key !== undefined && capable(key);
      },
      run: (ctx) => {
        const key = focusedHeaderField(ctx);
        if (key !== undefined) step(key);
      },
    });
  };
  registerColumnStepCommand(
    'freegantt.resizeColumnWider',
    'Widen column',
    (key) => ports.isColumnResizable(key),
    (key) => ports.resizeColumnStep(key, 1),
  );
  registerColumnStepCommand(
    'freegantt.resizeColumnNarrower',
    'Narrow column',
    (key) => ports.isColumnResizable(key),
    (key) => ports.resizeColumnStep(key, -1),
  );
  registerColumnStepCommand(
    'freegantt.moveColumnRight',
    'Move column right',
    (key) => ports.isColumnMovable(key),
    (key) => ports.moveColumnStep(key, 1),
  );
  registerColumnStepCommand(
    'freegantt.moveColumnLeft',
    'Move column left',
    (key) => ports.isColumnMovable(key),
    (key) => ports.moveColumnStep(key, -1),
  );
}
