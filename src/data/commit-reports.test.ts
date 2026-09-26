// data/ — A report about a commit fires once that commit lands. An `error` handler that writes
// starts a commit of its own.

import { describe, expect, it } from 'vitest';
import type { ChangeSet, EntryInput, ErrorReport, PluginId } from '../model/index.js';
import { entryId } from '../model/index.js';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';

const LOCK: PluginId = 'demo.lock';
const LOCK_STORE = pluginStoreName(LOCK);

type HandlerWrite = 'a plugin-store row' | 'an entry';

const seed: EntryInput[] = [
  { id: 'a', name: 'a', start: 0, end: 1 },
  { id: 'b', name: 'b', start: 10, end: 20 },
  { id: 'x', name: 'x', start: 0, end: 1 },
];

function newState(entries: readonly EntryInput[] = seed): {
  state: DatasetState;
  changes: ChangeSet[];
} {
  const state = new DatasetState({ entries, timeZone: 'UTC' });
  state.pluginStores.reserve(LOCK);
  const changes: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    changes.push(changeSet);
  });
  return { state, changes };
}

/** Pushes every report the state raises, and writes only on the first one — a plugin-store row on
 *  `x`, or `entries.update('x', …)`. */
function writeOnFirstReport(state: DatasetState, write: HandlerWrite): ErrorReport[] {
  const reports: ErrorReport[] = [];
  let written = false;
  state.on('error', (report) => {
    reports.push(report);
    if (written) return;
    written = true;
    if (write === 'a plugin-store row') {
      state.pluginStores.reserve<{ locked: true }>(LOCK).set('x', { locked: true });
    } else {
      state.entries.update('x', { name: 'from the handler' });
    }
  });
  return reports;
}

function rowKeys(changeSet: ChangeSet): (string | readonly [string, string])[] {
  return changeSet.updated.map((row) =>
    row.store === 'entries' ? [String(row.id), row.field] : String(row.store),
  );
}

describe.each([
  {
    name: 'the Rollup overwrote a proposal',
    code: 'derived-values-dropped',
    run: (state: DatasetState) => {
      state.transaction(() => {
        state.entries.update('b', { start: 30, end: 40 });
        state.entries.update('a', { parentId: 'b' });
      });
    },
  },
  {
    name: 'an added parent dropped its own value',
    code: 'derived-values-dropped',
    run: (state: DatasetState) => {
      state.transaction(() => {
        state.entries.add({ id: 'q', name: 'q', start: 0, end: 1 });
        state.entries.add({ id: 'k', parentId: 'q', name: 'k' });
      });
    },
  },
])('a report about a commit fires once that commit lands: $name', ({ code, run }) => {
  it.each(['a plugin-store row', 'an entry'] as const)(
    '%s the error handler writes lands in its own later commit',
    (write) => {
      const { state, changes } = newState();
      const reports = writeOnFirstReport(state, write);

      run(state);

      expect(reports[0]?.code).toBe(code);
      expect(changes).toHaveLength(2);

      const expected: string | readonly [string, string] =
        write === 'a plugin-store row' ? String(LOCK_STORE) : [String(entryId('x')), 'name'];
      expect(rowKeys(changes[0]!)).not.toContainEqual(expected);
      expect(rowKeys(changes[1]!)).toEqual([expected]);

      if (write === 'a plugin-store row') {
        expect(state.pluginStores.reserve<{ locked: true }>(LOCK).get('x')).toEqual({ locked: true });
      } else {
        expect(state.entries.get('x')!.name).toBe('from the handler');
      }
    },
  );
});

describe('a report about a commit', () => {
  it('an entry write from the error handler leaves the reported commit whole', () => {
    const { state } = newState();
    const lock = state.pluginStores.reserve<{ locked: true }>(LOCK);
    let written = false;
    state.on('error', () => {
      if (written) return;
      written = true;
      state.entries.update('x', { name: 'from the handler' });
    });

    state.transaction(() => {
      lock.set('b', { locked: true });
      state.entries.update('b', { start: 30, end: 40 });
      state.entries.update('a', { parentId: 'b' });
    });

    expect(lock.get('b')).toEqual({ locked: true });
    expect(state.entries.get('a')!.read('siblingIndex')).toBe(0);
    expect(
      state.entries.all
        .filter((entry) => entry.read('parentId') === undefined)
        .map((entry) => entry.read('siblingIndex')),
    ).toEqual([0, 1]);
  });

  it('a commit that folds to nothing still raises its report, and a handler write commits alone', () => {
    const { state, changes } = newState([
      { id: 'p', name: 'p', start: 0, end: 1 },
      { id: 'c', parentId: 'p', name: 'c', start: 0, end: 1 },
      { id: 'x', name: 'x', start: 0, end: 1 },
    ]);
    const reports = writeOnFirstReport(state, 'an entry');

    state.transaction(() => {
      state.entries.update('c', { parentId: undefined });
      state.entries.update('p', { start: 5, end: 6 });
      state.entries.update('c', { parentId: 'p' });
    });

    expect(reports[0]?.code).toBe('derived-values-dropped');
    expect(changes.map(rowKeys)).toEqual([[[String(entryId('x')), 'name']]]);
  });

  it('a vetoed commit raises its refusal and no report about the values it would have dropped', () => {
    const { state } = newState();
    const reports: ErrorReport[] = [];
    state.on('error', (report) => {
      reports.push(report);
    });
    state.on('beforeChange', () => false);

    expect(() => {
      state.transaction(() => {
        state.entries.update('b', { start: 30, end: 40 });
        state.entries.update('a', { parentId: 'b' });
      });
    }).toThrow();

    expect(reports.map((report) => report.code)).toEqual(['mutation-cancelled']);
  });
});
