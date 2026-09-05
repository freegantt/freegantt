// The point of this file: `buildPluginPorts` is reachable with no mounted Gantt (A2). Before the
// split, every one of these assertions needed a real container, a real dataset and a real render
// loop, so the gate, the repaint and the disposal were only ever tested through a whole Gantt.
import { describe, expect, it, vi } from 'vitest';
import { RegistrationClosedError } from '../model/index.js';
import type { Disposer, Entry, EntryId, PluginId } from '../model/index.js';
import type { FrameBar, ResolvedColumn, TooltipRenderer } from '../layout/index.js';
import { buildPluginPorts } from './plugin-ports.js';
import type { GanttShellPorts, PluginContextParts } from './plugin-ports.js';
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
  parts: PluginContextParts;
  close(): void;
  shell: GanttShellPorts;
  registry: ReturnType<typeof makeRegistry>;
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
    paneOf: () => undefined,
  };
}

/** #168: one shape serves both layers, so one fake does too. */
function fakeMountLayer(): GanttShellPorts['overlay'] {
  return { present: vi.fn(), onResize: vi.fn(), bounds: new DOMRect() };
}

function makeEntry(id: string): Entry {
  return { id: id as EntryId, name: id, kind: 'span' } as unknown as Entry;
}

function makeBar(): FrameBar {
  return { id: 'item', x: 0, y: 0, width: 10, height: 4 } as unknown as FrameBar;
}

function makeHarness(overrides: Partial<GanttShellPorts> = {}): Harness {
  const registry = makeRegistry();
  const container = document.createElement('div');
  document.body.append(container);
  const shell: GanttShellPorts = {
    events: { on: vi.fn(), off: vi.fn() },
    overlay: fakeMountLayer(),
    rowLayer: fakeMountLayer(),
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
    // #170: one object answers all five register seams now, and each carries the refresh it owes.
    // What each one invalidates is `plugin-registrations.test.ts`'s subject. This file asks only what
    // `buildPluginPorts` still decides: the gate, and who holds the disposer.
    registrations: {
      registerRenderer: (point) => registry.add(`renderer:${point}`),
      registerDecoration: (layer) => registry.add(`decoration:${layer}`),
      registerItemProducer: (kind) => registry.add(`producer:${kind}`),
      registerKindDefaults: (kind) => registry.add(`defaults:${kind}`),
      registerGridColumn: () => registry.add('column'),
    },
    resolveTooltipRenderer: () => undefined,
    lastPaintedBar: () => makeBar(),
    entry: (id) => makeEntry(id),
    resolvedColumns: () => [],
    resolvedColumn: (field) => shell.resolvedColumns().find((column) => column.field === field),
    canEdit: () => true,
    proposeEntryEdit: () => true,
    announceEntryEdit: vi.fn(),
    ...overrides,
  };
  const { parts, gate } = buildPluginPorts(shell, PLUGIN);
  return { parts, close: () => gate.close(), shell, registry, container };
}

/** Every seam that is legal only while `setup` runs (D-S5-4), named once. */
const gatedRegistrations: readonly (readonly [string, (parts: PluginContextParts) => Disposer])[] = [
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

    expect(() => register(harness.parts)).not.toThrow();
    expect(harness.registry.live).toHaveLength(1);
  });

  it.each(gatedRegistrations)('%s throws RegistrationClosedError once setup returns', (_name, register) => {
    const harness = makeHarness();
    harness.close();

    expect(() => register(harness.parts)).toThrow(RegistrationClosedError);
    expect(harness.registry.live).toHaveLength(0);
  });

  it('leaves the ungated parts open after setup returns', () => {
    const harness = makeHarness();
    harness.close();

    expect(() => harness.parts.interaction.registerKeyHandler('Escape', () => {})).not.toThrow();
    expect(harness.parts.interaction.canEdit(makeEntry('a'))).toBe(true);
    expect(harness.parts.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
    expect(harness.parts.view.resolveTooltipColumns(makeEntry('a'))).toEqual([]);
  });

  it('keeps `registerKeyHandler` out of `disposables`, so a Popup owns its own cycle', () => {
    const harness = makeHarness();

    harness.parts.interaction.registerKeyHandler('Escape', () => {});
    harness.parts.disposables.disposeAll();

    expect(harness.registry.live).toEqual(['handler:Escape']);
  });
});

describe('buildPluginPorts — disposal (#155)', () => {
  it('each Disposer removes exactly its own registration, in any order', () => {
    const harness = makeHarness();

    const span = harness.parts.layout.registerItemProducer('span', () => []);
    const buffer = harness.parts.layout.registerItemProducer('buffer', () => []);
    const risk = harness.parts.layout.registerItemProducer('risk', () => []);

    buffer();
    expect(harness.registry.live).toEqual(['producer:span', 'producer:risk']);

    risk();
    expect(harness.registry.live).toEqual(['producer:span']);

    span();
    expect(harness.registry.live).toEqual([]);
  });

  it('calling a Disposer twice is safe', () => {
    const harness = makeHarness();

    const dispose = harness.parts.view.registerDecoration('underBars', () => []);
    dispose();
    dispose();

    expect(harness.registry.live).toEqual([]);
  });

  it('`disposables.disposeAll()` frees every gated registration, so uninstall needs no plugin help', () => {
    const harness = makeHarness();
    for (const [, register] of gatedRegistrations) register(harness.parts);
    expect(harness.registry.live).toHaveLength(gatedRegistrations.length);

    harness.parts.disposables.disposeAll();

    expect(harness.registry.live).toEqual([]);
  });

  it('two Gantts share nothing: one plugin’s disposal leaves the other’s registrations (I2)', () => {
    const first = makeHarness();
    const second = makeHarness();

    first.parts.view.registerDecoration('underBars', () => []);
    second.parts.view.registerDecoration('underBars', () => []);
    first.parts.disposables.disposeAll();

    expect(first.registry.live).toEqual([]);
    expect(second.registry.live).toEqual(['decoration:underBars']);
  });
});

// #168: the reconciler seam left the overlay and now sits beside the two mount layers. It is still
// the one way `extensions/` reaches `render/dom` (D-S5-5), and it still refuses raw HTML (I13).
describe('buildPluginPorts — renderElement (S5.3, D-S5-10)', () => {
  it('builds a live node from an ElementDescription, and never as HTML', () => {
    const { parts } = makeHarness();
    const node = parts.view.renderElement({ text: '<script>alert(1)</script>' });

    expect(node.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
  });
});

describe('buildPluginPorts — resolveTooltipContent (S5.5)', () => {
  const renderer: TooltipRenderer = () => ({ text: 'body' });

  it('paints the resolved renderer’s own content', () => {
    const harness = makeHarness({ resolveTooltipRenderer: () => ({ renderer }) });

    expect(harness.parts.view.resolveTooltipContent('a' as EntryId)).toEqual({ text: 'body' });
  });

  it('falls back to the default content when the entry has no bar in the current frame', () => {
    const harness = makeHarness({
      resolveTooltipRenderer: () => ({ renderer }),
      lastPaintedBar: () => undefined,
    });

    expect(harness.parts.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
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

    expect(harness.parts.view.resolveTooltipContent('a' as EntryId)).toBeUndefined();
    errorSpy.mockRestore();
  });
});

describe('buildPluginPorts — the resolved-column reads (S5.8, D-S5-13)', () => {
  const column = (overrides: Partial<ResolvedColumn>): ResolvedColumn => ({
    field: 'cost',
    header: 'Cost',
    align: 'start',
    format: () => '12',
    ...overrides,
  });

  it('resolveTooltipColumns keeps only the columns marked `tooltip: true`', () => {
    const harness = makeHarness({
      resolvedColumns: () => [column({ tooltip: true }), column({ field: 'name', header: 'Name' })],
    });

    expect(harness.parts.view.resolveTooltipColumns(makeEntry('a'))).toEqual([
      { header: 'Cost', value: '12' },
    ]);
  });

  it('isColumnEditable answers undefined for a field no resolved column names', () => {
    const harness = makeHarness({ resolvedColumns: () => [column({ editable: true })] });

    expect(harness.parts.view.isColumnEditable('cost')).toBe(true);
    expect(harness.parts.view.isColumnEditable('name')).toBeUndefined();
  });
});

describe('buildPluginPorts — onDomEvent, one scoped document listener (review A4)', () => {
  it('answers for a node this Gantt owns, and hands over the resolved target', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    harness.parts.view.onDomEvent('click', (_event, target) => seen.push(target?.kind ?? 'none'));
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

    first.parts.view.onDomEvent('click', () => firstSaw.push('click'));
    second.parts.view.onDomEvent('click', () => secondSaw.push('click'));
    second.container.dispatchEvent(new Event('click', { bubbles: true }));

    expect(firstSaw).toEqual([]);
    expect(secondSaw).toEqual(['click']);
  });

  it('removes the listener with the capture flag it added, on the returned disposer', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    const remove = harness.parts.view.onDomEvent('scroll', () => seen.push('scroll'), { capture: true });
    harness.container.dispatchEvent(new Event('scroll'));
    expect(seen).toHaveLength(1);

    remove();
    harness.container.dispatchEvent(new Event('scroll'));
    expect(seen).toHaveLength(1);
  });

  it('removes the listener when the plugin disposes, without the plugin remembering to', () => {
    const harness = makeHarness();
    const seen: string[] = [];

    harness.parts.view.onDomEvent('click', () => seen.push('click'));
    harness.parts.disposables.disposeAll();
    harness.container.dispatchEvent(new Event('click', { bubbles: true }));

    expect(seen).toEqual([]);
  });

  it('stays open after setup returns — a menu attaches its listeners per open (D-S5-4)', () => {
    const harness = makeHarness();
    harness.close();

    expect(() => harness.parts.view.onDomEvent('click', () => {})).not.toThrow();
  });
});
