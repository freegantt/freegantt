import { describe, expect, it } from 'vitest';
import type { PluginContext } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import { entryDependencies } from './entry-dependencies.js';
import type { DependencyRemoval } from './entry-dependencies.js';

type Connector = { id: string; flags: { selected?: boolean }; label: string };
type DomHandler = (event: unknown, target: unknown) => void;
type KeyHandler = (event: { target: unknown }) => void | false;

/** The view half over a fake: it records what the plugin registers and lets a test act as the user. */
function mount(options: Parameters<typeof entryDependencies>[0] = {}) {
  const plugin = entryDependencies(options);
  const dataset = new Dataset({
    entries: ['a', 'b', 'c'].map((id, index) => ({
      id,
      name: `Task ${id}`,
      start: index,
      end: index + 1,
      props: { code: id.toUpperCase() },
    })),
    fields: [{ key: 'code' }],
    timeZone: 'UTC',
    plugins: [plugin],
  });
  plugin.replaceAll([
    { id: 'd1', fromId: 'a', toId: 'b', type: 'FS', lag: { value: 0, unit: 'day' } },
    { id: 'd2', fromId: 'b', toId: 'c', type: 'FS', lag: { value: 0, unit: 'day' } },
  ]);
  let provider: (() => readonly Connector[]) | undefined;
  const domHandlers = new Map<string, DomHandler>();
  const keyHandlers = new Map<string, KeyHandler>();
  const focused: string[] = [];
  // A fake node stands for a connector line. `targetUnder` reads its id back.
  const lineOf = (connectorId: string) => {
    const line = document.createElement('div');
    line.dataset['connectorId'] = connectorId;
    line.focus = () => focused.push(connectorId);
    return line;
  };
  const mounted = new Set(['dependency:d1', 'dependency:d2']);
  const ctx = {
    dataset,
    view: {
      registerConnector: (next: () => readonly Connector[]) => {
        provider = next;
        return () => {};
      },
      onConnect: () => () => {},
      onDomEvent: (type: string, handler: DomHandler) => {
        domHandlers.set(type, handler);
        return () => {};
      },
      dom: {
        targetUnder: (node: HTMLElement) => {
          const connectorId = node.dataset['connectorId'];
          return connectorId === undefined ? undefined : { kind: 'connector', connectorId };
        },
        connectorFor: (id: string) => (mounted.has(id) ? lineOf(id) : undefined),
      },
    },
    interaction: {
      registerKeyHandler: (chord: string, handler: KeyHandler) => {
        keyHandlers.set(chord, handler);
        return () => {};
      },
    },
  } as unknown as PluginContext;
  plugin.view?.(ctx);
  return {
    plugin,
    dataset,
    focused,
    connectors: () => provider?.() ?? [],
    selectedIds: () =>
      (provider?.() ?? []).filter((connector) => connector.flags.selected === true).map((c) => c.id),
    click: (connectorId?: string) =>
      domHandlers.get('click')?.(
        {},
        connectorId === undefined ? undefined : { kind: 'connector', connectorId },
      ),
    focusIn: (connectorId?: string) =>
      domHandlers.get('focusin')?.(
        {},
        connectorId === undefined ? undefined : { kind: 'connector', connectorId },
      ),
    press: (chord: string, onConnector?: string) =>
      keyHandlers.get(chord)?.({ target: onConnector === undefined ? document.body : lineOf(onConnector) }),
  };
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('connector selection', () => {
  it('a click on a connector flags it as selected, and a click elsewhere clears the flag', () => {
    const view = mount();

    view.click('dependency:d2');
    expect(view.selectedIds()).toEqual(['dependency:d2']);

    view.click();
    expect(view.selectedIds()).toEqual([]);
  });

  it('focus on a connector selects it, and focus on anything else clears it', () => {
    const view = mount();

    view.focusIn('dependency:d1');
    expect(view.selectedIds()).toEqual(['dependency:d1']);

    view.focusIn();
    expect(view.selectedIds()).toEqual([]);
  });

  it('a connector another plugin draws selects nothing', () => {
    const view = mount();

    view.click('related:x');

    expect(view.selectedIds()).toEqual([]);
  });

  it.each([
    ['ArrowDown', 'dependency:d1', 'dependency:d2'],
    ['ArrowRight', 'dependency:d1', 'dependency:d2'],
    ['ArrowUp', 'dependency:d2', 'dependency:d1'],
    ['ArrowLeft', 'dependency:d2', 'dependency:d1'],
  ])('%s moves focus from %s to %s', (chord, from, to) => {
    const view = mount();

    view.press(chord, from);

    expect(view.focused).toEqual([to]);
  });

  it('an arrow at the last connector keeps focus where it is', () => {
    const view = mount();

    view.press('ArrowDown', 'dependency:d2');

    expect(view.focused).toEqual([]);
  });

  it('arrows and Delete decline a key that did not land on a connector', () => {
    const view = mount();

    expect(view.press('ArrowDown')).toBe(false);
    expect(view.press('Delete')).toBe(false);
    expect(view.press('Delete', 'related:x')).toBe(false);
    expect(view.plugin.all()).toHaveLength(2);
  });
});

describe('removing a Dependency with the keyboard', () => {
  it('removes the focused Dependency, and one undo restores it', () => {
    const view = mount();

    view.press('Delete', 'dependency:d1');
    expect(view.plugin.all().map((d) => d.id)).toEqual(['d2']);

    view.dataset.undo();
    expect(
      view.plugin
        .all()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['d1', 'd2']);
  });

  it('runs beforeDependencyRemove, then removes, then runs dependencyRemove', () => {
    const view = mount();
    const calls: string[] = [];
    view.plugin.on('beforeDependencyRemove', ({ dependency }) => {
      calls.push(`before:${dependency.id}:${view.plugin.all().length}`);
    });
    view.plugin.on('dependencyRemove', ({ dependency }) => {
      calls.push(`after:${dependency.id}:${view.plugin.all().length}`);
    });

    view.press('Delete', 'dependency:d1');

    expect(calls).toEqual(['before:d1:2', 'after:d1:1']);
  });

  it('keeps the Dependency when a handler answers false, and raises no dependencyRemove', () => {
    const view = mount();
    const after: DependencyRemoval[] = [];
    view.plugin.on('beforeDependencyRemove', () => false);
    view.plugin.on('dependencyRemove', (removal) => after.push(removal));

    view.press('Delete', 'dependency:d1');

    expect(view.plugin.all()).toHaveLength(2);
    expect(after).toEqual([]);
  });

  it('waits for an async answer before it removes', async () => {
    const view = mount();
    let answer!: (verdict: void | false) => void;
    view.plugin.on(
      'beforeDependencyRemove',
      () => new Promise<void | false>((resolve) => (answer = resolve)),
    );

    view.press('Delete', 'dependency:d1');
    expect(view.plugin.all()).toHaveLength(2);

    answer(undefined);
    await settled();
    expect(view.plugin.all().map((d) => d.id)).toEqual(['d2']);
  });

  it('keeps the Dependency when an async answer is false', async () => {
    const view = mount();
    view.plugin.on('beforeDependencyRemove', () => Promise.resolve(false as const));

    view.press('Delete', 'dependency:d1');
    await settled();

    expect(view.plugin.all()).toHaveLength(2);
  });

  it('the host remove(id) call raises no event', () => {
    const view = mount();
    const calls: string[] = [];
    view.plugin.on('beforeDependencyRemove', () => {
      calls.push('before');
    });
    view.plugin.on('dependencyRemove', () => {
      calls.push('after');
    });

    view.plugin.remove('d1');

    expect(calls).toEqual([]);
  });

  it('on returns a call that removes the handler', () => {
    const view = mount();
    const calls: string[] = [];
    const off = view.plugin.on('dependencyRemove', () => {
      calls.push('after');
    });
    off();

    view.press('Delete', 'dependency:d1');

    expect(calls).toEqual([]);
  });
});

describe('connector label', () => {
  it('reads "<from> → <to>" from the name Field by default', () => {
    expect(
      mount()
        .connectors()
        .map((c) => c.label),
    ).toEqual(['Task a → Task b', 'Task b → Task c']);
  });

  it('reads the Field labelField names', () => {
    const view = mount({ labelField: 'code' });

    expect(view.connectors().map((c) => c.label)).toEqual(['A → B', 'B → C']);
  });
});
