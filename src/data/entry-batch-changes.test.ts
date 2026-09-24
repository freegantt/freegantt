// data/ — the pure diff behind entries.sync() (#517): `changesToMatchBatch` reads two batches and
// hands back the rows that turn one into the other. No store, no transaction, no commit — those are
// entry-store.ts's job, exercised in entry-store.sync.test.ts once entries.sync() exists.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { EntryId, FlatEntryInput, StoredEntry } from '../model/index.js';
import { entryId } from '../model/index.js';
import { changesToMatchBatch } from './entry-batch-changes.js';
import { readEntryBatch } from './entry-batch.js';
import { createFieldAccess, readField, writeOntoEntry } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';
import { storedParentSource } from './hierarchy-source.js';

const context = { timeZone: 'UTC', dateOnlyEnd: 'inclusive' as const };

/** Places a list the same way `load` and sync both do — `readEntryBatch`, no store involved — and
 *  hands back both shapes a diff needs: the id-keyed map `changesToMatchBatch`'s `committed` takes,
 *  and the list its `target` takes. */
function place(
  inputs: readonly FlatEntryInput[],
  registry: FieldRegistry,
): { readonly byId: ReadonlyMap<EntryId, StoredEntry>; readonly list: readonly StoredEntry[] } {
  const { entries } = readEntryBatch(inputs, context, registry, storedParentSource, 'test');
  return { byId: new Map(entries.map((entry) => [entry.id, entry])), list: entries };
}

function accessFor(registry: FieldRegistry) {
  return createFieldAccess({ fields: registry, timeZone: 'UTC' });
}

const row = (id: string, extra: Partial<FlatEntryInput> = {}): FlatEntryInput => ({
  id,
  name: id,
  start: 0,
  end: 1,
  ...extra,
});

describe('changesToMatchBatch', () => {
  it('an id in target but not committed is added, with no removed or updated rows', () => {
    const registry = new FieldRegistry();
    const committed = place([row('a')], registry);
    const target = place([row('a'), row('b')], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.added.map((row) => row.entity.id)).toEqual([entryId('b')]);
    expect(changes.removed).toEqual([]);
    expect(changes.updated).toEqual([]);
  });

  it('an id in committed but not target is removed, carrying the committed entity', () => {
    const registry = new FieldRegistry();
    const committed = place([row('a'), row('b')], registry);
    const target = place([row('a')], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.removed).toEqual([{ store: 'entries', entity: committed.byId.get(entryId('b')) }]);
    expect(changes.added).toEqual([]);
    expect(changes.updated).toEqual([]);
  });

  it('a kept id whose Field value changed gets one row for that Field', () => {
    const registry = new FieldRegistry();
    const committed = place([row('a', { name: 'Old' })], registry);
    const target = place([row('a', { name: 'New' })], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toEqual([
      { store: 'entries', id: entryId('a'), field: 'name', from: 'Old', to: 'New' },
    ]);
  });

  it('a key a kept entry drops gives a row with to: undefined', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'note' }] });
    const committed = place([row('a', { note: 'hi' } as Partial<FlatEntryInput>)], registry);
    const target = place([row('a')], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toEqual([
      { store: 'entries', id: entryId('a'), field: 'note', from: 'hi', to: undefined },
    ]);
  });

  it('a compute Field makes no row, even though its computed value differs', () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'label', compute: (entry) => String(entry.name) }],
    });
    const committed = place([row('a', { name: 'Old' })], registry);
    const target = place([row('a', { name: 'New' })], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toEqual([
      { store: 'entries', id: entryId('a'), field: 'name', from: 'Old', to: 'New' },
    ]);
  });

  it("a Field's own equals suppresses a row its default Object.is comparison would make", () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'tags', equals: () => true }],
    });
    const committed = place([row('a', { tags: ['x'] } as Partial<FlatEntryInput>)], registry);
    const target = place([row('a', { tags: ['y'] } as Partial<FlatEntryInput>)], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toEqual([]);
  });

  it('equal Instants make no row, even when the input strings differ', () => {
    const registry = new FieldRegistry();
    const committed = place(
      [row('a', { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' })],
      registry,
    );
    const target = place(
      [row('a', { start: '2026-01-01T01:00:00+01:00', end: '2026-01-02T01:00:00+01:00' })],
      registry,
    );

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toEqual([]);
  });

  it('a changed parentId gets its own row', () => {
    const registry = new FieldRegistry();
    const committed = place([row('p1'), row('p2'), row('a', { parentId: 'p1' })], registry);
    const target = place([row('p1'), row('p2'), row('a', { parentId: 'p2' })], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toContainEqual({
      store: 'entries',
      id: entryId('a'),
      field: 'parentId',
      from: entryId('p1'),
      to: entryId('p2'),
    });
  });

  it('a reorder gets its own siblingIndex row', () => {
    const registry = new FieldRegistry();
    const committed = place([row('a'), row('b')], registry);
    const target = place([row('b'), row('a')], registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes.updated).toContainEqual({
      store: 'entries',
      id: entryId('a'),
      field: 'siblingIndex',
      from: 0,
      to: 1,
    });
    expect(changes.updated).toContainEqual({
      store: 'entries',
      id: entryId('b'),
      field: 'siblingIndex',
      from: 1,
      to: 0,
    });
  });

  it('identical batches give three empty lists', () => {
    const registry = new FieldRegistry();
    const inputs = [row('a'), row('b', { parentId: 'a' })];
    const committed = place(inputs, registry);
    const target = place(inputs, registry);

    const changes = changesToMatchBatch(committed.byId, target.list, registry, accessFor(registry));

    expect(changes).toEqual({ added: [], removed: [], updated: [] });
  });
});

describe('changesToMatchBatch, an arbitrary target grown from a committed batch (#517 property)', () => {
  const registry = new FieldRegistry({ fields: [{ key: 'note' }] });
  const roots = ['r1', 'r2'] as const;
  const children = ['c1', 'c2', 'c3', 'c4'] as const;
  const newIds = ['n1', 'n2'] as const;

  // Committed: two roots, two children each, one of them carrying a props Field value — so a
  // shrunk, reparented, renamed and note-edited target still starts from a batch that exercises
  // every kind of row `changesToMatchBatch` diffs, not only core Fields.
  const seedInputs: readonly FlatEntryInput[] = [
    row('r1'),
    row('r2'),
    row('c1', { parentId: 'r1', props: { note: 'seed-c1' } }),
    row('c2', { parentId: 'r1' }),
    row('c3', { parentId: 'r2' }),
    row('c4', { parentId: 'r2' }),
  ];

  /** A `note` edit `fc.property` picks per surviving id: leave it, give it a fresh value, or drop
   *  it — the three cases `changesToMatchBatch` must tell apart for a props Field the same way it
   *  does for a core one. */
  const noteEdit = fc.constantFrom<'keep' | 'set' | 'clear'>('keep', 'set', 'clear');

  it('applying the changes to committed gives target, id by id, field by field', () => {
    fc.assert(
      fc.property(
        fc.subarray([...children]),
        fc.subarray([...newIds]),
        fc.dictionary(fc.constantFrom(...children), fc.constantFrom(...roots)),
        fc.dictionary(fc.constantFrom('r1', 'r2', ...children), fc.boolean()),
        fc.dictionary(fc.constantFrom('r1', 'r2', ...children), noteEdit),
        (keptChildren, addedIds, reparentTo, renamed, noteEdits) => {
          const committed = place(seedInputs, registry);
          const seedById = new Map(seedInputs.map((input) => [input.id, input]));

          const target: FlatEntryInput[] = [];
          for (const id of [...roots, ...keptChildren]) {
            const seed = seedById.get(id)!;
            const isChild = (children as readonly string[]).includes(id);
            const note = noteEdits[id] ?? 'keep';
            const props =
              note === 'keep' ? seed.props : note === 'set' ? { note: `${id}-fresh` } : { note: undefined };
            target.push({
              id,
              name: renamed[id] ? `${id}-renamed` : seed.name,
              start: seed.start,
              end: seed.end,
              parentId: isChild ? (reparentTo[id] ?? 'r1') : undefined,
              ...(props !== undefined ? { props } : {}),
            });
          }
          for (const id of addedIds) {
            target.push(row(id));
          }

          const targetPlaced = place(target, registry);
          const access = accessFor(registry);

          const changes = changesToMatchBatch(committed.byId, targetPlaced.list, registry, access);

          const applied = new Map(committed.byId);
          for (const { entity } of changes.removed) applied.delete(entity.id);
          for (const { entity } of changes.added) applied.set(entity.id, entity);
          for (const updatedRow of changes.updated) {
            const current = applied.get(updatedRow.id);
            if (!current) continue;
            const field = registry.get(updatedRow.field)!;
            applied.set(current.id, writeOntoEntry(current, field, updatedRow.to));
          }

          expect(new Set(applied.keys())).toEqual(new Set(targetPlaced.list.map((entry) => entry.id)));
          for (const entry of targetPlaced.list) {
            const result = applied.get(entry.id)!;
            for (const field of registry.all) {
              if ('compute' in field) continue;
              expect(
                registry.valuesEqual(
                  String(field.key),
                  readField(result, field, access),
                  readField(entry, field, access),
                ),
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
