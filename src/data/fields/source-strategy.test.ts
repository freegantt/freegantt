import { describe, expect, it } from 'vitest';
import { FieldRegistry } from './field-registry.js';
import { storedSourceOf } from './normalize-source.js';
import { SOURCE_STRATEGY, strategyFor } from './source-strategy.js';

describe('SOURCE_STRATEGY (A4)', () => {
  it('is a frozen table of entry, meta, and compute', () => {
    expect(Object.isFrozen(SOURCE_STRATEGY)).toBe(true);
    expect(Object.keys(SOURCE_STRATEGY)).toEqual(['entry', 'meta', 'compute']);
  });

  it('is the one place the registry normalizes source', () => {
    const omitted = storedSourceOf({ key: 'team' });
    expect(omitted).toEqual(SOURCE_STRATEGY.meta.normalize({ key: 'team' }));
    expect(omitted).toEqual({ from: 'meta', key: 'team' });

    const registry = new FieldRegistry({ fields: [{ key: 'team' }] });
    expect(registry.get('team')?.source).toEqual(omitted);
  });

  it('serialize matches the variant for a stored source', () => {
    expect(strategyFor({ from: 'meta', key: 'team' }).serialize({ from: 'meta', key: 'team' })).toEqual({
      from: 'meta',
      key: 'team',
    });
    expect(strategyFor({ from: 'entry', field: 'name' }).serialize({ from: 'entry', field: 'name' })).toEqual(
      {
        from: 'entry',
        field: 'name',
      },
    );
    expect(
      strategyFor({ from: 'compute', read: () => 0 }).serialize({ from: 'compute', read: () => 0 }),
    ).toBeUndefined();
  });
});
