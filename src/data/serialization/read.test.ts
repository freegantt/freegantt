import { describe, expect, it } from 'vitest';
import { DatasetState } from '../dataset-state.js';
import { readDocument, toJSON } from './index.js';
import { UnknownAggregatorError, UnsupportedSchemaError } from '../../model/index.js';
import type { DatasetDocument, EntryDocument } from '../../model/index.js';

function span(id: string, overrides: Partial<EntryDocument> = {}): EntryDocument {
  return {
    id,
    name: id,
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('readDocument (S4.4, D-S4-16)', () => {
  it('reads a schema: 1 Document and lands derivedSpanKinds on rollUpKinds', () => {
    const read = readDocument({
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      derivedSpanKinds: ['milestone'],
      entries: [span('t1')],
    } as unknown as DatasetDocument);
    expect(read.rollUpKinds).toEqual(['milestone']);
    expect(read.fields).toBeUndefined();
    const restored = new DatasetState(read);
    expect([...restored.rollUpKinds]).toEqual(['milestone']);
  });

  it('ignores fields on a schema: 1 Document — options.fields only', () => {
    const read = readDocument(
      {
        schema: 1,
        timeZone: 'UTC',
        dateOnlyEnd: 'inclusive',
        rollUpKinds: ['group'],
        fields: [{ key: 'cost', source: { from: 'meta', key: 'cost' }, rollUp: 'sum' }],
        entries: [span('t1')],
      },
      { fields: [{ key: 'risk' }] },
    );
    expect(read.fields?.map((field) => field.key)).toEqual(['risk']);
  });

  it('merges a schema: 2 Document with options: Document wins data keys, options win functions', () => {
    const formatValue = (value: unknown): string => `$${String(value)}`;
    const read = readDocument(
      {
        schema: 2,
        timeZone: 'UTC',
        dateOnlyEnd: 'inclusive',
        rollUpKinds: ['group'],
        fields: [
          {
            key: 'cost',
            type: 'money',
            source: { from: 'meta', key: 'budget' },
            rollUp: 'sum',
            column: { header: 'Cost' },
          },
        ],
        entries: [span('t1')],
      },
      {
        fieldTypes: { money: { rollUp: 'max' } },
        fields: [
          {
            key: 'cost',
            type: 'other',
            source: { from: 'meta', key: 'cost' },
            rollUp: 'min',
            column: { header: 'Nope' },
            formatValue,
          },
        ],
      },
    );
    const cost = read.fields?.find((field) => field.key === 'cost');
    expect(cost?.type).toBe('money');
    expect(cost?.source).toEqual({ from: 'meta', key: 'budget' });
    expect(cost?.rollUp).toBe('sum');
    expect(cost?.column).toEqual({ header: 'Cost' });
    expect(cost?.formatValue?.(500, null as never)).toBe('$500');
  });

  it('adds an option-only Field whole', () => {
    const read = readDocument(
      {
        schema: 2,
        timeZone: 'UTC',
        dateOnlyEnd: 'inclusive',
        rollUpKinds: ['group'],
        fields: [{ key: 'cost', source: { from: 'meta', key: 'cost' }, rollUp: 'sum' }],
        entries: [span('t1')],
      },
      { fields: [{ key: 'risk', rollUp: 'max' }] },
    );
    expect(read.fields?.map((field) => field.key)).toEqual(['cost', 'risk']);
  });

  it('throws UnknownAggregatorError when the Document names an Aggregator options omit', () => {
    const doc: DatasetDocument = {
      schema: 2,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      fields: [{ key: 'cost', source: { from: 'meta', key: 'cost' }, rollUp: 'riskWeighted' }],
      entries: [span('t1')],
    };
    expect(() => new DatasetState(readDocument(doc))).toThrow(UnknownAggregatorError);
  });

  it('throws UnsupportedSchemaError for a schema this build does not read', () => {
    const doc = {
      schema: 3,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive' as const,
      rollUpKinds: [],
      entries: [],
    };
    expect(() => readDocument(doc as unknown as DatasetDocument)).toThrow(UnsupportedSchemaError);
    try {
      readDocument(doc as unknown as DatasetDocument);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaError);
      if (error instanceof UnsupportedSchemaError) {
        expect(error.schema).toBe(3);
        expect(error.supported).toEqual([1, 2]);
      }
    }
  });
});

describe('[S2-A2] round-trip with declared Fields', () => {
  it('stays byte-stable when a declared Field is present', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [span('t1', { meta: { cost: 400 } })],
    });
    const doc = toJSON(dataset);
    const round = toJSON(new DatasetState(readDocument(doc)));
    expect(JSON.stringify(round)).toBe(JSON.stringify(doc));
  });
});
