// view/ — the core command catalog (S5.2, D-S5-6). Split out of GanttShell so the nineteen
// commands are reviewable as a table, not interleaved with shell construction. `GanttShell` is the
// only caller: it builds a `CoreCommandPorts` closing over its own private state and hands it here
// with its own `CommandRegistry` — this file never touches a shell field directly.

import type { EntryId } from '../model/index.js';
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
}
