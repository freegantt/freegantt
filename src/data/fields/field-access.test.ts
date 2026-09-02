import { describe, expect, it } from 'vitest';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import {
  createFieldContext,
  createRollUpContext,
  editProposesField,
  mergeStoredEdits,
  overlayStoredEdit,
  readField,
  withProposedKeys,
  writeField,
  writeOntoEntry,
} from './field-access.js';
import { FieldRegistry } from './field-registry.js';

const span = (meta?: unknown): Entry => {
  const entry: Entry = {
    id: entryId('t1'),
    name: 't1',
    kind: 'span',
    start: 0 as Entry['start'],
    end: 1 as Entry['end'],
  };
  if (meta !== undefined) entry.meta = meta;
  return entry;
};

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
    const edited = overlayStoredEdit(entry, writeField({}, entry, start, 10));
    expect(edited.start).toBe(10);
  });

  it('creates meta on the first declared write and merges later writes', () => {
    const entry = span();
    expect(readField(entry, cost, fieldCtx)).toBeUndefined();
    const first = writeField({}, entry, cost, 500);
    expect(first.meta).toEqual({ cost: 500 });
    const second = writeField(first, overlayStoredEdit(entry, first), cost, 600);
    expect(second.meta).toEqual({ cost: 600 });
    const withPassenger = span({ team: 'A' });
    const merged = writeField({}, withPassenger, cost, 500);
    expect(merged.meta).toEqual({ team: 'A', cost: 500 });
  });

  it('does not replace meta when writing a declared key', () => {
    const entry = span({ team: 'A', cost: 400 });
    const written = writeField({}, entry, cost, 500);
    expect(written.meta).toEqual({ team: 'A', cost: 500 });
  });

  it('clears meta when the last declared key is cleared', () => {
    const entry = span({ cost: 500 });
    const written = writeField({}, entry, cost, undefined);
    expect('meta' in written).toBe(true);
    expect(written.meta).toBeUndefined();
    expect('meta' in writeOntoEntry(entry, cost, undefined)).toBe(false);
  });

  it('reads a compute Field through durationOf', () => {
    const entry = span();
    expect(readField(entry, duration, fieldCtx)).toEqual({ value: 1, unit: 'millisecond' });
  });

  it('writeOntoEntry writes cost onto parent', () => {
    const parent = span();
    const next = writeOntoEntry(parent, cost, 300);
    expect(next.meta).toEqual({ cost: 300 });
    expect(readField(next, cost, fieldCtx)).toBe(300);
  });

  it('mergeStoredEdits keeps proposed keys through a spread', () => {
    const authored = withProposedKeys(writeField({}, span(), cost, 3), ['cost']);
    const spread = { ...authored };
    expect(spread.proposedKeys?.has('cost')).toBe(true);
    const merged = mergeStoredEdits({ name: 'x' }, authored);
    expect(editProposesField(merged, cost)).toBe(true);
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
