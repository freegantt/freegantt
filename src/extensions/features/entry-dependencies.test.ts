import { describe, expect, it } from 'vitest';
import type { PluginContext } from '../../api/gantt.js';
import { Dataset } from '../../api/dataset.js';
import {
  DependencyStoreNotInstalledError,
  DuplicateDependencyIdError,
  EntryNotFoundError,
  UnsupportedLagUnitError,
} from '../../api/index.js';
import { entryId } from '../../model/index.js';
import type { ChangeSet, Duration } from '../../model/index.js';
import { ENTRY_DEPENDENCIES_ID, entryDependencies } from './entry-dependencies.js';
import type { DependencyInput, DependencyType } from './entry-dependencies.js';

const DAYS = (value: number): Duration => ({ value, unit: 'day' });

function dependency(id: string, fromId: string, toId: string, type: DependencyType = 'FS'): DependencyInput {
  return { id, fromId, toId, type, lag: DAYS(0) };
}

/** Entries a, b, c, d. `a` is the root. */
function setup() {
  const plugin = entryDependencies();
  const dataset = new Dataset({
    entries: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `Task ${id}`, start: 0, end: 1 })),
    timeZone: 'UTC',
    plugins: [plugin],
  });
  return { plugin, dataset };
}

/** Runs the view half against a stub that answers only `view.registerConnector`, and returns the
 *  captured provider. No DOM: this plugin calls nothing else. */
function connectorsOf(plugin: ReturnType<typeof entryDependencies>, dataset: Dataset) {
  let provider: (() => readonly unknown[]) | undefined;
  const stub = {
    dataset,
    view: {
      registerConnector(next: () => readonly unknown[]) {
        provider = next;
        return () => {};
      },
    },
  } as unknown as PluginContext;
  plugin.view?.(stub);
  if (!provider) throw new Error('entryDependencies() never called ctx.view.registerConnector');
  return provider();
}

describe('entryDependencies() consumer calls', () => {
  it('replaceAll, add and remove round-trip through all() and predecessorsOf()', () => {
    const { plugin } = setup();

    plugin.replaceAll([dependency('d1', 'a', 'b'), dependency('d2', 'a', 'c', 'SS')]);
    plugin.add(dependency('d3', 'b', 'c', 'FF'));
    plugin.remove('d2');

    expect(plugin.all().map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(plugin.predecessorsOf('c')).toEqual([
      { id: 'd3', fromId: entryId('b'), toId: entryId('c'), type: 'FF', lag: DAYS(0) },
    ]);
  });

  it('keeps a negative lag', () => {
    const { plugin } = setup();

    plugin.add({ ...dependency('d1', 'a', 'b'), lag: DAYS(-2) });

    expect(plugin.all()[0]?.lag).toEqual(DAYS(-2));
  });

  it('add is one undo step', () => {
    const { plugin, dataset } = setup();

    plugin.add(dependency('d1', 'a', 'b'));
    dataset.undo();

    expect(plugin.all()).toEqual([]);
    expect(dataset.canUndo).toBe(false);
  });

  it('replaceAll records no undo step', () => {
    const { plugin, dataset } = setup();

    plugin.replaceAll([dependency('d1', 'a', 'b')]);

    expect(dataset.canUndo).toBe(false);
  });

  it('throws a typed error for a lag that is not in days', () => {
    const { plugin } = setup();
    const weekLag: DependencyInput = { ...dependency('d1', 'a', 'b'), lag: { value: 1, unit: 'week' } };

    expect(() => plugin.add(weekLag)).toThrow(UnsupportedLagUnitError);
    expect(() => plugin.replaceAll([weekLag])).toThrow(UnsupportedLagUnitError);
    expect(plugin.all()).toEqual([]);
  });

  it('replaceAll with an unknown Entry id throws and writes nothing', () => {
    const { plugin, dataset } = setup();
    plugin.replaceAll([dependency('keep', 'a', 'b')]);
    const committed: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      committed.push(changeSet);
    });

    expect(() => plugin.replaceAll([dependency('x', 'a', 'c'), dependency('y', 'a', 'ghost')])).toThrow(
      EntryNotFoundError,
    );
    expect(() => plugin.replaceAll([dependency('x', 'ghost', 'c')])).toThrow(EntryNotFoundError);

    expect(committed).toHaveLength(0);
    expect(plugin.all().map((d) => d.id)).toEqual(['keep']);
  });

  it('refuses a duplicate id', () => {
    const { plugin } = setup();
    plugin.add(dependency('d1', 'a', 'b'));

    expect(() => plugin.add(dependency('d1', 'b', 'c'))).toThrow(DuplicateDependencyIdError);
    expect(() => plugin.replaceAll([dependency('z', 'a', 'b'), dependency('z', 'b', 'c')])).toThrow(
      DuplicateDependencyIdError,
    );
  });

  it('removing an unknown id changes nothing', () => {
    const { plugin, dataset } = setup();

    plugin.remove('ghost');

    expect(dataset.canUndo).toBe(false);
  });
});

describe('removing an Entry', () => {
  it('removes every Dependency that names it, in one change set, and undo restores both', () => {
    const { plugin, dataset } = setup();
    plugin.replaceAll([
      dependency('as-pred', 'b', 'c'),
      dependency('as-succ', 'a', 'b'),
      dependency('other', 'c', 'd'),
    ]);
    const committed: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      committed.push(changeSet);
    });

    dataset.entries.remove('b');

    expect(committed).toHaveLength(1);
    expect(plugin.all().map((d) => d.id)).toEqual(['other']);

    dataset.undo();

    expect(dataset.entries.has('b')).toBe(true);
    expect(
      plugin
        .all()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['as-pred', 'as-succ', 'other']);

    dataset.redo();

    expect(plugin.all().map((d) => d.id)).toEqual(['other']);
  });

  it('removes the Dependencies of a whole removed subtree', () => {
    const plugin = entryDependencies();
    const dataset = new Dataset({
      entries: [
        { id: 'p', name: 'p', start: 0, end: 1 },
        { id: 'k', parentId: 'p', name: 'k', start: 0, end: 1 },
        { id: 'z', name: 'z', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      plugins: [plugin],
    });
    plugin.add(dependency('d1', 'k', 'z'));

    dataset.entries.remove('p');

    expect(plugin.all()).toEqual([]);
  });
});

describe('connectors', () => {
  it.each([
    ['FS', 'end', 'start'],
    ['SS', 'start', 'start'],
    ['FF', 'end', 'end'],
    ['SF', 'start', 'end'],
  ] as const)('%s joins the predecessor %s to the successor %s', (type, fromEdge, toEdge) => {
    const { plugin, dataset } = setup();
    plugin.add(dependency('d1', 'a', 'b', type));

    expect(connectorsOf(plugin, dataset)).toEqual([
      {
        id: 'dependency:d1',
        from: { entryId: entryId('a'), edge: fromEdge },
        to: { entryId: entryId('b'), edge: toEdge },
        label: 'Task a → Task b',
      },
    ]);
  });

  it('answers no connector with no Dependency', () => {
    const { plugin, dataset } = setup();

    expect(connectorsOf(plugin, dataset)).toEqual([]);
  });
});

describe('not installed', () => {
  it('reserves no store and registers no connector without the plugin', () => {
    const dataset = new Dataset({ entries: [{ id: 'a', name: 'a', start: 0, end: 1 }], timeZone: 'UTC' });

    expect(dataset.pluginStore(ENTRY_DEPENDENCIES_ID)).toBeUndefined();
    expect(Object.keys(dataset.pluginStore())).toEqual([]);
  });

  it('refuses a call before a Dataset installs the plugin', () => {
    const plugin = entryDependencies();

    expect(() => plugin.all()).toThrow(DependencyStoreNotInstalledError);
    expect(() => plugin.add(dependency('d1', 'a', 'b'))).toThrow(DependencyStoreNotInstalledError);
  });

  it('installs with no scheduling plugin', () => {
    const { dataset } = setup();

    expect(Object.keys(dataset.pluginStore())).toEqual([ENTRY_DEPENDENCIES_ID]);
  });
});
