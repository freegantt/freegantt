import { describe, expect, it } from 'vitest';
import { FieldRegistry } from '../data/fields/field-registry.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import { bindGanttFields, resolveColumns, resolveFieldCompares } from './grid-columns.js';
import type { FieldLookup } from '../data/fields/field-access.js';
import type { Entry, Field, FieldKey } from '../model/index.js';
import { entryId } from '../model/index.js';

const zone = 'UTC';
const locale = 'en-US';

function costRegistry() {
  return new FieldRegistry({
    fieldTypes: {
      money: {
        rollUp: 'sum',
        formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
        column: { width: 90, align: 'end', header: 'Cost' },
      },
    },
    fields: [{ key: 'cost', type: 'money' }],
  });
}

function lookupFrom(fields: readonly Field[]): FieldLookup {
  return {
    get: (key: FieldKey) => fields.find((field) => String(field.key) === String(key)),
  };
}

const entry: Entry = {
  id: entryId('t1'),
  name: 'Alpha',
  kind: 'span',
  start: 0 as Entry['start'],
  end: 1 as Entry['end'],
  meta: { cost: 500 },
};

describe('resolveColumns (D-S4-12)', () => {
  it("a string takes the Field's column defaults", () => {
    const columns = resolveColumns(['cost'], costRegistry(), { timeZone: zone, locale });
    expect(columns).toHaveLength(1);
    expect(columns[0]?.key).toBe('cost');
    expect(columns[0]?.header).toBe('Cost');
    expect(columns[0]?.width).toBe(90);
    expect(columns[0]?.align).toBe('end');
    expect(columns[0]?.format(entry)).toBe('$500');
  });

  it("an object merges per-key over the Field's column defaults", () => {
    const columns = resolveColumns([{ field: 'cost', header: 'Budget' }], costRegistry(), {
      timeZone: zone,
      locale,
    });
    expect(columns[0]?.header).toBe('Budget');
    expect(columns[0]?.width).toBe(90);
    expect(columns[0]?.align).toBe('end');
  });

  it('an unknown key throws UnknownFieldError', () => {
    expect(() => resolveColumns(['nope'], lookupFrom(CORE_FIELDS), { timeZone: zone })).toThrow(
      UnknownFieldError,
    );
  });

  it("gridColumns: ['meta'] throws FieldNotColumnableError", () => {
    expect(() => resolveColumns(['meta'], lookupFrom(CORE_FIELDS), { timeZone: zone })).toThrow(
      FieldNotColumnableError,
    );
  });
});

describe('resolveFieldCompares (D-S4-13)', () => {
  it('includes a Field that is not in gridColumns', () => {
    const compares = resolveFieldCompares(costRegistry().all, { locale });
    expect(compares.some((c) => c.key === 'cost')).toBe(true);
    expect(compares.some((c) => c.key === 'name')).toBe(true);
    expect(compares.find((c) => c.key === 'cost')?.compareStored(1, 2)).toBeLessThan(0);
  });
});

describe('bindGanttFields (D-S4-13)', () => {
  it('one bind returns visible columns and every Field compare', () => {
    const registry = costRegistry();
    const bound = bindGanttFields(
      { field: (key) => registry.get(key), fields: { all: registry.all } },
      ['name'],
      { timeZone: zone, locale },
    );
    expect(bound.columns.map((column) => column.key)).toEqual(['name']);
    expect(bound.fieldCompares.some((compare) => compare.key === 'cost')).toBe(true);
  });
});
