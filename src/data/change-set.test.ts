import { describe, expect, it } from 'vitest';
import { diffEdit, foldChangeSet, invertChangeSet, mergeUpdatedRows } from './change-set.js';
import { changeSetId, entryId } from '../model/index.js';
import type { StoredEntry, EntryId, FieldKey, Instant } from '../model/index.js';
import type { ProposedEdit } from './edit-extension.js';
import { createFieldAccess, withProposedKeys, writeField } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';

function entry(id: string, props?: Record<string, unknown>): StoredEntry {
  return {
    id: entryId(id),
    name: id,
    start: 0 as Instant,
    end: 1 as Instant,
    props: props ?? {},
    siblingIndex: 0,
  };
}

const registry = new FieldRegistry({
  fieldTypes: { money: { rollUp: 'sum' } },
  fields: [{ key: 'cost', type: 'money' }],
});
const fieldCtx = createFieldAccess({ fields: registry, timeZone: 'UTC' });

describe('FieldRegistry.valuesEqual', () => {
  it('compares primitives by reference', () => {
    expect(registry.valuesEqual('name', 'Roofing', 'Roofing')).toBe(true);
    expect(registry.valuesEqual('name', 'Roofing', 'Framing')).toBe(false);
  });

  it('compares start/end as exact Instant equality', () => {
    expect(registry.valuesEqual('start', 0, 0)).toBe(true);
    expect(registry.valuesEqual('start', 0, 1)).toBe(false);
  });

  it('falls back to reference equality for a key with no declared equals, never deep', () => {
    const shared = { note: 'x' };
    expect(registry.valuesEqual('undeclared', shared, shared)).toBe(true);
    expect(registry.valuesEqual('undeclared', { note: 'x' }, { note: 'x' })).toBe(false);
  });

  it('falls back to Object.is for a declared Field without equals', () => {
    expect(registry.valuesEqual('cost', 1, 1)).toBe(true);
    expect(registry.valuesEqual('cost', 1, 2)).toBe(false);
  });
});

describe('diffEdit', () => {
  function entries(...list: StoredEntry[]): ReadonlyMap<EntryId, StoredEntry> {
    return new Map(list.map((item) => [item.id, item]));
  }

  function edit(patch: Record<string, unknown>): ProposedEdit {
    const { props, proposedKeys, ...envelope } = patch as {
      props?: Record<string, unknown>;
      proposedKeys?: Set<string>;
    } & Record<string, unknown>;
    return withProposedKeys(
      { __brand: 'ProposedEdit', props: props ?? {}, proposedKeys: new Set(), ...envelope },
      proposedKeys ?? new Set(Object.keys(envelope)),
    );
  }

  it('produces a FieldUpdated row per changed field', () => {
    const t1 = entry('t1');
    const rows = diffEdit(
      entries(t1),
      t1.id,
      edit({ name: 'Framing', parentId: entryId('root') }),
      registry,
      fieldCtx,
    );
    expect(rows).toEqual([
      { store: 'entries', id: t1.id, field: 'name', from: 't1', to: 'Framing' },
      { store: 'entries', id: t1.id, field: 'parentId', from: undefined, to: entryId('root') },
    ]);
  });

  it('drops a field set back to its current value', () => {
    const t1 = entry('t1');
    const rows = diffEdit(entries(t1), t1.id, edit({ name: 't1' }), registry, fieldCtx);
    expect(rows).toEqual([]);
  });

  it('returns no rows for an id absent from entries', () => {
    const t1 = entry('t1');
    const rows = diffEdit(entries(t1), entryId('missing'), edit({ name: 'x' }), registry, fieldCtx);
    expect(rows).toEqual([]);
  });

  it('{ cost: 500 } emits one cost row, keyed cost, never a whole-props row (ADR 0011)', () => {
    const t1 = entry('t1', { cost: 400 });
    const cost = registry.get('cost')!;
    const stored = withProposedKeys(
      writeField({ __brand: 'ProposedEdit', props: {}, proposedKeys: new Set() }, cost, 500),
      ['cost'],
    );
    const rows = diffEdit(entries(t1), t1.id, stored, registry, fieldCtx);
    expect(rows).toEqual([{ store: 'entries', id: t1.id, field: 'cost', from: 400, to: 500 }]);
  });

  it('two declared props keys each emit their own row, and props itself is not a Field (ADR 0011)', () => {
    const t1 = entry('t1', { cost: 400, team: 'A' });
    const rows = diffEdit(
      entries(t1),
      t1.id,
      edit({ props: { cost: 500, team: 'A' }, proposedKeys: new Set(['cost']) }),
      registry,
      fieldCtx,
    );
    expect(rows).toEqual([{ store: 'entries', id: t1.id, field: 'cost', from: 400, to: 500 }]);
  });
});

describe('foldChangeSet', () => {
  it('returns undefined for an empty net effect', () => {
    expect(foldChangeSet(changeSetId(1), 'user', [], [], [])).toBeUndefined();
  });

  it('keeps an add with no matching remove', () => {
    const t1 = entry('t1');
    const result = foldChangeSet(changeSetId(1), 'user', [{ store: 'entries', entity: t1 }], [], []);
    expect(result?.added).toEqual([{ store: 'entries', entity: t1 }]);
  });

  it('keeps both rows when an id names both an add and a remove — the write set already resolved a within-transaction churn before this runs, so an id reaching here in both lists is a replace, not a cancel', () => {
    const t1 = entry('t1');
    const result = foldChangeSet(
      changeSetId(1),
      'user',
      [{ store: 'entries', entity: t1 }],
      [{ store: 'entries', entity: t1 }],
      [],
    );
    expect(result?.added).toEqual([{ store: 'entries', entity: t1 }]);
    expect(result?.removed).toEqual([{ store: 'entries', entity: t1 }]);
  });

  it('keeps every update row, including one for an id that also names a replace', () => {
    const t1 = entry('t1');
    const t2 = entry('t2');
    const result = foldChangeSet(
      changeSetId(1),
      'user',
      [{ store: 'entries', entity: t1 }],
      [{ store: 'entries', entity: t1 }],
      [
        { store: 'entries', id: t1.id, field: 'name', from: 'a', to: 'b' },
        { store: 'entries', id: t2.id, field: 'name', from: 'a', to: 'b' },
      ],
    );
    expect(result?.updated).toEqual([
      { store: 'entries', id: t1.id, field: 'name', from: 'a', to: 'b' },
      { store: 'entries', id: t2.id, field: 'name', from: 'a', to: 'b' },
    ]);
  });
});

describe('mergeUpdatedRows', () => {
  it('keeps two rows apart when their id and field, joined by a colon, spell the same string', () => {
    // id 'a:b' field 'c' and id 'a' field 'b:c' both stringify to 'entries:a:b:c' under a joined-string
    // key — a merge that keys that way collapses two unrelated rows into one and drops the other.
    const rowOne = { store: 'entries' as const, id: entryId('a:b'), field: 'c' as FieldKey, from: 1, to: 2 };
    const rowTwo = {
      store: 'entries' as const,
      id: entryId('a'),
      field: 'b:c' as FieldKey,
      from: 10,
      to: 20,
    };
    const merged = mergeUpdatedRows([rowOne, rowTwo], registry);
    expect(merged).toEqual([rowOne, rowTwo]);
  });
});

describe('invertChangeSet', () => {
  it('swaps added with removed and each updated row from/to, and tags origin undo', () => {
    const t1 = entry('t1');
    const inverted = invertChangeSet({
      id: changeSetId(1),
      origin: 'user',
      added: [{ store: 'entries', entity: t1 }],
      removed: [],
      updated: [{ store: 'entries', id: t1.id, field: 'name', from: 'old', to: 'new' }],
    });
    expect(inverted).toEqual({
      id: changeSetId(1),
      origin: 'undo',
      added: [],
      removed: [{ store: 'entries', entity: t1 }],
      updated: [{ store: 'entries', id: t1.id, field: 'name', from: 'new', to: 'old' }],
    });
  });
});
