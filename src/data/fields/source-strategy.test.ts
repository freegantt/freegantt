import { describe, expect, it } from 'vitest';
import { FieldRegistry } from './field-registry.js';
import { storedSourceOf } from './normalize-source.js';
import { SOURCE_STRATEGY, strategyFor } from './source-strategy.js';
import { FreeGanttError, InvalidFieldSourceError } from '../../model/index.js';
import type { Field } from '../../model/index.js';

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

  // #196: TypeScript refuses these shapes, so only a JS caller reaches them — and
  // `ctx.fields.register(field)` is public surface as of S5.10, so a plugin author writing plain JS
  // is a supported caller. Before this they got a bare `TypeError` from a property read.
  describe('an invalid source is a FreeGanttError, not a TypeError (#196)', () => {
    it('names the field and the string it was given', () => {
      const declareStringSource = (): unknown =>
        storedSourceOf({ key: 'cost', source: 'meta' } as unknown as Field);

      expect(declareStringSource).toThrow(InvalidFieldSourceError);
      expect(declareStringSource).toThrow(/"cost"/);
      expect(declareStringSource).toThrow(/got the string "meta"/);
    });

    it('catches as a FreeGanttError, with the code and the field on it', () => {
      try {
        storedSourceOf({ key: 'cost', source: 'meta' } as unknown as Field);
        expect.unreachable('storedSourceOf accepted a string source');
      } catch (error) {
        expect(error).toBeInstanceOf(FreeGanttError);
        expect((error as InvalidFieldSourceError).code).toBe('invalid-field-source');
        expect((error as InvalidFieldSourceError).key).toBe('cost');
        expect((error as InvalidFieldSourceError).received).toBe('meta');
      }
    });

    it('refuses a `from` outside the three declared sources', () => {
      expect(() => storedSourceOf({ key: 'cost', source: { from: 'entries' } } as unknown as Field)).toThrow(
        /got \{ from: entries \}/,
      );
    });

    it('refuses null, which reads as "no source" but is not', () => {
      expect(() => storedSourceOf({ key: 'cost', source: null } as unknown as Field)).toThrow(
        InvalidFieldSourceError,
      );
    });

    it('reaches a plugin registering a Field, which is where a JS caller meets it', () => {
      const registry = new FieldRegistry();
      expect(() =>
        registry.register({ key: 'risk', source: 'meta' } as unknown as Field, 'acme/risk'),
      ).toThrow(InvalidFieldSourceError);
    });
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
