// data/ — the equivalence property for entries.syncChanges(delta): for any valid delta,
// syncChanges(delta) lands the same data, in the same order, and commits the same net effect as
// syncAll(a whole list built by laying delta over the current entries). Beside
// entry-store.sync-all.property.test.ts's own contract property, at the entries.syncChanges() call
// site. Seed copied from that file, not imported — this file's oracle stays independent of `src/`.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import type { ChangeSet, EntryDelta, FieldUpdated, FlatEntryInput } from '../model/index.js';

const parents = ['m1', 'm2'] as const;
const childIds = ['c1', 'c2', 'c3', 'c4'] as const;
const newIds = ['n1', 'n2'] as const;
const seedIds = [...parents, ...childIds] as const;
const originalParentOf: Readonly<Record<string, string>> = { c1: 'm1', c2: 'm1', c3: 'm2', c4: 'm2' };

interface Props {
  readonly cost?: number;
  readonly note?: string | undefined;
}

const seedNoteOf: Readonly<Record<string, string>> = { m1: 'seed-m1', c1: 'seed-c1' };

const seedInputs: readonly FlatEntryInput<Props>[] = [
  { id: 'm1', name: 'm1', start: 0, end: 1, cost: 10, props: { note: seedNoteOf['m1'] } },
  { id: 'm2', name: 'm2', start: 0, end: 1, cost: 10 },
  { id: 'c1', name: 'c1', parentId: 'm1', start: 0, end: 1, cost: 10, props: { note: seedNoteOf['c1'] } },
  { id: 'c2', name: 'c2', parentId: 'm1', start: 0, end: 1, cost: 10 },
  { id: 'c3', name: 'c3', parentId: 'm2', start: 0, end: 1, cost: 10 },
  { id: 'c4', name: 'c4', parentId: 'm2', start: 0, end: 1, cost: 10 },
];

function seededDataset(): DatasetState {
  return new DatasetState({
    entries: seedInputs,
    timeZone: 'UTC',
    fields: [{ key: 'note' }, { key: 'cost', type: 'number', rollUp: 'sum' }],
  });
}

// --- Generator ------------------------------------------------------------------------------

type ParentChoice = 'm1' | 'm2' | 'root' | 'omit';
type NoteChoice = 'set' | 'clear' | 'omit';
type CostChoice = 'set' | 'omit';

interface KeptEdit {
  readonly rename: boolean;
  readonly note: NoteChoice;
  readonly cost: CostChoice;
  readonly parentTarget: ParentChoice;
}

interface DeltaParams {
  readonly touchedIds: readonly string[];
  readonly editsById: Readonly<Record<string, KeptEdit>>;
  readonly newOrder: readonly string[];
  readonly newParentById: Readonly<Record<string, string>>;
  readonly removeIds: readonly string[];
}

const keptEditArbitrary: fc.Arbitrary<KeptEdit> = fc.record({
  rename: fc.boolean(),
  note: fc.constantFrom<NoteChoice>('set', 'clear', 'omit'),
  cost: fc.constantFrom<CostChoice>('set', 'omit'),
  parentTarget: fc.constantFrom<ParentChoice>('m1', 'm2', 'root', 'omit'),
});

const deltaArbitrary: fc.Arbitrary<DeltaParams> = fc.record({
  touchedIds: fc.shuffledSubarray([...seedIds]),
  editsById: fc.dictionary(fc.constantFrom(...seedIds), keptEditArbitrary),
  newOrder: fc.shuffledSubarray([...newIds]),
  newParentById: fc.dictionary(fc.constantFrom(...newIds), fc.constantFrom('root', 'm1', 'm2', 'n1', 'n2')),
  removeIds: fc.shuffledSubarray([...seedIds, 'ghost']),
});

function resolvedParentOf(id: string, params: DeltaParams): string | undefined {
  const edit = params.editsById[id];
  if (edit && edit.parentTarget !== 'omit') {
    return edit.parentTarget === 'root' ? undefined : edit.parentTarget;
  }
  return originalParentOf[id];
}

function newParentOf(id: string, params: DeltaParams): string | undefined {
  const target = params.newParentById[id] ?? 'root';
  if (target === 'root') return undefined;
  if (target === id) return undefined; // a new id never parents itself
  return target;
}

/** Discards a delta the batch's own tree check would refuse: an upserted id whose resolved parent
 *  falls inside a subtree the same delta removes. The removal walk never removes an upserted id, so
 *  that id would be left pointing at a parent that no longer exists. */
function isDeltaSound(params: DeltaParams): boolean {
  const removeSet = new Set(params.removeIds.filter((id) => id !== 'ghost'));
  const upsertedIds = new Set(params.touchedIds.filter((id) => !removeSet.has(id)));

  const childrenOf = new Map<string, string[]>();
  for (const id of seedIds) {
    const parent = resolvedParentOf(id, params);
    if (parent !== undefined) {
      const siblings = childrenOf.get(parent);
      if (siblings) siblings.push(id);
      else childrenOf.set(parent, [id]);
    }
  }

  const removedClosure = new Set<string>();
  const queue = [...removeSet];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (removedClosure.has(id) || upsertedIds.has(id)) continue;
    removedClosure.add(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }

  for (const id of upsertedIds) {
    const parent = resolvedParentOf(id, params);
    if (parent !== undefined && removedClosure.has(parent)) return false;
  }

  // A new id's own parent target must itself exist by commit: a removed seed id, or a new id this
  // same delta never adds, both leave it pointing at nothing.
  const newIdSet = new Set(params.newOrder);
  for (const id of params.newOrder) {
    const parent = newParentOf(id, params);
    if (parent === undefined) continue;
    if (seedIds.includes(parent as (typeof seedIds)[number])) {
      if (removedClosure.has(parent)) return false;
    } else if (!newIdSet.has(parent)) {
      return false;
    }
  }

  // A reparent target the generator names freely (any seed id to any other, and either new id to
  // the other) can loop a chain back onto itself — self-parenting included. Walk each id's
  // resolved-parent chain and reject a cycle.
  const parentOfAny = (id: string): string | undefined =>
    seedIds.includes(id as (typeof seedIds)[number]) ? resolvedParentOf(id, params) : newParentOf(id, params);
  for (const id of [...seedIds, ...params.newOrder]) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (seen.has(current)) return false;
      seen.add(current);
      current = parentOfAny(current);
    }
  }
  return true;
}

function buildDelta(params: DeltaParams): EntryDelta<Props> {
  const removeSet = new Set(params.removeIds);
  const upsert: FlatEntryInput<Props>[] = [];

  for (const id of params.touchedIds) {
    if (removeSet.has(id)) continue; // never name an id in both lists
    const edit = params.editsById[id];
    if (!edit) continue;
    const row: FlatEntryInput<Props> = { id };
    if (edit.rename) row.name = `${id}-renamed`;
    if (edit.parentTarget !== 'omit')
      row.parentId = edit.parentTarget === 'root' ? undefined : edit.parentTarget;
    if (edit.cost === 'set') row.cost = 999;
    if (edit.note !== 'omit') row.props = { note: edit.note === 'set' ? `${id}-fresh` : undefined };
    upsert.push(row);
  }

  for (const id of params.newOrder) {
    upsert.push({
      id,
      name: id,
      start: 0,
      end: 1,
      cost: 5,
      parentId: newParentOf(id, params),
      props: { note: `${id}-note` },
    });
  }

  return { upsert, remove: [...removeSet] };
}

// --- Oracle -----------------------------------------------------------------------------------

interface OracleRow {
  id: string;
  name?: string | undefined;
  parentId?: string | undefined;
  start?: number | undefined;
  end?: number | undefined;
  props: Props;
}

/** `syncAll`'s own view of what `delta` should leave, built without touching anything `src/`
 *  exports: read the current rows, lay each upsert row on top key by key (a kept id moves to the end
 *  on a parent change, a new id appends), then drop each removed id with its subtree. */
function overlayDelta(state: DatasetState, delta: EntryDelta<Props>): FlatEntryInput<Props>[] {
  let rows: OracleRow[] = state.entries.all.map((entry) => {
    const input = entry.toInput();
    return {
      id: String(input.id),
      name: input.name,
      parentId: input.parentId === undefined ? undefined : String(input.parentId),
      start: input.start as unknown as number | undefined,
      end: input.end as unknown as number | undefined,
      props: { ...(input.props as Props) },
    };
  });

  const upsertRows = delta.upsert ?? [];
  const removeIds = new Set((delta.remove ?? []).map(String));

  for (const upsertRow of upsertRows) {
    const id = String(upsertRow.id);
    const index = rows.findIndex((row) => row.id === id);
    const flat = upsertRow as unknown as Record<string, unknown>;

    if (index >= 0) {
      const existing = rows[index]!;
      const merged: OracleRow = { ...existing, props: { ...existing.props } };
      if ('name' in flat) merged.name = flat['name'] as string | undefined;
      if ('parentId' in flat) merged.parentId = flat['parentId'] as string | undefined;
      if ('start' in flat) merged.start = flat['start'] as number | undefined;
      if ('end' in flat) merged.end = flat['end'] as number | undefined;
      if ('cost' in flat) merged.props = { ...merged.props, cost: flat['cost'] as number };
      if (upsertRow.props && 'note' in upsertRow.props) {
        merged.props = { ...merged.props, note: upsertRow.props.note };
      }
      const parentChanged = merged.parentId !== existing.parentId;
      if (parentChanged) {
        rows = [...rows.slice(0, index), ...rows.slice(index + 1), merged];
      } else {
        rows = [...rows.slice(0, index), merged, ...rows.slice(index + 1)];
      }
    } else {
      rows.push({
        id,
        name: flat['name'] as string | undefined,
        parentId: flat['parentId'] as string | undefined,
        start: flat['start'] as number | undefined,
        end: flat['end'] as number | undefined,
        props: {
          ...(upsertRow.props ?? {}),
          ...('cost' in flat ? { cost: flat['cost'] as number } : {}),
        },
      });
    }
  }

  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId !== undefined) {
      const siblings = childrenOf.get(row.parentId);
      if (siblings) siblings.push(row.id);
      else childrenOf.set(row.parentId, [row.id]);
    }
  }
  const removedClosure = new Set<string>();
  const queue = [...removeIds].filter((id) => rows.some((row) => row.id === id));
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (removedClosure.has(id)) continue;
    removedClosure.add(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  rows = rows.filter((row) => !removedClosure.has(row.id));

  return rows.map((row) => ({
    id: row.id,
    ...(row.name !== undefined ? { name: row.name } : {}),
    ...(row.parentId !== undefined ? { parentId: row.parentId } : {}),
    ...(row.start !== undefined ? { start: row.start } : {}),
    ...(row.end !== undefined ? { end: row.end } : {}),
    props: row.props,
  }));
}

// --- Comparison -----------------------------------------------------------------------------

function declaredNonComputeFields(state: DatasetState) {
  return state.fields.all.filter((field) => !('compute' in field));
}

/** Same ids in the same order, the same tree, and the same value for every declared, non-compute
 *  Field. What "≡" means for the shape two datasets hold. */
function expectSameShape(a: DatasetState, b: DatasetState): void {
  expect(a.entries.all.map((entry) => entry.id)).toEqual(b.entries.all.map((entry) => entry.id));

  const fields = declaredNonComputeFields(a);
  for (const entry of a.entries.all) {
    const other = b.entries.get(entry.id)!;
    expect(other.parent()?.id).toEqual(entry.parent()?.id);
    for (const field of fields) {
      expect(a.fields.valuesEqual(String(field.key), entry.read(field.key), other.read(field.key))).toBe(
        true,
      );
    }
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return '∅';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

interface ChangeSummary {
  readonly added: ReadonlySet<string>;
  readonly removed: ReadonlySet<string>;
  readonly updated: readonly string[];
}

function summarize(changeSet: ChangeSet | undefined): ChangeSummary {
  if (!changeSet) return { added: new Set(), removed: new Set(), updated: [] };
  return {
    added: new Set(changeSet.added.map((row) => String(row.entity.id))),
    removed: new Set(changeSet.removed.map((row) => String(row.entity.id))),
    updated: changeSet.updated
      .filter((row): row is FieldUpdated => row.store === 'entries')
      .map((row) => `${row.id}|${String(row.field)}|${formatValue(row.from)}|${formatValue(row.to)}`)
      .sort(),
  };
}

function captureChange(state: DatasetState): { current(): ChangeSet | undefined } {
  let seen: ChangeSet | undefined;
  state.on('change', ({ changeSet }) => {
    seen = changeSet;
  });
  return { current: () => seen };
}

describe('entries.syncChanges ≡ entries.syncAll(overlayDelta(...)) (the equivalence property)', () => {
  it('lands the same order, values and tree, and commits the same net effect', () => {
    fc.assert(
      fc.property(deltaArbitrary.filter(isDeltaSound), (params) => {
        const delta = buildDelta(params);

        const synced = seededDataset();
        const syncedChange = captureChange(synced);
        const syncedCanUndoBefore = synced.canUndo;
        const syncedCanRedoBefore = synced.canRedo;
        synced.entries.syncChanges(delta);

        const oracleSeed = seededDataset();
        const target = overlayDelta(oracleSeed, delta);
        const oracle = seededDataset();
        const oracleChange = captureChange(oracle);
        const oracleCanUndoBefore = oracle.canUndo;
        const oracleCanRedoBefore = oracle.canRedo;
        oracle.entries.syncAll(target);

        expectSameShape(synced, oracle);

        const syncedChangeSet = syncedChange.current();
        const oracleChangeSet = oracleChange.current();
        expect(syncedChangeSet !== undefined).toBe(oracleChangeSet !== undefined);
        expect(summarize(syncedChangeSet)).toEqual(summarize(oracleChangeSet));

        expect(synced.canUndo).toBe(syncedCanUndoBefore);
        expect(synced.canRedo).toBe(syncedCanRedoBefore);
        expect(oracle.canUndo).toBe(oracleCanUndoBefore);
        expect(oracle.canRedo).toBe(oracleCanRedoBefore);
      }),
      { numRuns: 100 },
    );
  });

  it('applying the same delta twice commits nothing the second time', () => {
    fc.assert(
      fc.property(deltaArbitrary.filter(isDeltaSound), (params) => {
        const delta = buildDelta(params);
        const state = seededDataset();
        state.entries.syncChanges(delta);

        let fired = false;
        state.on('change', () => {
          fired = true;
        });
        state.entries.syncChanges(delta);

        expect(fired).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});
