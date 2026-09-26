// data/ — undo/redo properties across a sync (#517 amendment). Five checks:
//
// - P1: with no sync, undo and redo write exactly the inverted and the recorded rows, key for key.
//   Row order carries no cross-key meaning (the renumber pass walks each sibling group in index
//   order), so this compares by (store, id, field) key, not by array position.
// - P2: undo-all then redo-all is neutral even when a sync landed in between.
// - P3: after every undo or redo, the tree carries no loop and no dangling parent, and every
//   sibling group stays dense (U3, U4).
// - P4a: a sync never changes canUndo or canRedo.
// - P4b: a sync on a Field no user op in this run touches, and that does not roll up, leaves every
//   user step landing on undo and on redo — `undo()`'s lazy skip of a moot step (f2) never fires,
//   because nothing here ever goes moot.
//
// Reuses `history.property.test.ts`'s op generator (reparent and remove-a-parent-with-children
// included) rather than a second, weaker one.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { invertChangeSet } from './change-set.js';
import {
  applyOp,
  opArb,
  redoAll,
  seedGroups,
  seedSpans,
  snapshotOf,
  undoAll,
} from './history.property.test.js';
import type {
  ChangeSet,
  EntityAdded,
  EntityRemoved,
  EntryId,
  EntryInput,
  FlatEntryInput,
  UpdatedRow,
} from '../model/index.js';

/** A sync target, built from the current store's own `toInput()` list — never from scratch. Every
 *  edit reads past whatever ids the ops before it left, so a run that removed 'b' simply has fewer
 *  rows to rename or reparent, the same shrink a hand-authored `entries.syncAll()` call sees. */
interface SyncSpec {
  readonly renameStep: number; // 0 disables; else rename every row at index i where i % renameStep === 0
  readonly removeStep: number; // 0 disables; else drop every row at index i where i % removeStep === 0
  readonly addCount: number; // fresh root rows to append, 0..2
  readonly reparentStep: number; // 0 disables; else move every Nth surviving row under the first
  readonly reverse: boolean; // list the surviving rows back to front
}

const syncSpecArb: fc.Arbitrary<SyncSpec> = fc.record({
  renameStep: fc.integer({ min: 0, max: 3 }),
  removeStep: fc.integer({ min: 0, max: 4 }),
  addCount: fc.integer({ min: 0, max: 2 }),
  reparentStep: fc.integer({ min: 0, max: 4 }),
  reverse: fc.boolean(),
});

let freshSyncId = 0;

/** Pure: turns the current rows plus a `SyncSpec` into the next server list. The reparent step
 *  always targets the surviving list's own first row, a row this function never itself moves, so it
 *  never proposes a loop — `entries.syncAll()` still gets the final say (I5), and a run that manages to
 *  trip it anyway is skipped like any other refused op. */
function applySyncSpec(current: readonly EntryInput[], spec: SyncSpec): FlatEntryInput[] {
  let rows: EntryInput[] = current.map((entry) => ({ ...entry }));
  if (spec.removeStep > 0) rows = rows.filter((_, i) => i % spec.removeStep !== 0);
  if (spec.renameStep > 0) {
    rows = rows.map((row, i) => (i % spec.renameStep === 0 ? { ...row, name: `${row.name}-server` } : row));
  }
  if (spec.reparentStep > 0 && rows.length > 0) {
    const rootId = rows[0]!.id;
    rows = rows.map((row, i) => (i > 0 && i % spec.reparentStep === 0 ? { ...row, parentId: rootId } : row));
  }
  if (spec.reverse) rows = rows.slice().reverse();
  for (let i = 0; i < spec.addCount; i += 1) {
    freshSyncId += 1;
    rows.push({ id: `sync-new-${freshSyncId}`, name: `sync-new-${freshSyncId}`, start: 0, end: 1 });
  }
  return rows;
}

/** Applies a sync built from the store's own current rows. A run this generator's picks still
 *  manage to make invalid (a loop `applySyncSpec`'s own guard missed) is skipped, the same way
 *  `applyOp` skips a refused op — an invalid attempt is not this property. */
function applySync(state: DatasetState, spec: SyncSpec): void {
  try {
    state.entries.syncAll(
      applySyncSpec(
        state.entries.all.map((entry) => entry.toInput()),
        spec,
      ),
    );
  } catch {
    // not the property — skip
  }
}

/** Every id in `state`, every id's raw `parentId` chain reaches no loop and no missing id, and
 *  every sibling group's `siblingIndex` values are dense from zero (U3, U4). Reads the raw stored
 *  value the same way replay's own soundness rule does — `entry.read('parentId')`, never the
 *  resolved hierarchy answer — since a plugin hierarchy source is not this test's concern. */
function assertTreeSound(state: DatasetState): void {
  const byId = new Map(state.entries.all.map((entry) => [entry.id, entry]));
  const groups = new Map<string, number[]>();

  for (const [id, entry] of byId) {
    const parentId: EntryId | undefined = entry.read('parentId');
    if (parentId !== undefined) expect(byId.has(parentId)).toBe(true); // no dangling parent

    const seen = new Set<EntryId>();
    let cursor: EntryId | undefined = id;
    while (cursor !== undefined) {
      expect(seen.has(cursor)).toBe(false); // no loop
      seen.add(cursor);
      cursor = byId.get(cursor)?.read('parentId');
    }

    const groupKey = parentId ?? '';
    const indexes = groups.get(groupKey) ?? [];
    indexes.push(entry.read('siblingIndex') as number);
    groups.set(groupKey, indexes);
  }

  for (const indexes of groups.values()) {
    const sorted = [...indexes].sort((a, b) => a - b);
    expect(sorted).toEqual(sorted.map((_, i) => i)); // dense, 0..n-1
  }
}

/** Runs `assertTreeSound` after every `'undo'`/`'redo'`-origin write the body makes, not only once
 *  at the end — a step in the middle of an undo-all run is exactly where a dropped `parentId` row
 *  or a skipped renumber would first show up. */
function withTreeSoundnessChecked(state: DatasetState, body: () => void): void {
  const unsubscribe = state.on('change', ({ changeSet }) => {
    if (changeSet.origin === 'undo' || changeSet.origin === 'redo') assertTreeSound(state);
  });
  try {
    body();
  } finally {
    unsubscribe();
  }
}

/** A `ChangeSet.updated` row's identity: `store` and `id` alone for a plugin store row (it carries no
 *  `field`), `store`, `id` and `field` for an entries row. Two rows sharing a key are the same cell —
 *  this is what lets P1 compare `updated` by key instead of by array position. */
function keyOfUpdatedRow(row: UpdatedRow): string {
  return row.store === 'entries'
    ? `${row.store}:${String(row.id)}:${String(row.field)}`
    : `${row.store}:${String(row.id)}`;
}

function keyOfEntityRow(row: EntityAdded | EntityRemoved): string {
  return `${row.store}:${String(row.entity.id)}`;
}

function assertNoDuplicateKey<T>(rows: readonly T[], keyOf: (row: T) => string): void {
  expect(rows.length).toBe(new Set(rows.map(keyOf)).size);
}

/** `updated`, compared key for key rather than by array position (`P1`'s own reason: the renumber
 *  pass walks each sibling group in index order, so cross-key order carries no meaning). An entries
 *  row compares `from`/`to` with the Field's own `valuesEqual`; a plugin store row carries no Field to
 *  ask, so it compares with `Object.is`. */
function assertSameUpdatedRows(
  state: DatasetState,
  actual: readonly UpdatedRow[],
  expected: readonly UpdatedRow[],
): void {
  assertNoDuplicateKey(actual, keyOfUpdatedRow);
  assertNoDuplicateKey(expected, keyOfUpdatedRow);

  const actualByKey = new Map(actual.map((row) => [keyOfUpdatedRow(row), row]));
  const expectedByKey = new Map(expected.map((row) => [keyOfUpdatedRow(row), row]));
  // Both ways: no key actual has that expected lacks, and no key expected has that actual lacks.
  expect(new Set(actualByKey.keys())).toEqual(new Set(expectedByKey.keys()));

  for (const [key, row] of actualByKey) {
    const other = expectedByKey.get(key)!;
    if (row.store === 'entries' && other.store === 'entries') {
      expect(state.fields.valuesEqual(String(row.field), row.from, other.from)).toBe(true);
      expect(state.fields.valuesEqual(String(row.field), row.to, other.to)).toBe(true);
    } else {
      expect(Object.is(row.from, other.from)).toBe(true);
      expect(Object.is(row.to, other.to)).toBe(true);
    }
  }
}

/** `added` or `removed`, compared as an id set plus a by-value entity check (`siblingIndex`
 *  included) — a structural `toEqual`, not `JSON.stringify`: two `StoredEntry` values can hold the
 *  same fields in a different key order (an added entry is built fresh; a removed one is read back
 *  off the live store), and a string comparison would fail on that alone. */
function assertSameEntityRows(
  actual: readonly (EntityAdded | EntityRemoved)[],
  expected: readonly (EntityAdded | EntityRemoved)[],
): void {
  assertNoDuplicateKey(actual, keyOfEntityRow);
  assertNoDuplicateKey(expected, keyOfEntityRow);

  const actualByKey = new Map(actual.map((row) => [keyOfEntityRow(row), row]));
  const expectedByKey = new Map(expected.map((row) => [keyOfEntityRow(row), row]));
  expect(new Set(actualByKey.keys())).toEqual(new Set(expectedByKey.keys()));

  for (const [key, row] of actualByKey) {
    expect(row.entity).toEqual(expectedByKey.get(key)!.entity);
  }
}

function assertSameChangeSetRows(state: DatasetState, actual: ChangeSet, expected: ChangeSet): void {
  assertSameEntityRows(actual.added, expected.added);
  assertSameEntityRows(actual.removed, expected.removed);
  assertSameUpdatedRows(state, actual.updated, expected.updated);
}

describe('undo and redo across a sync — properties (#517 amendment)', () => {
  it('P1: with no sync, undo and redo write exactly the inverted and the recorded rows, key for key', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 20 }), (ops) => {
        const state = new DatasetState({ timeZone: 'UTC', entries: seedGroups });
        const recorded: ChangeSet[] = [];
        const undone: ChangeSet[] = [];
        const redone: ChangeSet[] = [];
        state.on('change', ({ changeSet }) => {
          if (changeSet.origin === 'user') recorded.push(changeSet);
          else if (changeSet.origin === 'undo') undone.push(changeSet);
          else if (changeSet.origin === 'redo') redone.push(changeSet);
        });

        for (const op of ops) applyOp(state, op);
        undoAll(state);
        redoAll(state);

        expect(undone.length).toBe(recorded.length);
        for (const [i, step] of undone.entries()) {
          assertSameChangeSetRows(state, step, invertChangeSet(recorded[recorded.length - 1 - i]!));
        }
        expect(redone.length).toBe(recorded.length);
        for (const [i, step] of redone.entries()) {
          assertSameChangeSetRows(state, step, recorded[i]!);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('P2: undo-all then redo-all is neutral, even with a sync landing between the ops', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof({ arbitrary: opArb, weight: 3 }, { arbitrary: syncSpecArb, weight: 1 }), {
          minLength: 1,
          maxLength: 25,
        }),
        (steps) => {
          const state = new DatasetState({ timeZone: 'UTC', entries: seedSpans });
          for (const step of steps) {
            if ('kind' in step) applyOp(state, step);
            else applySync(state, step);
          }

          const beforeUndo = snapshotOf(state);
          undoAll(state);
          redoAll(state);
          expect(snapshotOf(state)).toBe(beforeUndo);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('P3: the tree stays sound and every sibling group stays dense after each undo and each redo', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof({ arbitrary: opArb, weight: 3 }, { arbitrary: syncSpecArb, weight: 1 }), {
          minLength: 1,
          maxLength: 25,
        }),
        (steps) => {
          const state = new DatasetState({ timeZone: 'UTC', entries: seedGroups });
          for (const step of steps) {
            if ('kind' in step) applyOp(state, step);
            else applySync(state, step);
          }

          withTreeSoundnessChecked(state, () => {
            undoAll(state);
            redoAll(state);
          });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('P4a: a sync never changes canUndo or canRedo', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 15 }), syncSpecArb, (ops, spec) => {
        const state = new DatasetState({ timeZone: 'UTC', entries: seedSpans });
        for (const op of ops) applyOp(state, op);

        const canUndoBefore = state.canUndo;
        const canRedoBefore = state.canRedo;
        applySync(state, spec);

        expect(state.canUndo).toBe(canUndoBefore);
        expect(state.canRedo).toBe(canRedoBefore);
      }),
      { numRuns: 40 },
    );
  });

  it('P4b: a sync on an unrelated, non-rolling Field leaves every user step landing on undo and on redo', () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 15 }),
        fc.string({ maxLength: 12 }),
        (ops, note) => {
          // 'note' is declared but outside opArb's own Field set (name, start, end, parentId) and
          // carries no rollUp, so a sync writing only it can never make a recorded step moot (f2).
          const state = new DatasetState({
            timeZone: 'UTC',
            entries: seedSpans,
            fields: [{ key: 'note' }],
          });
          let recordedCount = 0;
          let undoLandings = 0;
          let redoLandings = 0;
          state.on('change', ({ changeSet }) => {
            if (changeSet.origin === 'user') recordedCount += 1;
            else if (changeSet.origin === 'undo') undoLandings += 1;
            else if (changeSet.origin === 'redo') redoLandings += 1;
          });

          for (const op of ops) applyOp(state, op);
          if (recordedCount === 0) return; // nothing recorded — not this property

          // Same ids, same parents, same order as the store already holds — only 'note' changes.
          state.entries.syncAll(state.entries.all.map((entry) => ({ ...entry.toInput(), props: { note } })));

          undoAll(state);
          expect(undoLandings).toBe(recordedCount);
          redoAll(state);
          expect(redoLandings).toBe(recordedCount);
          expect(redoLandings).toBe(undoLandings); // undo-all and redo-all take the same number of clicks
        },
      ),
      { numRuns: 40 },
    );
  });
});
