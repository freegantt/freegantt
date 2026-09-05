// The point of this file: `buildPluginPorts` is reachable with no mounted Gantt (A2). Before the
// split, every one of these assertions needed a real container, a real dataset and a real render
// loop, so the gate, the repaint and the disposal were only ever tested through a whole Gantt.
import { describe, expect, it, vi } from 'vitest';
import { RegistrationClosedError } from '../model/index.js';
import type { Disposer, Entry, EntryId, PluginId } from '../model/index.js';
import type { FrameBar, ResolvedColumn, TooltipRenderer } from '../layout/index.js';
import { buildPluginPorts } from './plugin-ports.js';
import type { GanttShellPorts, PluginContextPorts } from './plugin-ports.js';
import type { DomTarget } from './gantt-dom.js';

const PLUGIN: PluginId = 'demo.plugin';

/** One fake registry: it holds live tokens, and each `Disposer` removes exactly the token it made.
 *  That is the #155 contract every `register*` seam shares, so one fake serves them all. */
function makeRegistry() {
  const live: string[] = [];
  const add = (token: string): Disposer => {
    live.push(token);
    return () => {
      const index = live.indexOf(token);
      if (index >= 0) live.splice(index, 1);
    };
  };
  return { live, add };
}

interface Harness {
  ports: PluginContextPorts;
  close(): void;
  shell: GanttShellPorts;
  registry: ReturnType<typeof makeRegistry>;
  counts: { frames: number; items: number; capabilities: number };
  /** The node this fake Gantt owns. `onDomEvent` must answer for it and for nothing else. */
  container: HTMLElement;
}

/** A `GanttDom` over one plain element. It answers `owns` truthfully, which is the whole of what
 *  `onDomEvent`'s scoping needs, and resolves every owned node to one `'row'` target. */
function makeDom(container: HTMLElement): GanttShellPorts['dom'] {
  const target: DomTarget = { kind: 'row', element: container };
  return {
    owns: (node) => container.contains(node),
    targetUnder: (node) => (container.contains(node) ? target : undefined),
    barFor: () => undefined,
    cellFor: () => undefined,
    cellText: () => '',
    bounds: new DOMRect(),
    paneBounds: { grid: new DOMRect(), timeline: new DOMRect() },
  };
}

function makeEntry(id: string): Entry {
  return { id: id as EntryId, name: id, kind: 'span' } as unknown as Entry;
}

function makeBar(): FrameBar {
  return { id: 'item', x: 0, y: 0, width: 10, height: 4 } as unknown as FrameBar;
}

function makeHarness(overrides: Partial<GanttShellPorts> = {}): Harness {
  const registry = makeRegistry();
  const counts = { frames: 0, items: 0, capabilities: 0 };
  const container = document.createElement('div');
  document.body.append(container);
  const shell: GanttShellPorts = {
    events: { on: vi.fn(), off: vi.fn() },
    overlay: { present: vi.fn() } as unknown as GanttShellPorts['overlay'],
    dom: makeDom(container),
    commands: {
      register: (command) => registry.add(`command:${command.id}`),
      run: vi.fn(),
      available: () => [],
    },
    keymap: {
      register: (binding) => registry.add(`keybinding:${binding.chord}`),
      registerHandler: (chord) => registry.add(`handler:${chord}`),
    },
    registerRenderer: (point) => registry.add(`renderer:${point}`),
    resolveTooltipRenderer: () => undefined,
    lastPaintedBar: () => makeBar(),
    entry: (id) => makeEntry(id),
    resolvedColumns: () => [],
    addDecorationProvider: (layer) => registry.add(`decoration:${layer}`),
    itemProducers: { register: (kind) => registry.add(`producer:${kind}`) },
    kindDefaults: { register: (kind) => registry.add(`defaults:${kind}`) },
    registerGridColumn: () => registry.add('column'),
    canEdit: () => true,
    proposeEntryEdit: () => true,
    announceEntryEdit: vi.fn(),
    requestFrame: () => {
      counts.frames += 1;
    },
    invalidateItems: () => {
      counts.items += 1;
    },
    refreshCapabilities: () => {
      counts.capabilities += 1;
    },
    ...overrides,
  };
  const { ports, gate } = buildPluginPorts(shell, PLUGIN);
  return { ports, close: () => gate.close(), shell, registry, counts, container };
}

/** Every seam that is legal only while `setup` runs (D-S5-4), named once. */
const gatedRegistrations: readonly (readonly [string, (ports: PluginContextPorts) => Disposer])[] = [
  ['commands.register', (p) => p.commands.register({ id: 'demo.run', label: 'Run', run: () => {} })],
  [
    'interaction.registerKeybinding',
    (p) => p.interaction.registerKeybinding({ chord: 'Mod+K', command: 'demo.run' }),
  ],
  ['interaction.registerKindDefaults', (p) => p.interaction.registerKindDefaults('buffer', {})],
  ['view.registerRenderer', (p) => p.view.registerRenderer('cell', () => ({ text: '' }))],
  ['view.registerDecoration', (p) => p.view.registerDecoration('underBars', () => [])],
  ['view.registerGridColumn', (p) => p.view.registerGridColumn('cost')],
  ['layout.registerItemProducer', (p) => p.layout.registerItemProducer('buffer', () => [])],
];

describe('buildPluginPorts — the D-S5-4 gate', () => {
  it.each(gatedRegistrations)('%s registers while setup runs', (_name, register) => {
    const harness = makeHarness();

    expect(() => register(harness.ports)).not.toThrow();
    expect(harness.registry.live).toHaveLength(1);
  });

  it.each(gatedRegistrations)('%s throws RegistrationClosedError once setup returns', (_name, register) => {
    const harness = makeHarness();
    harness.close();

    expect(() => register(harness.ports)).toThrow(RegistrationClosedError);
    expect(harness.registry.live).toHaveLength(0);
  });

  it('leaves the ungated ports open after setup returns', () => {
    const harness = makeHarness();
    harness.close();

    expect(() => harness.ports.interaction.registerKeyHandler('Escape', () => {})).not.toThrow();
    expect(harness.ports.interaction.canEdit(makeEntry('a'))).toBe(true);
    expect(harness.ports.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
    expect(harness.ports.view.resolveTooltipColumns(makeEntry('a'))).toEqual([]);
  });

  it('keeps `registerKeyHandler` out of `disposables`, so a Popup owns its own cycle', () => {
    const harness = makeHarness();

    harness.ports.interaction.registerKeyHandler('Escape', () => {});
    harness.ports.disposables.disposeAll();

    expect(harness.registry.live).toEqual(['handler:Escape']);
  });
});

describe('buildPluginPorts — what a registration invalidates', () => {
  it('a renderer claim repaints on the way in and on the way out (#155)', () => {
    const harness = makeHarness();

    const dispose = harness.ports.view.registerRenderer('cell', () => ({ text: '' }));
    expect(harness.counts.frames).toBe(1);

    dispose();
    expect(harness.counts.frames).toBe(2);
  });

  it('a decoration provider repaints on both edges', () => {
    const harness = makeHarness();

    const dispose = harness.ports.view.registerDecoration('underBars', () => []);
    expect(harness.counts.frames).toBe(1);

    dispose();
    expect(harness.counts.frames).toBe(2);
  });

  it('an item producer re-produces every row on both edges', () => {
    const harness = makeHarness();

    const dispose = harness.ports.layout.registerItemProducer('buffer', () => []);
    expect(harness.counts).toMatchObject({ items: 1, frames: 1 });

    dispose();
    expect(harness.counts).toMatchObject({ items: 2, frames: 2 });
  });

  it('kind defaults re-resolve capabilities on both edges, and paint nothing themselves', () => {
    const harness = makeHarness();

    const dispose = harness.ports.interaction.registerKindDefaults('buffer', {});
    expect(harness.counts).toMatchObject({ capabilities: 1, frames: 0 });

    dispose();
    expect(harness.counts).toMatchObject({ capabilities: 2, frames: 0 });
  });

  it('a grid column asks for no frame here — `ColumnChrome` already asks on both its own edges', () => {
    const harness = makeHarness();

    const dispose = harness.ports.view.registerGridColumn('cost');
    dispose();

    expect(harness.counts).toMatchObject({ frames: 0, items: 0, capabilities: 0 });
  });

  it('a command and a key binding paint nothing', () => {
    const harness = makeHarness();

    harness.ports.commands.register({ id: 'demo.run', label: 'Run', run: () => {} });
    harness.ports.interaction.registerKeybinding({ chord: 'Mod+K', command: 'demo.run' });

    expect(harness.counts).toMatchObject({ frames: 0, items: 0, capabilities: 0 });
  });
});

describe('buildPluginPorts — disposal (#155)', () => {
  it('each Disposer removes exactly its own registration, in any order', () => {
    const harness = makeHarness();

    const span = harness.ports.layout.registerItemProducer('span', () => []);
    const buffer = harness.ports.layout.registerItemProducer('buffer', () => []);
    const risk = harness.ports.layout.registerItemProducer('risk', () => []);

    buffer();
    expect(harness.registry.live).toEqual(['producer:span', 'producer:risk']);

    risk();
    expect(harness.registry.live).toEqual(['producer:span']);

    span();
    expect(harness.registry.live).toEqual([]);
  });

  it('calling a Disposer twice is safe', () => {
    const harness = makeHarness();

    const dispose = harness.ports.view.registerDecoration('underBars', () => []);
    dispose();
    dispose();

    expect(harness.registry.live).toEqual([]);
  });

  it('`disposables.disposeAll()` frees every gated registration, so uninstall needs no plugin help', () => {
    const harness = makeHarness();
    for (const [, register] of gatedRegistrations) register(harness.ports);
    expect(harness.registry.live).toHaveLength(gatedRegistrations.length);

    harness.ports.disposables.disposeAll();

    expect(harness.registry.live).toEqual([]);
  });

  it('two Gantts share nothing: one plugin’s disposal leaves the other’s registrations (I2)', () => {
    const first = makeHarness();
    const second = makeHarness();

    first.ports.view.registerDecoration('underBars', () => []);
    second.ports.view.registerDecoration('underBars', () => []);
    first.ports.disposables.disposeAll();

    expect(first.registry.live).toEqual([]);
    expect(second.registry.live).toEqual(['decoration:underBars']);
  });
});

describe('buildPluginPorts — resolveTooltipContent (S5.5)', () => {
  const renderer: TooltipRenderer = () => ({ text: 'body' });

  it('paints the resolved renderer’s own content', () => {
    const harness = makeHarness({ resolveTooltipRenderer: () => ({ renderer }) });

    expect(harness.ports.view.resolveTooltipContent('a' as EntryId)).toEqual({ text: 'body' });
  });

  it('falls back to the default content when the entry has no bar in the current frame', () => {
    const harness = makeHarness({
      resolveTooltipRenderer: () => ({ renderer }),
      lastPaintedBar: () => undefined,
    });

    expect(harness.ports.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
  });

  it('falls back to the default content when the renderer throws (#137 F14)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const harness = makeHarness({
      resolveTooltipRenderer: () => ({
        renderer: () => {
          throw new Error('boom');
        },
      }),
    });

    expect(harness.ports.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
    errorSpy.mockRestore();
  });
});

describe('buildPluginPorts — the resolved-column reads (S5.8, D-S5-13)', () => {
  const column = (overrides: Partial<ResolvedColumn>): ResolvedColumn => ({
    key: 'cost',
    header: 'Cost',
    align: 'start',
    format: () => '12',
    ...overrides,
  });

  it('resolveTooltipColumns keeps only the columns marked `tooltip: true`', () => {
    const harness = makeHarness({
      resolvedColumns: () => [column({ tooltip: true }), column({ key: 'name', header: 'Name' })],
    });

    expect(harness.ports.view.resolveTooltipColumns(makeEntry('a'))).toEqual([
      { header: 'Cost', value: '12' },
    ]);
  });

  it('isColumnEditable answers undefined for a field no resolved column names', () => {
    const harness = makeHarness({ resolvedColumns: () => [column({ editable: true })] });

    expect(harness.ports.view.isColumnEditable('cost')).toBe(true);
    expect(harness.ports.view.isColumnEditable('name')).toBeUndefined();
  });
});

describe('buildPluginPorts — onDomEvent, one scoped document listener (review A4)', () => {
  it('answers for a node this Gantt owns, and hands over the resolved target', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    harness.ports.view.onDomEvent('click', (_event, target) => seen.push(target?.kind ?? 'none'));
    harness.container.dispatchEvent(new Event('click', { bubbles: true }));

    expect(seen).toEqual(['row']);
  });

  it("stays silent for another Gantt's node, so two plugins on one page never cross (I2)", () => {
    // The failure this closes: every plugin used to write its own "is this mine?" guard by hand, and
    // one of the twelve had none at all (bug hunt B1). Two independent port sets, one document.
    const first = makeHarness();
    const second = makeHarness();
    const firstSaw: string[] = [];
    const secondSaw: string[] = [];

    first.ports.view.onDomEvent('click', () => firstSaw.push('click'));
    second.ports.view.onDomEvent('click', () => secondSaw.push('click'));
    second.container.dispatchEvent(new Event('click', { bubbles: true }));

    expect(firstSaw).toEqual([]);
    expect(secondSaw).toEqual(['click']);
  });

  it('removes the listener with the capture flag it added, on the returned disposer', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    const remove = harness.ports.view.onDomEvent('scroll', () => seen.push('scroll'), { capture: true });
    harness.container.dispatchEvent(new Event('scroll'));
    expect(seen).toHaveLength(1);

    remove();
    harness.container.dispatchEvent(new Event('scroll'));
    expect(seen).toHaveLength(1);
  });

  it('removes the listener when the plugin disposes, without the plugin remembering to', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    harness.ports.view.onDomEvent('click', () => seen.push('click'));
    harness.ports.disposables.disposeAll();
    harness.container.dispatchEvent(new Event('click', { bubbles: true }));

    expect(seen).toEqual([]);
  });

  it('stays open after setup returns — a menu attaches its listeners per open (D-S5-4)', () => {
    const harness = makeHarness();
    harness.close();

    expect(() => harness.ports.view.onDomEvent('click', () => {})).not.toThrow();
  });
});
