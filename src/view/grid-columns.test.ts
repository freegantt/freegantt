import { describe, expect, it } from 'vitest';
import { FieldRegistry } from '../data/fields/field-registry.js';
import { FieldNotColumnableError, UnknownFieldError } from '../model/index.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import {
  DEFAULT_COLUMN_WIDTH_PX,
  resolveGanttFields,
  resolveColumns,
  resolveFieldCompares,
  toGridColumn,
} from './grid-columns.js';
import type { FieldLookup } from '../model/index.js';
import type { StoredEntry, Field, FieldKey, Instant } from '../model/index.js';
import { entryId, segmentId } from '../model/index.js';

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

const entryStart = 0 as Instant;
const entryEnd = 1 as Instant;
const entry: StoredEntry = {
  id: entryId('t1'),
  name: 'Alpha',
  start: entryStart,
  end: entryEnd,
  segments: [{ id: segmentId('t1-1'), start: entryStart, end: entryEnd }],
  props: { cost: 500 },
};

describe('resolveColumns (D-S4-12)', () => {
  it("a string takes the Field's column defaults", () => {
    const columns = resolveColumns(['cost'], costRegistry(), { timeZone: zone, locale });
    expect(columns).toHaveLength(1);
    expect(columns[0]?.field).toBe('cost');
    expect(columns[0]?.header).toBe('Cost');
    expect(columns[0]?.width).toBe(90);
    expect(columns[0]?.align).toBe('end');
    expect(columns[0]?.format(entry)).toBe('$500');
  });

  it("an object's align: 'center' overrides the Field's column default", () => {
    const columns = resolveColumns([{ field: 'cost', align: 'center' }], costRegistry(), {
      timeZone: zone,
      locale,
    });
    expect(columns[0]?.align).toBe('center');
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

  it('a column that names no width takes DEFAULT_COLUMN_WIDTH_PX (#139)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'team', column: { header: 'Team' } }] });
    const columns = resolveColumns(['team'], registry, { timeZone: zone, locale });
    expect(columns[0]?.width).toBe(DEFAULT_COLUMN_WIDTH_PX);
    expect(columns[0]?.flex).toBeUndefined();
  });

  it('bind.defaultColumnWidth replaces the fallback for a column with no width of its own (#139)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'team', column: { header: 'Team' } }] });
    const columns = resolveColumns(['team'], registry, {
      timeZone: zone,
      locale,
      defaultColumnWidth: 180,
    });
    expect(columns[0]?.width).toBe(180);
  });

  it('a column that asks to flex keeps no width (#139)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'team', column: { header: 'Team' } }] });
    const columns = resolveColumns([{ field: 'team', flex: 2 }], registry, {
      timeZone: zone,
      locale,
      defaultColumnWidth: 180,
    });
    expect(columns[0]?.width).toBeUndefined();
    expect(columns[0]?.flex).toBe(2);
  });

  it("an authored width beats both the Field's default and defaultColumnWidth (#139)", () => {
    const columns = resolveColumns([{ field: 'cost', width: 200 }], costRegistry(), {
      timeZone: zone,
      locale,
      defaultColumnWidth: 180,
    });
    expect(columns[0]?.width).toBe(200);
  });

  it('an unknown key throws UnknownFieldError', () => {
    expect(() => resolveColumns(['nope'], lookupFrom(CORE_FIELDS), { timeZone: zone })).toThrow(
      UnknownFieldError,
    );
  });

  it("gridColumns: ['parentId'] throws FieldNotColumnableError — a core Field with no column", () => {
    expect(() => resolveColumns(['parentId'], lookupFrom(CORE_FIELDS), { timeZone: zone })).toThrow(
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

  it('the duration cell on a dateless row is blank, not "NaN d" (ADR 0012 Gate)', () => {
    const columns = resolveColumns(['duration'], lookupFrom(CORE_FIELDS), { timeZone: zone, locale });
    const dateless: StoredEntry = { id: entryId('none'), name: 'none', segments: [], props: {} };
    expect(columns[0]?.format(dateless)).toBe('');
  });

  it('duration compareStored orders by Duration.value from the compute read', () => {
    const compares = resolveFieldCompares(lookupFrom(CORE_FIELDS), CORE_FIELDS, {
      timeZone: zone,
      locale,
    });
    const duration = compares.find((c) => c.key === 'duration')!;
    const short: StoredEntry = { ...entry, end: 10 as Instant };
    const long: StoredEntry = { ...entry, end: 40 as Instant };
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
      fields: [{ key: 'cost', type: 'money', editable: true }],
    });
    const renderer = () => ({ text: 'x' });
    const columns = resolveColumns([{ field: 'cost', cellRenderer: renderer, movable: false }], registry, {
      timeZone: zone,
      locale,
    });
    expect(columns[0]?.cellRenderer).toBe(renderer);
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

  it("a Field's own column default never supplies cellRenderer, even set directly on the object (B5, D-S5-17)", () => {
    const rogueRenderer = () => ({ text: 'x' });
    const registry = new FieldRegistry({
      fieldTypes: {
        // `Field.column`'s type excludes `cellRenderer` (model/field.ts); this cast simulates the
        // pre-fix bug's shape reaching `columnFrom` anyway, to prove the merge itself now refuses it.
        money: { column: { width: 90, cellRenderer: rogueRenderer } as { width: number } },
      },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const columns = resolveColumns(['cost'], registry, { timeZone: zone, locale });
    expect(columns[0]).not.toHaveProperty('cellRenderer');
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

  it('carries flex through instead of width when the resolved column flexes (#249)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'team', column: { header: 'Team' } }] });
    const [resolved] = resolveColumns([{ field: 'team', flex: 2 }], registry, { timeZone: zone, locale });
    const column = toGridColumn(resolved!);
    expect(column).toEqual({
      field: 'team',
      header: 'Team',
      align: 'start',
      flex: 2,
      resizable: true,
      movable: true,
    });
    expect(column).not.toHaveProperty('width');
  });
});

// #249: a Grid column states a width or a flex, never both. Compile-time only — never executed.
describe('GridColumn sizing is exclusive at the type level (#249)', () => {
  it('rejects width and flex together, from a Gantt column and from a Field default', () => {
    if (false as boolean) {
      // @ts-expect-error — a Gantt column names width or flex, never both
      const gantt: import('../model/index.js').GridColumn = { field: 'cost', width: 120, flex: 1 };
      // These both compile on their own.
      const fixed: import('../model/index.js').GridColumn = { field: 'cost', width: 120 };
      const flexible: import('../model/index.js').GridColumn = { field: 'cost', flex: 1 };
      const registry = new FieldRegistry({
        fields: [
          {
            key: 'cost',
            // @ts-expect-error — a Field's own column default names width or flex, never both
            column: { width: 120, flex: 1 },
          },
        ],
      });
      void gantt;
      void fixed;
      void flexible;
      void registry;
    }
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
    expect(bound.columns.map((column) => column.field)).toEqual(['name']);
    expect(bound.fieldCompares.some((compare) => compare.key === 'cost')).toBe(true);
  });
});

describe('a hidden column resolves, then leaves the result (D-S5-34, #184)', () => {
  it('what comes back is what the Gantt paints', () => {
    const columns = resolveColumns(['name', { field: 'cost', hidden: true }], costRegistry(), {
      timeZone: zone,
      locale,
    });
    expect(columns.map((column) => column.field)).toEqual(['name']);
  });

  it('a hidden column is still checked, so a misspelled field reports where it is declared', () => {
    expect(() =>
      resolveColumns([{ field: 'nope', hidden: true }], costRegistry(), { timeZone: zone, locale }),
    ).toThrow(UnknownFieldError);
  });

  it('hidden: false paints, and a bare field key is never hidden', () => {
    const columns = resolveColumns(['name', { field: 'cost', hidden: false }], costRegistry(), {
      timeZone: zone,
      locale,
    });
    expect(columns.map((column) => column.field)).toEqual(['name', 'cost']);
  });
});
