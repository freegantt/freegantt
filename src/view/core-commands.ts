// view/ — the core command catalog (S5.2, D-S5-6). Split out of GanttShell so the nineteen
// commands are reviewable as a table, not interleaved with shell construction. `GanttShell` is the
// only caller: it builds a `CoreCommandPorts` closing over its own private state and hands it here
// with its own `CommandRegistry` — this file never touches a shell field directly.

import type { EntryId, FieldKey } from '../model/index.js';
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

/** D-S5-6: the nineteen commands every consumer already has as a public method or default
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
  register({
    id: 'freegantt.panRight',
    label: 'Pan right',
    when: () => ports.keyboardPanEnabled() && ports.nothingSelected(),
    run: () => ports.panRight(),
  });
  register({
    id: 'freegantt.panLeft',
    label: 'Pan left',
    when: () => ports.keyboardPanEnabled() && ports.nothingSelected(),
    run: () => ports.panLeft(),
  });
  register({
    id: 'freegantt.panDown',
    label: 'Pan down',
    when: () => ports.keyboardPanEnabled() && ports.nothingSelected(),
    run: () => ports.panDown(),
  });
  register({
    id: 'freegantt.panUp',
    label: 'Pan up',
    when: () => ports.keyboardPanEnabled() && ports.nothingSelected(),
    run: () => ports.panUp(),
  });

  // S5.7, D-S5-18/D-S5-26: `Alt+Arrow` moves, `Shift+Arrow` resizes — both scoped to a focused
  // header cell (`ctx.target.kind === 'header'`) and gated on the same `resizable`/`movable` a
  // pointer drag already refuses (`interaction/column-gestures.ts`). Both run the same
  // `#commitColumnWidth`/`#commitColumnReorder` a pointer drag's commit runs.
  const columnKey = (ctx: unknown): FieldKey | undefined => {
    const target = asCtx(ctx).target;
    return target?.kind === 'header' ? target.columnKey : undefined;
  };
  register({
    id: 'freegantt.resizeColumnWider',
    label: 'Widen column',
    when: (ctx) => {
      const key = columnKey(ctx);
      return key !== undefined && ports.isColumnResizable(key);
    },
    run: (ctx) => {
      const key = columnKey(ctx);
      if (key !== undefined) ports.resizeColumnStep(key, 1);
    },
  });
  register({
    id: 'freegantt.resizeColumnNarrower',
    label: 'Narrow column',
    when: (ctx) => {
      const key = columnKey(ctx);
      return key !== undefined && ports.isColumnResizable(key);
    },
    run: (ctx) => {
      const key = columnKey(ctx);
      if (key !== undefined) ports.resizeColumnStep(key, -1);
    },
  });
  register({
    id: 'freegantt.moveColumnRight',
    label: 'Move column right',
    when: (ctx) => {
      const key = columnKey(ctx);
      return key !== undefined && ports.isColumnMovable(key);
    },
    run: (ctx) => {
      const key = columnKey(ctx);
      if (key !== undefined) ports.moveColumnStep(key, 1);
    },
  });
  register({
    id: 'freegantt.moveColumnLeft',
    label: 'Move column left',
    when: (ctx) => {
      const key = columnKey(ctx);
      return key !== undefined && ports.isColumnMovable(key);
    },
    run: (ctx) => {
      const key = columnKey(ctx);
      if (key !== undefined) ports.moveColumnStep(key, -1);
    },
  });
}
