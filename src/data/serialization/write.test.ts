import { describe, expect, it } from 'vitest';
import { DatasetState } from '../dataset-state.js';
import { toDocument, fromDocument } from './index.js';
import type { EntryInput } from '../../model/index.js';

function span(id: string, overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    id,
    name: id,
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('toDocument fields (S4.4, D-S4-15)', () => {
  it('writes schema: 3 and omits fields and plugins when neither is present', () => {
    const doc = toDocument(new DatasetState({ timeZone: 'UTC', entries: [span('t1')] }));
    expect(doc.schema).toBe(4);
    expect('fields' in doc).toBe(false);
    expect('plugins' in doc).toBe(false);
    expect(Object.keys(doc)).toEqual(['schema', 'timeZone', 'dateOnlyEnd', 'rollUpKinds', 'entries']);
  });

  it('writes declared Fields in declaration order with resolved source', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum', column: { align: 'end' } } },
      fields: [
        { key: 'cost', type: 'money' },
        { key: 'risk', rollUp: 'max', source: { from: 'meta', key: 'riskScore' } },
      ],
      entries: [span('t1', { meta: { cost: 1, riskScore: 2 } })],
    });
    const doc = toDocument(dataset);
    expect(doc.fields).toEqual([
      {
        key: 'cost',
        type: 'money',
        source: { from: 'meta', key: 'cost' },
        rollUp: 'sum',
        column: { align: 'end' },
      },
      {
        key: 'risk',
        source: { from: 'meta', key: 'riskScore' },
        rollUp: 'max',
      },
    ]);
    expect(Object.keys(doc.fields![0]!)).toEqual(['key', 'type', 'source', 'rollUp', 'column']);
  });

  it('omits compute sources and function-valued keys', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      fields: [
        {
          key: 'cost',
          source: { from: 'meta', key: 'cost' },
          rollUp: 'sum',
          equals: (a, b) => a === b,
          compare: (a, b) => Number(a) - Number(b),
          formatValue: (value) => String(value),
        },
        {
          key: 'label',
          source: { from: 'compute', read: (entry) => entry.name },
        },
      ],
      entries: [span('t1', { meta: { cost: 1 } })],
    });
    const doc = toDocument(dataset);
    expect(doc.fields).toEqual([{ key: 'cost', source: { from: 'meta', key: 'cost' }, rollUp: 'sum' }]);
    const cost = doc.fields![0] as Record<string, unknown>;
    expect('equals' in cost).toBe(false);
    expect('compare' in cost).toBe(false);
    expect('formatValue' in cost).toBe(false);
  });

  it('stays byte-stable when a declared Field is present ([S2-A2])', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [span('t1', { meta: { cost: 400 } })],
    });
    const doc = toDocument(dataset);
    const round = toDocument(new DatasetState(fromDocument(doc)));
    expect(JSON.stringify(round)).toBe(JSON.stringify(doc));
  });

  it('does not write core Fields', () => {
    const doc = toDocument(
      new DatasetState({
        timeZone: 'UTC',
        fields: [{ key: 'cost' }],
        entries: [span('t1')],
      }),
    );
    expect(doc.fields?.map((field) => field.key)).toEqual(['cost']);
  });
});
