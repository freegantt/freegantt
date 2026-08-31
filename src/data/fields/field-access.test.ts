import { describe, expect, it } from 'vitest';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import { createFieldContext, overlayStoredEdit, readField, writeField } from './field-access.js';
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
  const fieldCtx = createFieldContext('UTC', (entry, key, ctx) => {
    const field = registry.get(key);
    if (!field) return undefined;
    return readField(entry, field, ctx);
  });
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

  it('omits meta when the last declared key is cleared', () => {
    const entry = span({ cost: 500 });
    const written = writeField({}, entry, cost, undefined);
    expect('meta' in written).toBe(false);
  });

  it('reads a compute Field through durationOf', () => {
    const entry = span();
    expect(readField(entry, duration, fieldCtx)).toEqual({ value: 1, unit: 'millisecond' });
  });
});
