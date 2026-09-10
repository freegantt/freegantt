import { describe, expect, it } from 'vitest';
import { CombinedStore } from './combined-store.js';
import {
  ChildAddWouldWidenLockedParentError,
  DerivedFieldNotWritableError,
  FieldNamedAtTopAndInPropsError,
  FieldNotEditableError,
  UndeclaredPropsKeyError,
} from './errors.js';
import { mergeEntryEdits, mergeStoredEdits } from './merge.js';
import { applySort, fitDataset } from './fit-sort.js';
import { durationOf } from './dates.js';
import { gridCanWrite } from './grid.js';
import { toProposedEdit, type EditExtender } from './extender.js';
import type { Entry } from './types.js';

const composedFields = [
  { key: 'cost', rollUp: 'sum' as const },
  { key: 'owner' },
];

const lockFields = [
  { key: 'cost', rollUp: 'sum' as const },
  { key: 'owner' },
  { key: 'start', editable: false as const },
];

describe('CombinedStore — public call site', () => {
  it('matches the composed recommendation call', () => {
    const store = new CombinedStore({ fields: composedFields });
    store.add({ id: 'p', name: 'Phase', cost: 500 });
    store.add({ id: 'c', parentId: 'p', start: 0, end: 10, cost: 7 });
    store.update('c', { cost: 9 });
    store.update('c', { start: undefined, end: undefined });

    expect(store.get('c').props.cost).toBe(9);
    expect(store.get('c').start).toBeUndefined();
    expect(store.derives('p')).toBe(true);
    expect(store.get('p').props.cost).toBe(9);
    expect(store.get('p').kind).toBe('span');
    expect(store.get('p').start).toBeUndefined();
    expect(() => store.update('p', { cost: 999 })).toThrow(DerivedFieldNotWritableError);
  });
});

describe('props — declared-key shorthand', () => {
  it('throws on undeclared props patch', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost' }] });
    store.add({ id: 't1', cost: 1 });
    expect(() => store.update('t1', { props: { phase: 3 } })).toThrow(UndeclaredPropsKeyError);
  });

  it('folds add({ cost }) like update', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost' }] });
    const row = store.add({ id: 't1', cost: 7 });
    expect(row.props.cost).toBe(7);
  });

  it('throws FieldNamedAtTopAndInPropsError on double name', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost' }] });
    store.add({ id: 't1', cost: 1 });
    expect(() => store.update('t1', { cost: 7, props: { cost: 8 } })).toThrow(
      FieldNamedAtTopAndInPropsError,
    );
  });
});

describe('merge — improvement F', () => {
  it('keeps both keys across mergeEntryEdits and mergeStoredEdits', () => {
    const loose = new Map<string, { props?: { cost?: number; owner?: string } }>();
    mergeEntryEdits(loose, 't1', { props: { cost: 3 } });
    mergeEntryEdits(loose, 't1', { props: { owner: 'Sam' } });
    expect(loose.get('t1')?.props).toEqual({ cost: 3, owner: 'Sam' });

    mergeEntryEdits(loose, 't1', { props: { cost: undefined } });
    expect(loose.get('t1')?.props).toEqual({ owner: 'Sam' });
    expect('cost' in (loose.get('t1')?.props ?? {})).toBe(false);

    const stored = new Map<string, { props?: { cost?: number; owner?: string } }>();
    mergeStoredEdits(stored, 't1', { props: { cost: 3 } });
    mergeStoredEdits(stored, 't1', { props: { owner: 'Sam' } });
    expect(stored.get('t1')?.props).toEqual({ cost: 3, owner: 'Sam' });
  });
});

describe('dates — biconditional', () => {
  it('un-dates with explicit undefined and clears segments', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost' }] });
    store.add({ id: 't1', start: 0, end: 10 });
    store.update('t1', { start: undefined, end: undefined });
    const row = store.get('t1');
    expect(row.start).toBeUndefined();
    expect(row.segments).toBeUndefined();
  });

  it('durationOf returns undefined for dateless', () => {
    const store = new CombinedStore({ fields: [] });
    store.add({ id: 't1' });
    expect(durationOf(store.get('t1'))).toBeUndefined();
  });
});

describe('derivation — structure-only', () => {
  it('derives when parent has children and kind stays authored', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }] });
    store.add({ id: 'p', name: 'Phase', kind: 'span', cost: 500 });
    store.add({ id: 'c', parentId: 'p', start: 0, end: 10, cost: 7 });
    expect(store.derives('p')).toBe(true);
    expect(store.get('p').kind).toBe('span');
    expect(() => store.update('p', { cost: 9 })).toThrow(DerivedFieldNotWritableError);
  });

  it('last-child remove writes no kind', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }] });
    store.add({ id: 'p', kind: 'group', cost: 1 });
    store.add({ id: 'c', parentId: 'p', cost: 2 });
    store.remove('c');
    expect(store.get('p').kind).toBe('group');
    expect(store.derives('p')).toBe(false);
  });

  it('empty group cost cell opens then first child drops typed value', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }] });
    store.add({ id: 'p', cost: 500 });
    expect(store.get('p').props.cost).toBe(500);
    store.add({ id: 'c', parentId: 'p', cost: 7 });
    expect(store.get('p').props.cost).toBe(7);
  });
});

describe('followChildren — improvement E and J', () => {
  it('opts out of derivation when followChildren is false on the Entry', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }] });
    store.add({ id: 'p', cost: 500, followChildren: false });
    store.add({ id: 'c', parentId: 'p', cost: 7 });
    expect(store.derives('p')).toBe(false);
    expect(store.get('p').followChildren).toBe(false);
    expect('followChildren' in store.get('p').props).toBe(false);
    store.update('p', { cost: 600 });
    expect(store.get('p').props.cost).toBe(600);
  });
});

describe('fit and sort — improvements C and Q5', () => {
  const ghost: Entry = { id: 'hole', name: '', kind: 'span', props: {} };
  const early: Entry = { id: 'early', name: '', kind: 'span', start: 100, end: 200, props: {} };
  const late: Entry = { id: 'late', name: '', kind: 'span', start: 300, end: 400, props: {} };

  it('skips dateless rows in fitDataset', () => {
    expect(fitDataset([ghost, early, late])?.start).toBe(100);
    expect(fitDataset([ghost])).toBeUndefined();
  });

  it('sorts a hole last on asc and desc in one test', () => {
    const asc = applySort([ghost, late, early], 'asc').map((e) => e.id);
    const desc = applySort([ghost, late, early], 'desc').map((e) => e.id);
    expect(asc).toEqual(['early', 'late', 'hole']);
    expect(desc).toEqual(['late', 'early', 'hole']);
  });
});

describe('envelope rollup — improvement D', () => {
  it('clears parent dates when every child is dateless', () => {
    const store = new CombinedStore({
      fields: [{ key: 'cost', rollUp: 'sum' }],
      envelopeRule: 'clear-when-all-dateless',
    });
    store.add({ id: 'p', start: 0, end: 100 });
    store.add({ id: 'c', parentId: 'p', start: 10, end: 20, cost: 1 });
    store.update('c', { start: undefined, end: undefined });
    expect(store.get('p').start).toBeUndefined();
  });

  it('keep-stale rule leaves last rolled envelope when all children dateless', () => {
    const store = new CombinedStore({
      fields: [{ key: 'cost', rollUp: 'sum' }],
      envelopeRule: 'keep-stale',
    });
    store.add({ id: 'p', start: 0, end: 100 });
    store.add({ id: 'c', parentId: 'p', start: 10, end: 20, cost: 1 });
    store.update('c', { start: undefined, end: undefined });
    expect(store.get('p').start).toBe(10);
  });
});

describe('lock — decision 19 and 23', () => {
  it('{ key: start, editable: false } constructs and update throws', () => {
    const store = new CombinedStore({ fields: [{ key: 'start', editable: false }] });
    store.add({ id: 't1', start: 0, end: 10 });
    expect(() => store.update('t1', { start: 5, end: 15 })).toThrow(FieldNotEditableError);
  });

  it('add still writes locked start', () => {
    const store = new CombinedStore({ fields: [{ key: 'start', editable: false }] });
    const row = store.add({ id: 't1', start: 0, end: 10 });
    expect(row.start).toBe(0);
  });

  it('un-date of locked start throws — un-date is a change', () => {
    const store = new CombinedStore({ fields: [{ key: 'start', editable: false }] });
    store.add({ id: 't1', start: 0, end: 10 });
    expect(() => store.update('t1', { start: undefined, end: undefined })).toThrow(FieldNotEditableError);
  });

  it('replay still writes locked start', () => {
    const store = new CombinedStore({ fields: [{ key: 'start', editable: false }] });
    store.add({ id: 't1', start: 0, end: 10 });
    const row = store.replay('t1', { start: 5, end: 15 });
    expect(row.start).toBe(5);
  });

  it('child add that would widen a locked parent throws the whole add', () => {
    const store = new CombinedStore({ fields: [{ key: 'start', editable: false }, { key: 'cost', rollUp: 'sum' }] });
    store.add({ id: 'p', start: 10, end: 20 });
    expect(() => store.add({ id: 'c', parentId: 'p', start: 0, end: 30, cost: 1 })).toThrow(
      ChildAddWouldWidenLockedParentError,
    );
    expect(store.childrenOf('p')).toHaveLength(0);
  });

  it('grid and update share write resolver — improvement H', () => {
    const store = new CombinedStore({ fields: lockFields });
    store.add({ id: 't1', start: 0, end: 10, owner: 'a' });
    const ctx = { id: 't1', hasChildren: false, followChildren: true };
    expect(gridCanWrite('start', store.declared, ctx)).toBe(false);
    expect(gridCanWrite('owner', store.declared, ctx)).toBe(false);
  });
});

describe('JSON round-trip — Q15 and Q6', () => {
  it('omits derived parent dates and reload keeps dates iff segments', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }, { key: 'start', editable: false }] });
    store.add({ id: 'p', cost: 1 });
    store.add({ id: 'c', parentId: 'p', start: 0, end: 10, cost: 7 });
    const doc = store.toJSON();
    expect(doc.entries.find((e) => e.id === 'p')?.start).toBeUndefined();

    const reloaded = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }, { key: 'start', editable: false }] });
    reloaded.fromJSON(doc);
    const parent = reloaded.get('p');
    expect(parent.start).toBe(0);
    expect(parent.segments?.length).toBe(1);
  });

  it('round-trips core override when encoded in fields', () => {
    const store = new CombinedStore({ fields: [{ key: 'end', editable: false }] });
    const doc = store.toJSON();
    expect(doc.fields?.some((f) => f.key === 'end' && f.editable === false)).toBe(true);
  });
});

describe('old Document — Q8', () => {
  it('raises report for rollUpKinds: [] and consumer cannot act on it alone', () => {
    const store = new CombinedStore({ fields: [{ key: 'cost', rollUp: 'sum' }] });
    const report = store.fromJSON({
      rollUpKinds: [],
      entries: [{ id: 'p', name: 'p', kind: 'span', props: { cost: 1 } }],
    });
    expect(report?.messages.length).toBeGreaterThan(0);
    store.add({ id: 'c', parentId: 'p', cost: 2 });
    expect(store.derives('p')).toBe(true);
  });
});

describe('extender — brand and collision', () => {
  it('runtime composes branded extras with per-key merge', () => {
    const riskExtender: EditExtender = () =>
      new Map([['t1', { props: { owner: 'Sam' } }]]);
    const store = new CombinedStore({
      fields: [{ key: 'owner' }],
      extenders: [{ name: 'risk', fn: riskExtender }],
    });
    store.add({ id: 't1' });
    const proposed = new Map([
      ['t1', toProposedEdit({}, { props: { owner: 'was' } })],
    ]);
    const merged = store.runExtenders(proposed);
    expect(merged.get('t1')?.props?.owner).toBe('Sam');
  });
});
