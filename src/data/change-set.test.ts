import { describe, expect, it } from 'vitest';
import { diffEdit, foldChangeSet, invertChangeSet } from './change-set.js';
import { changeSetId, entryId, segmentId } from '../model/index.js';
import type { Entry, EntryId, Instant } from '../model/index.js';
import type { ProposedEdit } from './edit-extension.js';
import { createFieldContext, withProposedKeys, writeField } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';

function span(start: number, end: number): { start: Instant; end: Instant } {
  return { start: start as Instant, end: end as Instant };
}

function entry(id: string, props?: Record<string, unknown>): Entry {
  return {
    id: entryId(id),
    name: id,
    start: 0 as Instant,
    end: 1 as Instant,
    segments: [{ id: segmentId(`${id}-seg`), start: 0 as Instant, end: 1 as Instant }],
    props: props ?? {},
  };
}

const registry = new FieldRegistry({
  fieldTypes: { money: { rollUp: 'sum' } },
  fields: [{ key: 'cost', type: 'money' }],
});
const fieldCtx = createFieldContext(registry, 'UTC');

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

  it('compares segments element-wise on start/end', () => {
    const a = [span(0, 1)];
    const b = [span(0, 1)];
    const c = [span(0, 2)];
    expect(registry.valuesEqual('segments', a, b)).toBe(true);
    expect(registry.valuesEqual('segments', a, c)).toBe(false);
    expect(registry.valuesEqual('segments', undefined, undefined)).toBe(true);
    expect(registry.valuesEqual('segments', a, undefined)).toBe(false);
  });

  it('falls back to Object.is for a declared Field without equals', () => {
    expect(registry.valuesEqual('cost', 1, 1)).toBe(true);
    expect(registry.valuesEqual('cost', 1, 2)).toBe(false);
  });
});

describe('diffEdit', () => {
  function entries(...list: Entry[]): ReadonlyMap<EntryId, Entry> {
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

  it('cancels an add followed by a remove of the same id, and records neither', () => {
    const t1 = entry('t1');
    const result = foldChangeSet(
      changeSetId(1),
      'user',
      [{ store: 'entries', entity: t1 }],
      [{ store: 'entries', entity: t1 }],
      [],
    );
    expect(result).toBeUndefined();
  });

  it('drops field updates belonging to a cancelled id, but keeps updates for other ids', () => {
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
    expect(result?.added).toEqual([]);
    expect(result?.removed).toEqual([]);
    expect(result?.updated).toEqual([{ store: 'entries', id: t2.id, field: 'name', from: 'a', to: 'b' }]);
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
