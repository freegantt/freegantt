import { describe, expect, it } from 'vitest';
import { FieldRegistry } from './field-registry.js';
import { createFieldContext, writeField } from './field-access.js';
import {
  DuplicateFieldKeyError,
  DuplicateFieldSourceError,
  segmentId,
  UnknownAggregatorError,
  UnknownFieldTypeError,
} from '../../model/index.js';

function ctx(registry: FieldRegistry) {
  return createFieldContext(registry, 'UTC');
}

describe('FieldRegistry type merge (D-S4-3)', () => {
  it("the Field's own keys win; omitted rollUp takes the type's, including a consumer Aggregator", () => {
    const riskWeighted = () => 1;
    const registry = new FieldRegistry({
      aggregators: { riskWeighted },
      fieldTypes: { risk: { rollUp: 'riskWeighted' }, money: { rollUp: 'sum' } },
      fields: [
        { key: 'risk', type: 'risk' },
        { key: 'cost', type: 'money' },
        { key: 'notes', type: 'money', rollUp: 'none' },
      ],
    });
    expect(registry.get('risk')?.rollUp).toBe('riskWeighted');
    expect(registry.get('cost')?.rollUp).toBe('sum');
    expect(registry.get('notes')?.rollUp).toBe('none');
    expect(registry.rollingUpFields().map((field) => field.key)).toEqual(
      expect.arrayContaining(['start', 'end', 'risk', 'cost']),
    );
    expect(registry.rollingUpFields().some((field) => field.key === 'notes')).toBe(false);
  });
});

describe('D-S4-35 omitted source', () => {
  it('{ key: cost, type: money } and meta.cost on the input reads 500', () => {
    const registry = new FieldRegistry({
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const field = registry.get('cost')!;
    expect(field.source).toEqual({ from: 'meta', key: 'cost' });
    const entry = {
      id: 't1' as never,
      name: 't1',
      kind: 'span' as const,
      start: 0 as never,
      end: 1 as never,
      segments: [{ id: segmentId('t1-seg'), start: 0 as never, end: 1 as never }],
      meta: { cost: 500 },
    };
    expect(ctx(registry).read(entry, 'cost')).toBe(500);
  });

  it('{ from: meta, key: budget } maps a different Document key', () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'cost', source: { from: 'meta', key: 'budget' } }],
    });
    expect(registry.get('cost')?.source).toEqual({ from: 'meta', key: 'budget' });
    const entry = {
      id: 't1' as never,
      name: 't1',
      kind: 'span' as const,
      start: 0 as never,
      end: 1 as never,
      segments: [{ id: segmentId('t1-seg'), start: 0 as never, end: 1 as never }],
      meta: { budget: 1, cost: 2 },
    };
    expect(ctx(registry).read(entry, 'cost')).toBe(1);
  });

  it('{ key: start } throws DuplicateFieldKeyError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'start' }] })).toThrow(DuplicateFieldKeyError);
  });

  it('two Fields that share one meta slot throw DuplicateFieldSourceError', () => {
    expect(
      () =>
        new FieldRegistry({
          fields: [{ key: 'cost' }, { key: 'budget', source: { from: 'meta', key: 'cost' } }],
        }),
    ).toThrow(DuplicateFieldSourceError);
  });

  it('an unknown Field type throws UnknownFieldTypeError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'cost', type: 'money' }] })).toThrow(
      UnknownFieldTypeError,
    );
  });

  it('an unknown Aggregator name throws UnknownAggregatorError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'cost', rollUp: 'riskWeighted' }] })).toThrow(
      UnknownAggregatorError,
    );
  });

  it('two declarations that share a key throw DuplicateFieldKeyError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'cost' }, { key: 'cost' }] })).toThrow(
      DuplicateFieldKeyError,
    );
  });

  it('toJSON of an omitted-source Field is the resolved source (read view)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    expect(registry.get('cost')?.source).toEqual({ from: 'meta', key: 'cost' });
  });

  it('bound FieldContext.read looks up by key after writeField', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    const context = ctx(registry);
    const entry = {
      id: 't1' as never,
      name: 't1',
      kind: 'span' as const,
      start: 0 as never,
      end: 1 as never,
      segments: [{ id: segmentId('t1-seg'), start: 0 as never, end: 1 as never }],
    };
    const cost = registry.get('cost')!;
    const written = writeField({}, entry, cost, 500);
    expect(written.meta).toEqual({ cost: 500 });
    const next = { ...entry, meta: written.meta };
    expect(context.read(next, 'cost')).toBe(500);
  });
});
