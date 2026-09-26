// data/ — readBatchAfterDelta reads the committed rows plus a delta as one batch. Pure: build the
// committed state with readEntryBatch (the way `load` and `syncAll` place a list), then lay a delta
// on top and check what comes back — no store, no transaction.

import { describe, expect, it } from 'vitest';
import { DuplicateEntryIdError, entryId, EntryNotFoundError, ParentCycleError } from '../model/index.js';
import type { EntryId, FlatEntryInput, StoredEntry } from '../model/index.js';
import type { EntryDelta } from '../model/index.js';
import { readBatchAfterDelta } from './entry-delta.js';
import type { CommittedEntries } from './entry-delta.js';
import { readEntryBatch } from './entry-batch.js';
import type { EntryReadContext } from './entry-reader.js';
import { FieldRegistry } from './fields/field-registry.js';
import { storedParentSource } from './hierarchy-source.js';
import type { SiblingGroupKey } from './sibling-order.js';

const context: EntryReadContext = { timeZone: 'UTC', dateOnlyEnd: 'inclusive' };

function committedFrom(inputs: readonly FlatEntryInput[], registry: FieldRegistry): CommittedEntries {
  const { entries, parents } = readEntryBatch(inputs, context, registry, storedParentSource, 'test');
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byGroup = new Map<SiblingGroupKey, EntryId[]>();
  for (const entry of entries) {
    const group = parents.get(entry.id);
    const siblings = byGroup.get(group);
    if (siblings) siblings.push(entry.id);
    else byGroup.set(group, [entry.id]);
  }
  return { byId, parents, siblingIdsOf: (group) => byGroup.get(group) ?? [] };
}

function apply(
  committed: CommittedEntries,
  delta: EntryDelta,
  registry: FieldRegistry,
  operation = 'entries.syncChanges',
) {
  return readBatchAfterDelta(committed, delta, context, registry, storedParentSource, operation);
}

function entryOf(entries: readonly StoredEntry[], id: string): StoredEntry | undefined {
  return entries.find((entry) => entry.id === entryId(id));
}

const row = (id: string, extra: Partial<FlatEntryInput> = {}): FlatEntryInput => ({
  id,
  name: id,
  start: 0,
  end: 1,
  ...extra,
});

describe('readBatchAfterDelta', () => {
  it('keeps every key a kept row leaves out, and appends a new row', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'note' }] });
    const committed = committedFrom([row('a', { note: 'hi' } as Partial<FlatEntryInput>)], registry);

    const batch = apply(committed, { upsert: [row('a', { name: 'Renamed' }), row('n1')] }, registry);

    const a = entryOf(batch.entries, 'a');
    expect(a?.name).toBe('Renamed');
    expect(a?.props['note']).toBe('hi');
    expect(entryOf(batch.entries, 'n1')).toBeDefined();
    expect(batch.entries).toHaveLength(2);
  });

  it('ignores an unknown remove id, and takes a removed parent’s whole subtree', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom(
      [row('p'), row('c1', { parentId: 'p' }), row('c2', { parentId: 'c1' })],
      registry,
    );

    const batch = apply(committed, { remove: ['ghost', 'p'] }, registry);

    expect(batch.entries).toHaveLength(0);
  });

  it('stops the removal walk at an upserted row, and it throws for its gone parent', () => {
    const registry = new FieldRegistry();
    const directParent = committedFrom([row('p'), row('c', { parentId: 'p' })], registry);
    expect(() =>
      apply(directParent, { upsert: [row('c', { name: 'Kept' })], remove: ['p'] }, registry),
    ).toThrow(EntryNotFoundError);

    const grandparent = committedFrom(
      [row('p'), row('m', { parentId: 'p' }), row('c', { parentId: 'm' })],
      registry,
    );
    expect(() =>
      apply(grandparent, { upsert: [row('c', { name: 'Kept' })], remove: ['p'] }, registry),
    ).toThrow(EntryNotFoundError);
  });

  it('is sound for a child whose parent is new in the same delta, listed first', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom([], registry);

    const batch = apply(
      committed,
      { upsert: [row('child', { parentId: 'parent' }), row('parent')] },
      registry,
    );

    expect(entryOf(batch.entries, 'child')?.parentId).toBe(entryId('parent'));
  });

  it('keeps a child an upsert reparents out of a removed subtree', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom([row('p'), row('c', { parentId: 'p' })], registry);

    const batch = apply(committed, { upsert: [row('c', { parentId: undefined })], remove: ['p'] }, registry);

    expect(entryOf(batch.entries, 'c')?.parentId).toBeUndefined();
    expect(batch.entries).toHaveLength(1);
  });

  it('throws DuplicateEntryIdError, kind duplicate-in-list, for one id named twice in upsert', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom([], registry);

    let caught: unknown;
    try {
      apply(committed, { upsert: [row('a'), row('a')] }, registry);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DuplicateEntryIdError);
    expect((caught as DuplicateEntryIdError).entryId).toBe(entryId('a'));
  });

  it('throws DuplicateEntryIdError, kind upsert-and-remove, for an id in both lists', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom([row('a')], registry);

    expect(() => apply(committed, { upsert: [row('a')], remove: ['a'] }, registry)).toThrow(
      'entries.syncChanges: the delta both upserts and removes id "a". Name each id in one list only.',
    );
  });

  it('throws ParentCycleError for a loop the delta creates', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom([row('a'), row('b', { parentId: 'a' })], registry);

    expect(() => apply(committed, { upsert: [row('a', { parentId: 'b' })] }, registry)).toThrow(
      ParentCycleError,
    );
  });

  it('placement: a kept row keeps its siblingIndex; a reparented row lands last in its new group', () => {
    const registry = new FieldRegistry();
    const committed = committedFrom(
      [row('p1'), row('p2'), row('a', { parentId: 'p1' }), row('b', { parentId: 'p1' })],
      registry,
    );

    const batch = apply(committed, { upsert: [row('a', { parentId: 'p2' })] }, registry);

    expect(entryOf(batch.entries, 'b')?.siblingIndex).toBe(0);
    expect(entryOf(batch.entries, 'a')?.siblingIndex).toBe(0);
  });
});
