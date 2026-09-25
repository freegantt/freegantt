// data/ — a fast-check proof that replay and a normal commit agree on whether a write changes
// anything. It does not claim row order, a row's `from`/`to` values, the final stored value, the
// foreign-write judgment, `parentId` (replay drops a missing target), `siblingIndex` (the renumber
// pass owns it), a Field with `editable: 'never'` (replay ignores locks on purpose), a gone id, an
// undeclared key, or the Rollup.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ComputedFieldCannotBeWrittenError, changeSetId, entryId } from '../model/index.js';
import type { ChangeSet, FieldKey } from '../model/index.js';
import { DatasetState } from './dataset-state.js';
import { pluginStoreName } from './plugin-store.js';

const fieldKeys: readonly FieldKey[] = [
  'name',
  'start',
  'end',
  'duration',
  'note',
  'cost',
  'label',
  'tags',
  'shout',
];

const sharedArray = ['x'];

function valuePool(key: FieldKey): fc.Arbitrary<unknown> {
  switch (key) {
    case 'name':
      return fc.constantFrom('a', 'A', '', 'b');
    case 'start':
    case 'end':
      return fc.constantFrom(undefined, 0, 5, 10);
    default:
      return fc.constantFrom(undefined, 0, -0, 1, NaN, '', 'a', sharedArray, ['x'], [], { o: 1 });
  }
}

const fieldWriteArb = fc
  .constantFrom(...fieldKeys)
  .chain((key) => fc.tuple(fc.constant(key), valuePool(key), valuePool(key)));

function buildDataset(): DatasetState {
  return new DatasetState({
    entries: [{ id: 'a', name: 'a', start: 0, end: 20 }],
    timeZone: 'UTC',
    fields: [
      { key: 'note' },
      { key: 'cost', type: 'number' },
      { key: 'label', type: 'text' },
      {
        key: 'tags',
        equals: (from, to) =>
          (from as unknown[] | undefined)?.length === (to as unknown[] | undefined)?.length,
      },
      { key: 'shout', compute: (entry) => String(entry.name).toUpperCase() },
    ],
  });
}

// Core `duration` and the plugin `shout` are computed — neither has a stored home to seed.
const computedKeys = new Set<FieldKey>(['duration', 'shout']);

function seedField(state: DatasetState, key: FieldKey, from: unknown): void {
  if (computedKeys.has(key)) return;
  state.entries.update('a', { [key]: from });
}

function fieldWriteFires(state: DatasetState, key: FieldKey): { seen: boolean } {
  const flag = { seen: false };
  state.on('change', ({ changeSet }) => {
    flag.seen = changeSet.updated.some((row) => row.store === 'entries' && row.field === key);
  });
  return flag;
}

describe('replay and a normal commit agree on whether a write changes anything', () => {
  it('a Field write: replay writes a row exactly when entries.update would', () => {
    fc.assert(
      fc.property(fieldWriteArb, ([key, from, to]) => {
        const commitState = buildDataset();
        seedField(commitState, key, from);
        const commitFlag = fieldWriteFires(commitState, key);
        let commitWrites: boolean;
        try {
          commitState.entries.update('a', { [key]: to });
          commitWrites = commitFlag.seen;
        } catch (error) {
          expect(error).toBeInstanceOf(ComputedFieldCannotBeWrittenError);
          commitWrites = false;
        }

        const replayState = buildDataset();
        seedField(replayState, key, from);
        const current = replayState.entries.get('a')!.read(key);
        const replayFlag = fieldWriteFires(replayState, key);
        const step: ChangeSet = {
          id: changeSetId(0),
          origin: 'undo',
          added: [],
          removed: [],
          updated: [{ store: 'entries', id: entryId('a'), field: key, from: current, to }],
        };
        replayState.replay(step);

        expect(replayFlag.seen).toBe(commitWrites);
      }),
    );
  });

  it('a plugin store row write: replay writes a row exactly when the plugin store would', () => {
    const storeObjectPool = fc.constantFrom(undefined, { n: 1 }, { n: 2 });
    fc.assert(
      fc.property(storeObjectPool, storeObjectPool, (from, to) => {
        const commitState = buildDataset();
        const commitStore = commitState.pluginStores.reserve('demo.lock');
        if (from !== undefined) commitStore.set('a', from);
        let commitWrites = false;
        commitState.on('change', ({ changeSet }) => {
          commitWrites = changeSet.updated.some((row) => row.store !== 'entries');
        });
        if (to === undefined) commitStore.remove('a');
        else commitStore.set('a', to);

        const replayState = buildDataset();
        const replayStore = replayState.pluginStores.reserve('demo.lock');
        if (from !== undefined) replayStore.set('a', from);
        let replayWrites = false;
        replayState.on('change', ({ changeSet }) => {
          replayWrites = changeSet.updated.some((row) => row.store !== 'entries');
        });
        const step: ChangeSet = {
          id: changeSetId(0),
          origin: 'undo',
          added: [],
          removed: [],
          updated: [{ store: pluginStoreName('demo.lock'), id: entryId('a'), from, to }],
        };
        replayState.replay(step);

        expect(replayWrites).toBe(commitWrites);
      }),
    );
  });
});
