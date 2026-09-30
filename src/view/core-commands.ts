// view/ — the core command catalog (S5.2). Split out of GanttShell so the commands are
// reviewable as a table, not interleaved with shell construction. `GanttShell` is the
// only caller: it builds a `CoreCommandPorts` closing over its own private state and hands it here
// with its own `CommandRegistry` — this file never touches a shell field directly.

import type { EntryId, FieldKey } from '../model/index.js';
import { MutationCancelledError } from '../model/index.js';
import type { BuiltInCommandId, Command, CommandContext } from '../extensions/commands.js';

/** The shell verbs the core catalog calls — pan, zoom, select, collapse/expand. Undo/redo read
 *  `CommandContext.dataset` directly, so they need no
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
  /** #212, ADR 0010, ADR 0025: moves the Selection to the next or previous Entry of the row it
   *  sits on. */
  selectNextEntry(): void;
  selectPreviousEntry(): void;
  /** #434, I14: may the row, bar, or grid cell real focus sits on activate right now — independent
   *  of Selection, so a `{ select: false, activate: true }` row still answers `true` here even with
   *  an empty Selection. A grid cell answers `true` only once `inlineEditing()`'s own
   *  `freegantt.editFocusedCell` declines it (unwritable, or no editing feature installed). The
   *  `when` half of `freegantt.activateEntry`. */
  canActivateFocused(): boolean;
  /** #434: fires `entryActivate` (cause `'key'`) for the focused row/bar/cell's own Entry. A no-op
   *  if nothing focused answers `canActivateFocused()` — asked again rather than trusted from the
   *  `when` that gated this `run`, the same posture every command here takes. */
  activateFocused(): void;
  /** ADR 0012: may this Entry's own dates be cleared? A rolling-up parent's cannot — the Rollup
   *  writes them, not the user (ADR 0013) — so a Delete on its bar passes over it and the row
   *  stays, which is what `e2e/hierarchy.spec.ts` pins. A dateless Entry has nothing to clear and
   *  answers `false` too. */
  canClearDates(id: EntryId): boolean;
  /** ADR 0012: clears both dates of the Entry a bar draws. One transaction, undoable as one press,
   *  the same door a cell edit writes through. */
  clearDates(id: EntryId): void;
  /** Which of these Entries may a user not delete? A locked row is one, and so is a parent that
   *  holds a locked row. Empty means the whole Delete may go ahead. */
  refusedRemovals(ids: readonly EntryId[]): readonly EntryId[];
  /** Tells the app that a Delete removed nothing, and names the Entries that stopped it. */
  reportRemoveRefused(ids: readonly EntryId[]): void;
  pageDown(): void;
  pageUp(): void;
  panToStart(): void;
  panToEnd(): void;
  panRight(): void;
  panLeft(): void;
  panDown(): void;
  panUp(): void;
  /** S5.7. */
  isColumnResizable(key: FieldKey): boolean;
  isColumnMovable(key: FieldKey): boolean;
  resizeColumnStep(key: FieldKey, direction: 1 | -1): void;
  moveColumnStep(key: FieldKey, direction: 1 | -1): void;
}

/** Every command a consumer already has as a public method or default keybinding, named
 *  under the `freegantt.*` namespace. No bare count here — one went stale by six (#259) — the set
 *  this function registers is `BuiltInCommandId` in full. Every `register` below is typed against
 *  that union, so an id it does not name fails to compile, and `api/command.test.ts` catches the
 *  other direction (#333). Registered before any plugin, so a plugin can override any of them.
 *  Mechanical extraction from `GanttShell`'s old `#registerCoreCommands`/`#registerNavigationCommands`
 *  — ids, labels, and `when` clauses are unchanged; default keybindings still bind in `GanttShell`
 *  itself (a separate concern from the catalog). */
export function registerCoreCommands(
  registry: { register(command: Command<unknown>): void },
  ports: CoreCommandPorts,
): void {
  const asCtx = (ctx: unknown): CommandContext<unknown> => ctx as CommandContext<unknown>;
  /** #333: the registry takes the open `CommandId`, because a plugin registers its own ids through
   *  the same door. This catalog registers the built-in ones only, so it narrows the id here and a
   *  typo fails to compile. */
  const register = (command: Command<unknown> & { id: BuiltInCommandId }): void => registry.register(command);

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
  // #212, ADR 0010, ADR 0025: a row that draws several bars needs a keyboard way to move the
  // Selection between them. Both step within one row and clamp at its ends, so neither ever leaves
  // the row the user is on.
  register({
    id: 'freegantt.selectNextEntry',
    label: 'Select next entry',
    when: () => ports.hasSelection(),
    run: () => ports.selectNextEntry(),
  });
  register({
    id: 'freegantt.selectPreviousEntry',
    label: 'Select previous entry',
    when: () => ports.hasSelection(),
    run: () => ports.selectPreviousEntry(),
  });
  // #434: registered before any plugin (newest-first order), so `inlineEditing()`'s own
  // `Enter` binding — bound to its own `when`-gated command, not a raw handler — gets first refusal
  // on a focused cell and falls through to this one everywhere else: a focused row or bar, or a
  // focused cell that refuses the editor. `entryActivate`'s own doc names the cause `'key'`.
  register({
    id: 'freegantt.activateEntry',
    label: 'Activate entry',
    when: () => ports.canActivateFocused(),
    run: () => ports.activateFocused(),
  });
  // #212, ADR 0010, ADR 0025: the right-click menu and the `Delete` key run this one command, and
  // every target kind names the Entries it acts on in `entryIds` — ADR 0025 retired the second id
  // set a `'bar'` target used to carry.
  //
  // What the two target kinds *mean* stays apart, and ADR 0012 is where that is written: "Keyboard
  // Delete on a bar un-dates both dates ... `entries.remove(id)` deletes the row ... Two intents."
  // A bar is a drawing of a span, so deleting it clears the span and leaves the record; a grid row
  // or cell names the record itself, so deleting it removes the record. ADR 0026 changed what a bar
  // *is*, not which of the two doors a Delete opens — a segment bar un-dates the child Entry
  // it draws, exactly as a Segment delete used to drop one drawn stretch.
  //
  // A row Delete is all or nothing. One refused row stops the whole Delete, and it makes one report.
  // The removals share one transaction, so one Delete is one undo step.
  //
  // A `beforeChange` handler may refuse the removal. That refusal is a normal outcome, not a fault,
  // so it stops here instead of reaching `CommandRegistry.run` uncaught (the same swallow `api/`'s
  // `attemptMutation` does; `view/` cannot import `api/`, so this repeats that one line inline).
  register({
    id: 'freegantt.deleteSelection',
    label: 'Delete',
    when: (ctx) => (asCtx(ctx).target?.entryIds?.length ?? 0) > 0,
    run: (ctx) => {
      const target = asCtx(ctx).target;
      if (target === undefined) return;
      const ids = target.entryIds ?? [];
      if (target.kind !== 'bar') {
        const refused = ports.refusedRemovals(ids);
        if (refused.length > 0) {
          ports.reportRemoveRefused(refused);
          return;
        }
      }
      try {
        asCtx(ctx).dataset?.transaction(() => {
          for (const id of ids) {
            if (target.kind === 'bar') {
              // A bar whose dates are derived has none of its own to clear (ADR 0013). The command
              // passes over it rather than throwing `DerivedFieldNotWritableError` out of a keypress.
              if (ports.canClearDates(id)) ports.clearDates(id);
            } else if (asCtx(ctx).dataset?.entries.has(id) === true) {
              // A parent's removal already took a selected child, so that child is gone by now.
              asCtx(ctx).dataset?.entries.remove(id);
            }
          }
        });
      } catch (error) {
        if (!(error instanceof MutationCancelledError)) throw error;
      }
    },
  });
  // #160: registered first and inert (`when` always declines), so a Gantt with no
  // `inlineEditing()` carries no editor code. The plugin overrides this the moment it
  // installs, with its own real `when`/`run`, closing over its own `CellEditing`.
  //
  // The registration alone is the point: `gantt.commands.run('freegantt.discardCellEdit')` answers
  // on every Gantt instead of throwing `UnknownCommandError`. `run` stays empty because a declining
  // `when` means the registry never calls it (#231), so a port here would be one a reader traces
  // to nothing.
  register({
    id: 'freegantt.discardCellEdit',
    label: 'Discard edit',
    when: () => false,
    run: () => {},
  });
  // #434: the same #160 shape as `freegantt.discardCellEdit` just above — registered first
  // and inert, so `gantt.commands.run('freegantt.editFocusedCell')` answers on every Gantt, and
  // `Enter`'s own `freegantt.activateEntry` fallback (bound below) has a real `when` to ask "did the
  // editor take this cell?" even with no `inlineEditing()` installed. `inlineEditing()` overrides this
  // the moment it installs, with its own `when`/`run` closing over its `CellEditing`.
  register({
    id: 'freegantt.editFocusedCell',
    label: 'Edit cell',
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
  // S5.11: `nothingSelected()` used to gate these four, back when a bare arrow chord
  // panned only when nothing carried an edit focus.
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

  // S5.7: `Alt+Arrow` moves, `Shift+Arrow` resizes — both scoped to a focused
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
    id: BuiltInCommandId,
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
