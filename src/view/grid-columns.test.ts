import { describe, expect, it } from 'vitest';
import { FieldRegistry } from '../data/fields/field-registry.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import { resolveGanttFields, resolveColumns, resolveFieldCompares, toGridColumn } from './grid-columns.js';
import type { FieldLookup } from '../model/index.js';
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
    const registry = costRegistry();
    const compares = resolveFieldCompares(registry, registry.all, { timeZone: zone, locale });
    expect(compares.some((c) => c.key === 'cost')).toBe(true);
    expect(compares.some((c) => c.key === 'name')).toBe(true);
    expect(compares.find((c) => c.key === 'cost')?.compareStored(1, 2)).toBeLessThan(0);
    expect(compares.find((c) => c.key === 'cost')?.readStored(entry)).toBe(500);
  });

  it('places undefined and null last', () => {
    const compares = resolveFieldCompares(lookupFrom(CORE_FIELDS), CORE_FIELDS, {
      timeZone: zone,
      locale,
    });
    const nameCompare = compares.find((c) => c.key === 'name');
    expect(nameCompare?.compareStored(undefined, 'a')).toBeGreaterThan(0);
    expect(nameCompare?.compareStored('a', null)).toBeLessThan(0);
  });

  it('duration compareStored orders by Duration.value from the compute read', () => {
    const compares = resolveFieldCompares(lookupFrom(CORE_FIELDS), CORE_FIELDS, {
      timeZone: zone,
      locale,
    });
    const duration = compares.find((c) => c.key === 'duration')!;
    const short: Entry = { ...entry, end: 10 as Entry['end'] };
    const long: Entry = { ...entry, end: 40 as Entry['end'] };
    expect(duration.readStored(short)).toEqual({ value: 10, unit: 'millisecond' });
    expect(duration.compareStored(duration.readStored(short), duration.readStored(long))).toBeLessThan(0);
  });
});

describe('resolveColumns — cellRenderer/editable/resizable/movable (S5.7, D-S5-17/D-S5-18)', () => {
  it('resolve and merge like the existing keys: this Gantt beats the Field default, which beats the built-in default', () => {
    const registry = new FieldRegistry({
      fieldTypes: {
        money: {
          rollUp: 'sum',
          column: { width: 90, align: 'end', header: 'Cost', resizable: false },
        },
      },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const renderer = () => ({ text: 'x' });
    const columns = resolveColumns(
      [{ field: 'cost', cellRenderer: renderer, editable: true, movable: false }],
      registry,
      { timeZone: zone, locale },
    );
    expect(columns[0]?.cellRenderer).toBe(renderer);
    expect(columns[0]?.editable).toBe(true);
    // this Gantt's own gridColumns entry never set resizable — the Field's own column default (false) wins.
    expect(columns[0]?.resizable).toBe(false);
    // this Gantt's own gridColumns entry sets movable directly, over no Field default.
    expect(columns[0]?.movable).toBe(false);
  });

  it('resizable/movable default true when neither this Gantt nor the Field says otherwise', () => {
    const columns = resolveColumns(['cost'], costRegistry(), { timeZone: zone, locale });
    expect(columns[0]?.resizable).toBe(true);
    expect(columns[0]?.movable).toBe(true);
  });

  it('cellRenderer/editable stay absent when nothing set them', () => {
    const columns = resolveColumns(['cost'], costRegistry(), { timeZone: zone, locale });
    expect(columns[0]).not.toHaveProperty('cellRenderer');
    expect(columns[0]).not.toHaveProperty('editable');
  });
});

describe('toGridColumn (S5.7, D-S5-18)', () => {
  it('maps a resolved column back to the public GridColumn shape, dropping format', () => {
    const renderer = () => ({ text: 'x' });
    const [resolved] = resolveColumns(
      [{ field: 'cost', header: 'Budget', cellRenderer: renderer, resizable: false }],
      costRegistry(),
      { timeZone: zone, locale },
    );
    const column = toGridColumn(resolved!);
    expect(column).toEqual({
      field: 'cost',
      header: 'Budget',
      align: 'end',
      width: 90,
      resizable: false,
      movable: true,
      cellRenderer: renderer,
    });
    expect(column).not.toHaveProperty('format');
  });
});

describe('resolveGanttFields (D-S4-13)', () => {
  it('one locale resolve returns visible columns and every Field compare', () => {
    const registry = costRegistry();
    const bound = resolveGanttFields(
      { field: (key) => registry.get(key), fields: { all: registry.all }, timeZone: zone },
      ['name'],
      { timeZone: zone, locale },
    );
    expect(bound.columns.map((column) => column.key)).toEqual(['name']);
    expect(bound.fieldCompares.some((compare) => compare.key === 'cost')).toBe(true);
  });
});
