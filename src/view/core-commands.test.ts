import { describe, expect, it, vi } from 'vitest';
import { registerCoreCommands } from './core-commands.js';
import type { CoreCommandPorts } from './core-commands.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { CommandContext } from '../extensions/commands.js';
import { Keymap } from '../extensions/keymap.js';
import type { KeyEventLike } from '../extensions/keymap.js';
import { entryId } from '../model/index.js';
import type { Entry } from '../model/index.js';

function fakePorts(): { [K in keyof CoreCommandPorts]: ReturnType<typeof vi.fn> } {
  return {
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
    collapseRow: vi.fn(),
    expandRow: vi.fn(),
    canZoomIn: vi.fn(() => true),
    canZoomOut: vi.fn(() => true),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    panToToday: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    hasSelection: vi.fn(() => true),
    keyboardPanEnabled: vi.fn(() => true),
    nothingSelected: vi.fn(() => true),
    selectNextEntry: vi.fn(),
    selectPreviousEntry: vi.fn(),
    canActivateFocused: vi.fn(() => false),
    activateFocused: vi.fn(),
    canClearDates: vi.fn(() => true),
    clearDates: vi.fn(),
    refusedRemovals: vi.fn(() => []),
    reportRemoveRefused: vi.fn(),
    pageDown: vi.fn(),
    pageUp: vi.fn(),
    panToStart: vi.fn(),
    panToEnd: vi.fn(),
    panRight: vi.fn(),
    panLeft: vi.fn(),
    panDown: vi.fn(),
    panUp: vi.fn(),
    isColumnResizable: vi.fn(() => true),
    isColumnMovable: vi.fn(() => true),
    resizeColumnStep: vi.fn(),
    moveColumnStep: vi.fn(),
  };
}

function makeRegistry(entry?: Entry): {
  registry: CommandRegistry<unknown>;
  ctx: CommandContext<unknown>;
} {
  const ctx = {
    dataset: {} as CommandContext<unknown>['dataset'],
    gantt: {},
    entry,
  } as CommandContext<unknown>;
  return { registry: new CommandRegistry<unknown>(() => ctx), ctx };
}

describe('registerCoreCommands (S5.2)', () => {
  it('run() on each id calls the matching port', () => {
    const ports = fakePorts();
    const { registry } = makeRegistry();
    registerCoreCommands(registry, ports);

    registry.run('freegantt.collapseAll');
    registry.run('freegantt.expandAll');
    registry.run('freegantt.zoomIn');
    registry.run('freegantt.zoomOut');
    registry.run('freegantt.panToToday');
    registry.run('freegantt.selectAll');
    registry.run('freegantt.clearSelection');
    registry.run('freegantt.pageDown');
    registry.run('freegantt.pageUp');
    registry.run('freegantt.panToStart');
    registry.run('freegantt.panToEnd');
    registry.run('freegantt.panRight');
    registry.run('freegantt.panLeft');
    registry.run('freegantt.panDown');
    registry.run('freegantt.panUp');

    expect(ports.collapseAll).toHaveBeenCalledOnce();
    expect(ports.expandAll).toHaveBeenCalledOnce();
    expect(ports.zoomIn).toHaveBeenCalledOnce();
    expect(ports.zoomOut).toHaveBeenCalledOnce();
    expect(ports.panToToday).toHaveBeenCalledOnce();
    expect(ports.selectAll).toHaveBeenCalledOnce();
    expect(ports.clearSelection).toHaveBeenCalledOnce();
    expect(ports.pageDown).toHaveBeenCalledOnce();
    expect(ports.pageUp).toHaveBeenCalledOnce();
    expect(ports.panToStart).toHaveBeenCalledOnce();
    expect(ports.panToEnd).toHaveBeenCalledOnce();
    expect(ports.panRight).toHaveBeenCalledOnce();
    expect(ports.panLeft).toHaveBeenCalledOnce();
    expect(ports.panDown).toHaveBeenCalledOnce();
    expect(ports.panUp).toHaveBeenCalledOnce();
  });

  it('collapseRow/expandRow forward the invocation entry id, and no-op with no entry', () => {
    const ports = fakePorts();
    const entry = {
      id: entryId('e1'),
      kind: 'span',
      name: 'Row',
      start: 0,
      end: 1,
    } as unknown as Entry;
    const { registry: withEntry } = makeRegistry(entry);
    registerCoreCommands(withEntry, ports);
    withEntry.run('freegantt.collapseRow');
    withEntry.run('freegantt.expandRow');
    expect(ports.collapseRow).toHaveBeenCalledWith(entryId('e1'));
    expect(ports.expandRow).toHaveBeenCalledWith(entryId('e1'));

    const noEntryPorts = fakePorts();
    const { registry: withoutEntry } = makeRegistry();
    registerCoreCommands(withoutEntry, noEntryPorts);
    withoutEntry.run('freegantt.collapseRow');
    withoutEntry.run('freegantt.expandRow');
    expect(noEntryPorts.collapseRow).not.toHaveBeenCalled();
    expect(noEntryPorts.expandRow).not.toHaveBeenCalled();
  });

  it("zoomIn/zoomOut's when reads the matching port, not the other one", () => {
    const ports = fakePorts();
    ports.canZoomIn.mockReturnValue(false);
    ports.canZoomOut.mockReturnValue(true);
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).toContain('freegantt.zoomOut');
    expect(available).not.toContain('freegantt.zoomIn');
  });

  it('the pan commands need only keyboardPanEnabled — a selection does not block them (S5.11)', () => {
    const ports = fakePorts();
    ports.keyboardPanEnabled.mockReturnValue(true);
    // A focused bar always carries a selection now (Q-A11Y-3), so `nothingSelected` staying
    // false must not hide `Alt+ArrowRight`'s Gantt-wide pan fallback.
    ports.nothingSelected.mockReturnValue(false);
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).toContain('freegantt.panRight');
    expect(available).toContain('freegantt.panLeft');
    expect(available).toContain('freegantt.panDown');
    expect(available).toContain('freegantt.panUp');
    expect(available).toContain('freegantt.pageDown');
  });

  it('the pan commands still need keyboardPanEnabled', () => {
    const ports = fakePorts();
    ports.keyboardPanEnabled.mockReturnValue(false);
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).not.toContain('freegantt.panRight');
    expect(available).not.toContain('freegantt.panLeft');
    expect(available).not.toContain('freegantt.panDown');
    expect(available).not.toContain('freegantt.panUp');
  });

  it("clearSelection's when reads hasSelection", () => {
    const ports = fakePorts();
    ports.hasSelection.mockReturnValue(false);
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    expect(registry.available(ctx).map((command) => command.id)).not.toContain('freegantt.clearSelection');
  });

  it('undo/redo read CommandContext.dataset directly, with no port', () => {
    const ports = fakePorts();
    const undo = vi.fn();
    const redo = vi.fn();
    const ctxWithDataset = {
      dataset: { canUndo: true, canRedo: false, undo, redo } as unknown as CommandContext<unknown>['dataset'],
      gantt: {},
    } as CommandContext<unknown>;
    const registry = new CommandRegistry<unknown>(() => ctxWithDataset);
    registerCoreCommands(registry, ports);

    registry.run('freegantt.undo');
    registry.run('freegantt.redo');

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).not.toHaveBeenCalled();
  });

  describe('freegantt.deleteSelection on a row target', () => {
    function deleteContext(entryIds: string[]) {
      const remove = vi.fn();
      const transaction = vi.fn((body: () => void) => body());
      const ctx = {
        dataset: {
          entries: { remove, has: () => true },
          transaction,
        } as unknown as CommandContext<unknown>['dataset'],
        gantt: {},
        target: { kind: 'row' as const, entryIds: entryIds.map(entryId) },
      } as CommandContext<unknown>;
      return { ctx, remove, transaction };
    }

    it('removes every named row inside one transaction', () => {
      const ports = fakePorts();
      const { ctx, remove, transaction } = deleteContext(['a', 'b']);
      const registry = new CommandRegistry<unknown>(() => ctx);
      registerCoreCommands(registry, ports);

      registry.run('freegantt.deleteSelection');

      expect(transaction).toHaveBeenCalledOnce();
      expect(remove.mock.calls).toEqual([['a'], ['b']]);
      expect(ports.reportRemoveRefused).not.toHaveBeenCalled();
    });

    it('removes nothing and reports once when any row is refused', () => {
      const ports = fakePorts();
      ports.refusedRemovals.mockReturnValue([entryId('b')]);
      const { ctx, remove, transaction } = deleteContext(['a', 'b']);
      const registry = new CommandRegistry<unknown>(() => ctx);
      registerCoreCommands(registry, ports);

      registry.run('freegantt.deleteSelection');

      expect(remove).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
      expect(ports.reportRemoveRefused.mock.calls).toEqual([[[entryId('b')]]]);
    });
  });

  // #160: the id is registered so `run` answers on a Gantt with no `inlineEditing()`,
  // and it is never offered, because this Gantt has no editor to discard.
  it("#160: the catalog's discardCellEdit placeholder is never available — inlineEditing() overrides it", () => {
    const ports = fakePorts();
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    expect(registry.available(ctx).map((command) => command.id)).not.toContain('freegantt.discardCellEdit');
    expect(() => registry.run('freegantt.discardCellEdit')).not.toThrow();
  });

  // #434: the same placeholder shape, one id over — `freegantt.editFocusedCell` answers on every
  // Gantt, and stays unavailable until `inlineEditing()` overrides it.
  it("#434: the catalog's editFocusedCell placeholder is never available — inlineEditing() overrides it", () => {
    const ports = fakePorts();
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    expect(registry.available(ctx).map((command) => command.id)).not.toContain('freegantt.editFocusedCell');
    expect(() => registry.run('freegantt.editFocusedCell')).not.toThrow();
  });
});

describe('column commands — Alt/Shift+Arrow over a focused header cell (S5.7)', () => {
  function makeHeaderRegistry(field?: string): {
    registry: CommandRegistry<unknown>;
    ctx: CommandContext<unknown>;
  } {
    const ctx = {
      dataset: {} as CommandContext<unknown>['dataset'],
      gantt: {},
      ...(field !== undefined ? { target: { kind: 'header' as const, field, entryIds: [] } } : {}),
    } as CommandContext<unknown>;
    return { registry: new CommandRegistry<unknown>(() => ctx), ctx };
  }

  it('resizeColumnWider/Narrower and moveColumnLeft/Right forward the focused column key and a direction', () => {
    const ports = fakePorts();
    const { registry } = makeHeaderRegistry('cost');
    registerCoreCommands(registry, ports);

    registry.run('freegantt.resizeColumnWider');
    registry.run('freegantt.resizeColumnNarrower');
    registry.run('freegantt.moveColumnRight');
    registry.run('freegantt.moveColumnLeft');

    expect(ports.resizeColumnStep).toHaveBeenNthCalledWith(1, 'cost', 1);
    expect(ports.resizeColumnStep).toHaveBeenNthCalledWith(2, 'cost', -1);
    expect(ports.moveColumnStep).toHaveBeenNthCalledWith(1, 'cost', 1);
    expect(ports.moveColumnStep).toHaveBeenNthCalledWith(2, 'cost', -1);
  });

  it('every column command is unavailable with no focused header cell', () => {
    const ports = fakePorts();
    const { registry, ctx } = makeHeaderRegistry();
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).not.toContain('freegantt.resizeColumnWider');
    expect(available).not.toContain('freegantt.resizeColumnNarrower');
    expect(available).not.toContain('freegantt.moveColumnRight');
    expect(available).not.toContain('freegantt.moveColumnLeft');
  });

  it('resizable: false refuses both resize commands for that column, movable: false refuses both move commands', () => {
    const ports = fakePorts();
    ports.isColumnResizable.mockReturnValue(false);
    ports.isColumnMovable.mockReturnValue(false);
    const { registry, ctx } = makeHeaderRegistry('cost');
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).not.toContain('freegantt.resizeColumnWider');
    expect(available).not.toContain('freegantt.resizeColumnNarrower');
    expect(available).not.toContain('freegantt.moveColumnRight');
    expect(available).not.toContain('freegantt.moveColumnLeft');

    registry.run('freegantt.resizeColumnWider');
    registry.run('freegantt.moveColumnRight');
    expect(ports.resizeColumnStep).not.toHaveBeenCalled();
    expect(ports.moveColumnStep).not.toHaveBeenCalled();
  });

  it('a target of a different kind (not "header") also leaves every column command unavailable', () => {
    const ports = fakePorts();
    const ctx = {
      dataset: {} as CommandContext<unknown>['dataset'],
      gantt: {},
      target: { kind: 'bar' as const },
    } as CommandContext<unknown>;
    const registry = new CommandRegistry<unknown>(() => ctx);
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).not.toContain('freegantt.resizeColumnWider');
    expect(available).not.toContain('freegantt.moveColumnLeft');
  });
});

// #275 item 1's sharp edge: `Alt+ArrowRight` is deliberately overloaded — `GanttShell`
// binds `panRight` to it first, then `moveColumnRight` second, and `Keymap.resolve()`'s
// newest-first order means `moveColumnRight`'s own `when` gets first refusal. Every test
// above this one calls `registry.run(id)` directly, which never exercises that chord resolution —
// so nothing before this proved the overload itself works, only that each command works once
// already selected. This resolves a real `Alt+ArrowRight` `KeyEventLike` through a real `Keymap`,
// bound in the exact order `GanttShell#registerCoreCommands` binds it, and checks both arms.
describe('Alt+ArrowRight overload — column move vs. Gantt-wide pan fallback', () => {
  function altArrowRight(): KeyEventLike {
    return {
      key: 'ArrowRight',
      ctrlKey: false,
      shiftKey: false,
      altKey: true,
      metaKey: false,
      isComposing: false,
      target: null,
      stopPropagation: vi.fn(),
    };
  }

  function bindAltArrowRightLikeGanttShell(
    ports: ReturnType<typeof fakePorts>,
    ctx: CommandContext<unknown>,
  ): Keymap<unknown> {
    const registry = new CommandRegistry<unknown>(() => ctx);
    registerCoreCommands(registry, ports);
    const keymap = new Keymap<unknown>(registry, () => ctx);
    // Registration order matters here (newest-first) — this mirrors gantt-shell.ts's own
    // `bind('Alt+ArrowRight', 'freegantt.panRight')` followed by
    // `bind('Alt+ArrowRight', 'freegantt.moveColumnRight')`.
    keymap.register({ chord: 'Alt+ArrowRight', command: 'freegantt.panRight' });
    keymap.register({ chord: 'Alt+ArrowRight', command: 'freegantt.moveColumnRight' });
    return keymap;
  }

  it('fires the column arm when a header cell has focus', () => {
    const ports = fakePorts();
    const { ctx } = makeHeaderCommandContext('cost');
    const keymap = bindAltArrowRightLikeGanttShell(ports, ctx);

    const handled = keymap.resolve(altArrowRight());

    expect(handled).toBe(true);
    expect(ports.moveColumnStep).toHaveBeenCalledWith('cost', 1);
    expect(ports.panRight).not.toHaveBeenCalled();
  });

  it('falls through to the Gantt-wide pan fallback when no header cell has focus', () => {
    const ports = fakePorts();
    const ctx = {
      dataset: {} as CommandContext<unknown>['dataset'],
      gantt: {},
    } as CommandContext<unknown>;
    const keymap = bindAltArrowRightLikeGanttShell(ports, ctx);

    const handled = keymap.resolve(altArrowRight());

    expect(handled).toBe(true);
    expect(ports.panRight).toHaveBeenCalledOnce();
    expect(ports.moveColumnStep).not.toHaveBeenCalled();
  });

  it('a focused header cell whose column is not movable still falls through to pan', () => {
    const ports = fakePorts();
    ports.isColumnMovable.mockReturnValue(false);
    const { ctx } = makeHeaderCommandContext('cost');
    const keymap = bindAltArrowRightLikeGanttShell(ports, ctx);

    const handled = keymap.resolve(altArrowRight());

    expect(handled).toBe(true);
    expect(ports.panRight).toHaveBeenCalledOnce();
    expect(ports.moveColumnStep).not.toHaveBeenCalled();
  });
});

function makeHeaderCommandContext(field: string): {
  registry: CommandRegistry<unknown>;
  ctx: CommandContext<unknown>;
} {
  const ctx = {
    dataset: {} as CommandContext<unknown>['dataset'],
    gantt: {},
    target: { kind: 'header' as const, field, entryIds: [] },
  } as CommandContext<unknown>;
  return { registry: new CommandRegistry<unknown>(() => ctx), ctx };
}
