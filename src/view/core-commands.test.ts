import { describe, expect, it, vi } from 'vitest';
import { registerCoreCommands } from './core-commands.js';
import type { CoreCommandPorts } from './core-commands.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { CommandContext } from '../extensions/commands.js';
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
    pageDown: vi.fn(),
    pageUp: vi.fn(),
    panToStart: vi.fn(),
    panToEnd: vi.fn(),
    panRight: vi.fn(),
    panLeft: vi.fn(),
    panDown: vi.fn(),
    panUp: vi.fn(),
  };
}

function makeRegistry(entry?: Entry): { registry: CommandRegistry<unknown>; ctx: CommandContext<unknown> } {
  const ctx = {
    dataset: {} as CommandContext<unknown>['dataset'],
    gantt: {},
    entry,
  } as CommandContext<unknown>;
  return { registry: new CommandRegistry<unknown>(() => ctx), ctx };
}

describe('registerCoreCommands (S5.2, D-S5-6)', () => {
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
    const entry = { id: entryId('e1'), kind: 'span', name: 'Row', start: 0, end: 1 } as unknown as Entry;
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

  it('the arrow-pan commands require both keyboardPanEnabled and nothingSelected', () => {
    const ports = fakePorts();
    ports.keyboardPanEnabled.mockReturnValue(true);
    ports.nothingSelected.mockReturnValue(false);
    const { registry, ctx } = makeRegistry();
    registerCoreCommands(registry, ports);

    const available = registry.available(ctx).map((command) => command.id);
    expect(available).not.toContain('freegantt.panRight');
    // Page/Home/End only need keyboardPanEnabled, not nothingSelected.
    expect(available).toContain('freegantt.pageDown');
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
});
