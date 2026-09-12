import { describe, expect, it } from 'vitest';
import { entryId, segmentId } from '../../model/index.js';
import type { Entry, Instant, ProposedEdit } from '../../model/index.js';
import {
  createFieldContext,
  createRollUpContext,
  editProposesField,
  emptyProposedEdit,
  mergeProposedEdits,
  entryAfterEdit,
  proposedKeysOf,
  readField,
  withProposedKeys,
  writeField,
  writeOntoEntry,
} from './field-access.js';
import { FieldRegistry } from './field-registry.js';

const span = (props?: Record<string, unknown>): Entry => {
  return {
    id: entryId('t1'),
    name: 't1',
    start: 0 as Instant,
    end: 1 as Instant,
    segments: [{ id: segmentId('t1-seg'), start: 0 as Instant, end: 1 as Instant }],
    props: props ?? {},
  };
};

/** A `ProposedEdit` fixture: fills the required brand/`props`/`proposedKeys` a raw patch no longer
 *  carries, inferring `proposedKeys` from the patch's own keys when the caller does not state one. */
function edit(patch: Record<string, unknown> = {}): ProposedEdit {
  const { props, proposedKeys, ...envelope } = patch as {
    props?: Record<string, unknown>;
    proposedKeys?: Set<string>;
  } & Record<string, unknown>;
  return withProposedKeys(
    { __brand: 'ProposedEdit', props: props ?? {}, proposedKeys: new Set(), ...envelope },
    proposedKeys ?? new Set(Object.keys(envelope)),
  );
}

describe('readField / writeField (D-S4-2)', () => {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
  const fieldCtx = createFieldContext(registry, 'UTC');
  const cost = registry.get('cost')!;
  const start = registry.get('start')!;
  const duration = registry.get('duration')!;

  it('reads and writes an entry source', () => {
    const entry = span();
    expect(readField(entry, start, fieldCtx)).toBe(0);
    const edited = entryAfterEdit(entry, writeField(emptyProposedEdit(), start, 10));
    expect(edited.start).toBe(10);
  });

  it('creates props on the first declared write and merges later writes', () => {
    const entry = span();
    expect(readField(entry, cost, fieldCtx)).toBeUndefined();
    const first = writeField(emptyProposedEdit(), cost, 500);
    expect(first.props).toEqual({ cost: 500 });
    const second = writeField(first, cost, 600);
    expect(second.props).toEqual({ cost: 600 });
    const merged = writeField(emptyProposedEdit(), cost, 500);
    expect(merged.props).toEqual({ cost: 500 });
  });

  it('does not replace props when writing a declared key — the passenger key survives (ADR 0011)', () => {
    const entry = span({ team: 'A', cost: 400 });
    const written = entryAfterEdit(entry, writeField(emptyProposedEdit(), cost, 500));
    expect(written.props).toEqual({ team: 'A', cost: 500 });
  });

  it('clears the declared key from props, leaving props an object, never undefined (ADR 0011)', () => {
    const entry = span({ cost: 500 });
    const written = entryAfterEdit(entry, writeField(emptyProposedEdit(), cost, undefined));
    expect('cost' in written.props).toBe(false);
    expect(written.props).toEqual({});
    expect('cost' in writeOntoEntry(entry, cost, undefined).props).toBe(false);
  });

  it('reads a compute Field through the guarded durationOf', () => {
    const entry = span();
    expect(readField(entry, duration, fieldCtx)).toEqual({ value: 1, unit: 'millisecond' });
  });

  it('durationOf reads undefined for a dateless Entry, never NaN (ADR 0012)', () => {
    const dateless: Entry = { id: entryId('t2'), name: 't2', segments: [], props: {} };
    expect(readField(dateless, duration, fieldCtx)).toBeUndefined();
  });

  it('writeOntoEntry writes cost onto parent', () => {
    const parent = span();
    const next = writeOntoEntry(parent, cost, 300);
    expect(next.props).toEqual({ cost: 300 });
    expect(readField(next, cost, fieldCtx)).toBe(300);
  });

  it('mergeProposedEdits keeps proposed keys through a spread', () => {
    const authored = withProposedKeys(writeField(emptyProposedEdit(), cost, 3), ['cost']);
    const spread = { ...authored };
    expect(spread.proposedKeys.has('cost')).toBe(true);
    const merged = mergeProposedEdits(edit({ name: 'x' }), authored);
    expect(editProposesField(merged, cost)).toBe(true);
  });

  // #197: the two sides may each name different Fields. The merged edit must show every write, or
  // `diffEdit` emits no row for one side and that write is lost.
  it('mergeProposedEdits keeps both sides’ proposed keys', () => {
    const authored = withProposedKeys(writeField(emptyProposedEdit(), cost, 3), ['cost']);
    const raw = edit({ name: 'Moved' });

    const rawFirst = mergeProposedEdits(raw, authored);
    expect([...proposedKeysOf(rawFirst)].sort()).toEqual(['cost', 'name']);

    const authoredFirst = mergeProposedEdits(authored, raw);
    expect([...proposedKeysOf(authoredFirst)].sort()).toEqual(['cost', 'name']);
  });

  it('mergeProposedEdits keeps every key of both edits, whichever named itself', () => {
    const merged = mergeProposedEdits(edit({ name: 'a' }), edit({ end: 9 }));
    expect([...proposedKeysOf(merged)].sort()).toEqual(['end', 'name']);
    expect(merged.name).toBe('a');
    expect(merged.end).toBe(9);
  });

  it('proposedKeysOf reads the keys an edit states it writes', () => {
    expect(proposedKeysOf(edit({ name: 'a' })).size).toBe(1);
    expect(proposedKeysOf(withProposedKeys(edit(), [])).size).toBe(0);
  });
});

describe('createRollUpContext values/numericValues (issue #124)', () => {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
  const fieldCtx = createFieldContext(registry, 'UTC');
  const cost = registry.get('cost')!;

  const children = [span({ cost: 1 }), span({ cost: 'not a number' }), span({ cost: 3 }), span()];

  it('values reads the rolling field off each child, in order, holes included', () => {
    const rollUpCtx = createRollUpContext(fieldCtx, cost.key);
    expect(rollUpCtx.values(children)).toEqual([1, 'not a number', 3, undefined]);
  });

  it('numericValues keeps only finite numbers, dropping holes and non-numeric values', () => {
    const rollUpCtx = createRollUpContext(fieldCtx, cost.key);
    expect(rollUpCtx.numericValues(children)).toEqual([1, 3]);
  });

  it('numericValues is empty, not thrown, when no child has a numeric value', () => {
    const rollUpCtx = createRollUpContext(fieldCtx, cost.key);
    expect(rollUpCtx.numericValues([span(), span({ cost: 'x' })])).toEqual([]);
  });

  it('routes through the same read path as ctx.read (D-S4-8)', () => {
    const rollUpCtx = createRollUpContext(fieldCtx, cost.key);
    expect(rollUpCtx.values([children[0]!])).toEqual([rollUpCtx.read(children[0]!, cost.key)]);
  });
});
