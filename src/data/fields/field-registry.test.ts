import { describe, expect, it } from 'vitest';
import { editableOf, FieldRegistry, requireResolvedIndex } from './field-registry.js';
import { createFieldAccess, readFieldByKey, writeField } from './field-access.js';
import type { Duration, Entry, Field, FieldType, Instant } from '../../model/index.js';
import {
  ComputedFieldCannotBeWrittenError,
  DuplicateFieldKeyError,
  FreeGanttError,
  IllegalCoreFieldOverrideError,
  ReservedFieldKeyError,
  UnknownAggregatorError,
  UnknownFieldError,
  UnknownFieldTypeError,
} from '../../model/index.js';
import { DATE_TIME_FORMAT, formatDate, formatEndInclusive, instant, MS } from '../../time/index.js';
import { currency } from './field-types.js';

function ctx(registry: FieldRegistry) {
  return createFieldAccess({ fields: registry, timeZone: 'UTC' });
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

// ADR 0011: a Field key is the whole address. The per-Field storage-strategy table retires —
// a non-core key always lives in `entry.props`, under its own name, with no second address to
// collide on and nothing to read back.
describe('ADR 0011 — a Field key is the whole address', () => {
  it('{ key: "props" } throws ReservedFieldKeyError — props is the one reserved key', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'props' }] })).toThrow(ReservedFieldKeyError);
  });

  it('{ key: cost, type: money } reads entry.read(cost), unmediated', () => {
    const registry = new FieldRegistry({
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    const entry = {
      id: 't1' as never,
      name: 't1',
      start: 0 as never,
      end: 1 as never,
      props: { cost: 500 },
    };
    expect(readFieldByKey(entry, 'cost', ctx(registry))).toBe(500);
  });

  it('{ key: start } with no other key is a no-op override and does not throw', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'start' }] })).not.toThrow();
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

  it('a compute Field naming rollUp throws ComputedFieldCannotBeWrittenError at registration', () => {
    expect(
      () =>
        new FieldRegistry({
          fields: [{ key: 'ref', compute: () => 'x', rollUp: 'sum' } as unknown as Field],
        }),
    ).toThrow(ComputedFieldCannotBeWrittenError);
  });

  it('a compute Field naming editable throws ComputedFieldCannotBeWrittenError at registration', () => {
    expect(
      () =>
        new FieldRegistry({
          fields: [{ key: 'ref', compute: () => 'x', editable: true } as unknown as Field],
        }),
    ).toThrow(ComputedFieldCannotBeWrittenError);
  });

  it('bound FieldContext.read looks up by key after writeField', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    const context = ctx(registry);
    const entry = {
      id: 't1' as never,
      name: 't1',
      start: 0 as never,
      end: 1 as never,
      props: {},
    };
    const cost = registry.get('cost')!;
    const written = writeField({ __brand: 'ProposedEdit', props: {}, proposedKeys: new Set() }, cost, 500);
    expect(written.props).toEqual({ cost: 500 });
    const next = { ...entry, props: written.props };
    expect(readFieldByKey(next, 'cost', context)).toBe(500);
  });
});

describe("#142/#470 a consumer may override a core Field's editable and rollUp, and nothing else", () => {
  // ADR 0015: `false` is an input alias, so the stored Field holds the enum and every reader — the
  // write door, the grid, and `dataset.fields.all` — reads one word back.
  it("{ key: start, editable: false } merges onto the core Field, and stores as 'never'", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'start', editable: false }] });
    expect(registry.get('start')?.editable).toBe('never');
  });

  it('the merged Field keeps its declaration-order position in `all`', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'start', editable: false }] });
    const keys = registry.all.map((field) => field.key);
    expect(keys.indexOf('start')).toBe(1); // after 'name', ahead of 'end'.
  });

  it('a core-key declaration carrying a key other than editable or rollUp throws IllegalCoreFieldOverrideError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'start', compare: () => 0 }] })).toThrow(
      IllegalCoreFieldOverrideError,
    );
  });

  it("{ key: start, rollUp: none } is legal and merges onto core's declaration", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'start', rollUp: 'none' }] });
    expect(registry.get('start')?.rollUp).toBe('none');
    // core's own keys ride along unchanged — only rollUp moved.
    expect(registry.get('start')?.type).toBe('date');
  });

  it('a core-key override naming an unknown Aggregator throws UnknownAggregatorError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'start', rollUp: 'notAnAggregator' }] })).toThrow(
      UnknownAggregatorError,
    );
  });

  it("{ key: end, rollUp: none } is legal and merges onto core's declaration (regression)", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'end', rollUp: 'none' }] });
    expect(registry.get('end')?.rollUp).toBe('none');
    expect(registry.get('end')?.type).toBe('date');
  });

  // C1/#482: `rollUp` is on `CORE_FIELD_OVERRIDABLE_KEYS`, but `start`/`end` are the only core
  // Fields that declare one of their own (`core-fields.ts`, `plans/01` §6). A core Field with no
  // `rollUp` — `name`, `parentId` — has nothing for a consumer's `rollUp` to override, so the door
  // refuses it the same as any other illegal key on that core Field.
  it('a core-key override naming rollUp on `name` (no core rollUp) throws IllegalCoreFieldOverrideError', () => {
    try {
      new FieldRegistry({ fields: [{ key: 'name', rollUp: 'max' }] });
      expect.unreachable('expected IllegalCoreFieldOverrideError');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalCoreFieldOverrideError);
      expect((error as IllegalCoreFieldOverrideError).illegalKey).toBe('rollUp');
      expect((error as IllegalCoreFieldOverrideError).key).toBe('name');
      expect((error as IllegalCoreFieldOverrideError).overridableKeys).toEqual(['editable']);
    }
  });

  it('a core-key override naming rollUp on `parentId` (no core rollUp) throws IllegalCoreFieldOverrideError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'parentId', rollUp: 'count' }] })).toThrow(
      IllegalCoreFieldOverrideError,
    );
  });

  it('overriding rollUp on the same core key twice throws DuplicateFieldKeyError', () => {
    expect(
      () =>
        new FieldRegistry({
          fields: [
            { key: 'start', rollUp: 'none' },
            { key: 'start', rollUp: 'min' },
          ],
        }),
    ).toThrow(DuplicateFieldKeyError);
  });

  // `duration` is core's own compute Field (`core-fields.ts`) — it has no stored home, and no
  // rollUp of its own either. C1: `rollUp` is overridable only on a core Field that declares one
  // (`start`/`end`), so the illegal-override door refuses `duration`'s rollUp before the
  // compute-conflict check ever runs — the same refusal `name`/`parentId` get.
  it('overriding rollUp on the core compute Field duration throws IllegalCoreFieldOverrideError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'duration', rollUp: 'sum' }] })).toThrow(
      IllegalCoreFieldOverrideError,
    );
  });

  it('overriding editable on the core compute Field duration throws ComputedFieldCannotBeWrittenError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'duration', editable: 'never' }] })).toThrow(
      ComputedFieldCannotBeWrittenError,
    );
  });

  it("{ key: start, type: text } throws IllegalCoreFieldOverrideError — a consumer cannot redeclare a core Field's type", () => {
    try {
      new FieldRegistry({ fields: [{ key: 'start', type: 'text' }] });
      expect.unreachable('expected IllegalCoreFieldOverrideError');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalCoreFieldOverrideError);
      expect((error as IllegalCoreFieldOverrideError).illegalKey).toBe('type');
      expect((error as IllegalCoreFieldOverrideError).key).toBe('start');
    }
  });

  it('the illegal-override error names the offending key', () => {
    try {
      new FieldRegistry({ fields: [{ key: 'start', column: { header: 'Start' } }] });
      expect.unreachable('expected IllegalCoreFieldOverrideError');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalCoreFieldOverrideError);
      expect((error as IllegalCoreFieldOverrideError).illegalKey).toBe('column');
      expect((error as IllegalCoreFieldOverrideError).key).toBe('start');
    }
  });

  it('overriding the same core key twice throws DuplicateFieldKeyError', () => {
    expect(
      () =>
        new FieldRegistry({
          fields: [
            { key: 'start', editable: false },
            { key: 'start', editable: true },
          ],
        }),
    ).toThrow(DuplicateFieldKeyError);
  });

  it("a registration writing editable: true stores 'anywhere', the word it aliases", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost', editable: true }] });
    expect(registry.get('cost')?.editable).toBe('anywhere');
  });

  it('a Field that declares no editable stores none, because editableOf answers the default', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    expect(registry.get('cost')).not.toHaveProperty('editable');
    expect(editableOf(registry.get('cost')!)).toBe('anywhere');
  });

  it('a core-key override does not affect a sibling core Field', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'start', editable: false }] });
    expect(registry.get('end')?.editable).toBe('anywhere');
  });
});

describe('setEditable — the one attribute that changes after setup (ADR 0015, Q16)', () => {
  it("reads the new value back, and 'all' carries a new array identity so a subscriber notices", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    const before = registry.all;

    registry.setEditable('cost', 'never');

    expect(registry.get('cost')?.editable).toBe('never');
    expect(registry.all).not.toBe(before);
    expect(registry.all.map((field) => field.key)).toEqual(before.map((field) => field.key));
  });

  it('leaves the Field a caller already holds alone — it is a snapshot, not a signal', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost', editable: 'api' }] });
    const held = registry.get('cost')!;

    registry.setEditable('cost', 'never');

    expect(held.editable).toBe('api');
  });

  it('takes the boolean aliases, and stores the word', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
    registry.setEditable('cost', false);
    expect(registry.get('cost')?.editable).toBe('never');
    registry.setEditable('cost', true);
    expect(registry.get('cost')?.editable).toBe('anywhere');
  });

  it('refuses a key no Field declares — this door changes a Field, it never adds one', () => {
    const registry = new FieldRegistry();
    expect(() => registry.setEditable('nothing-declares-this', 'never')).toThrow(UnknownFieldError);
  });

  it('refuses a compute Field, the same answer the registration door gives', () => {
    const registry = new FieldRegistry();
    expect(() => registry.setEditable('duration', 'never')).toThrow(ComputedFieldCannotBeWrittenError);
  });
});

describe('percent — the shipped Field type', () => {
  it('a Field naming type: percent resolves with no local registration', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'progress', type: 'percent' }] });
    const field = registry.get('progress')!;
    expect(field.inputType).toBe('number');
    expect(typeof field.formatValue).toBe('function');
    expect(typeof field.parseValue).toBe('function');
  });

  it("a Field naming type: percent plus its own column.header still keeps the type's alignment", () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'progress', type: 'percent', column: { header: 'Done' } }],
    });
    const column = registry.get('progress')?.column;
    expect(column?.header).toBe('Done');
    expect(column?.align).toBe('end');
  });

  // #142's rule and #249's rule meet in `mergeColumn`, and only the sizing *pair* crosses from the
  // bundle. The shipped `percent` bundle carries no header, so every row here declares its own.
  describe('a Field column and its type bundle merge key by key, sizing apart', () => {
    const registryFor = (bundle: FieldType['column'], own: Field['column']) =>
      new FieldRegistry({
        fieldTypes: { money: { ...(bundle !== undefined ? { column: bundle } : {}) } },
        fields: [{ key: 'cost', type: 'money', ...(own !== undefined ? { column: own } : {}) }],
      });

    it("the Field's own header wins over the bundle's, and the bundle's width still applies", () => {
      const column = registryFor({ header: 'Bundle', align: 'end', width: 100 }, { header: 'Own' }).get(
        'cost',
      )?.column;
      expect(column).toEqual({ header: 'Own', align: 'end', width: 100 });
    });

    it("the Field's own header wins when the bundle declares no sizing at all", () => {
      const column = registryFor({ header: 'Bundle', align: 'end' }, { header: 'Own' }).get('cost')?.column;
      expect(column).toEqual({ header: 'Own', align: 'end' });
    });

    it('a Field that names a width replaces the bundle’s sizing whole (#249)', () => {
      const column = registryFor(
        { header: 'Bundle', align: 'end', width: 100 },
        { header: 'Own', width: 50 },
      ).get('cost')?.column;
      expect(column).toEqual({ header: 'Own', align: 'end', width: 50 });
    });

    it('a Field that names a flex takes the bundle’s width with it (#249)', () => {
      const column = registryFor(
        { header: 'Bundle', align: 'end', width: 100 },
        { header: 'Own', flex: 1 },
      ).get('cost')?.column;
      expect(column).toEqual({ header: 'Own', align: 'end', flex: 1 });
      expect(column).not.toHaveProperty('width');
    });
  });

  it('a type: percent Field with no rollUp leaves a parent’s stored value untouched (ADR 0008)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'progress', type: 'percent' }] });
    expect(registry.get('progress')?.rollUp).toBeUndefined();
    expect(registry.rollingUpFields().some((field) => field.key === 'progress')).toBe(false);
  });
});

describe('shipped Field types resolve by name with no local fieldTypes', () => {
  const entry = {} as Entry;

  it('{ key: owner, type: text } resolves with no local fieldTypes entry', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'owner', type: 'text' }] });
    const field = registry.get('owner')!;
    expect(field.type).toBe('text');
    expect(field.inputType).toBe('text');
    expect(field.formatValue!('Ada', { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe('Ada');
    expect(field.rollUp).toBeUndefined();
  });

  it('type: number formats through Intl, parses 35, refuses abc, aligns end, and has no rollUp', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'qty', type: 'number' }] });
    const field = registry.get('qty')!;
    expect(field.type).toBe('number');
    expect(field.formatValue!(35, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'decimal' }).format(35),
    );
    expect(field.parseValue!('35', { timeZone: 'UTC' }, entry)).toBe(35);
    expect(field.parseValue!('abc', { timeZone: 'UTC' }, entry)).toBeUndefined();
    expect(field.column?.align).toBe('end');
    expect(field.rollUp).toBeUndefined();
  });

  it('type: date formats an Instant through formatDate, and has no parseValue', () => {
    const noon: Instant = instant('2026-06-15T12:00:00Z');
    const registry = new FieldRegistry({ fields: [{ key: 'due', type: 'date' }] });
    const field = registry.get('due')!;
    expect(field.type).toBe('date');
    expect(field.formatValue!(noon, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe(
      formatDate('UTC', noon, 'en-US', DATE_TIME_FORMAT),
    );
    expect(field).not.toHaveProperty('parseValue');
  });

  it('type: duration formats like the core duration Field', () => {
    const twelveDays: Duration = { value: 12 * MS.DAY, unit: 'millisecond' };
    const registry = new FieldRegistry({ fields: [{ key: 'lead', type: 'duration' }] });
    const field = registry.get('lead')!;
    expect(field.type).toBe('duration');
    expect(field.formatValue!(twelveDays, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe('12 d');
  });

  it("{ key: 'showDaysOnRow', type: 'boolean' } ingests, formats, and opens a checkbox with no parseValue (Q22)", () => {
    const registry = new FieldRegistry({ fields: [{ key: 'showDaysOnRow', type: 'boolean' }] });
    const field = registry.get('showDaysOnRow')!;
    expect(field.type).toBe('boolean');
    expect(field.inputType).toBe('checkbox');
    expect(field.formatValue!(true, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe('true');
    expect(field.formatValue!(false, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe('false');
    expect(field).not.toHaveProperty('parseValue');
    expect(field.rollUp).toBeUndefined();
  });

  it('type: boolean sorts false before true, and an absent reading sorts last either way', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'showDaysOnRow', type: 'boolean' }] });
    const field = registry.get('showDaysOnRow')!;
    expect(field.compare!(false, true)).toBeLessThan(0);
    expect(field.compare!(true, false)).toBeGreaterThan(0);
    expect(field.compare!(true, undefined)).toBeLessThan(0);
    expect(field.compare!(undefined, true)).toBeGreaterThan(0);
  });

  it('{ type: currency({ code: EUR }) } resolves, formats, parses, and does not keep an object on type', () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' }],
    });
    const field = registry.get('cost')!;
    expect(field.type).toBeUndefined();
    expect(typeof field.type).not.toBe('object');
    expect(field.formatValue!(1234.5, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    expect(field.formatValue!(1234.5, { timeZone: 'UTC', locale: 'de-DE' }, entry)).toBe(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    expect(field.parseValue!('35', { timeZone: 'UTC' }, entry)).toBe(35);
    expect(field.rollUp).toBe('sum');
  });

  it('a named registration of a currency bundle still resolves by that name', () => {
    const registry = new FieldRegistry({
      fieldTypes: { eur: currency({ code: 'EUR' }) },
      fields: [{ key: 'cost', type: 'eur' }],
    });
    const field = registry.get('cost')!;
    expect(field.type).toBe('eur');
    expect(field.formatValue!(10, { timeZone: 'UTC', locale: 'en-US' }, entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(10),
    );
  });

  it("{ type: 'not-a-type' } still throws UnknownFieldTypeError", () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'x', type: 'not-a-type' }] })).toThrow(
      UnknownFieldTypeError,
    );
  });
});

describe('core Fields consume the shipped type table', () => {
  it('resolved name/start/end/duration name text/date/date/duration', () => {
    const registry = new FieldRegistry();
    expect(registry.get('name')?.type).toBe('text');
    expect(registry.get('start')?.type).toBe('date');
    expect(registry.get('end')?.type).toBe('date');
    expect(registry.get('duration')?.type).toBe('duration');
    expect(registry.get('parentId')).not.toHaveProperty('type');
    expect(registry.get('hierarchyParentId')).not.toHaveProperty('type');
  });

  it('core end still formats inclusive; a start-less end formats as a plain Instant', () => {
    const registry = new FieldRegistry();
    const start = instant('2026-06-15T00:00:00Z');
    const end = instant('2026-06-20T00:00:00Z');
    const formatCtx = { timeZone: 'UTC', locale: 'en-US' as const };
    const withStart = { start, end } as Entry;
    const formatted = registry.get('end')!.formatValue!(end, formatCtx, withStart);
    expect(formatted).toBe(formatEndInclusive('UTC', { start, end }, 'en-US', DATE_TIME_FORMAT));
    expect(formatted).not.toBe(formatDate('UTC', end, 'en-US', DATE_TIME_FORMAT));
    expect(registry.get('end')!.formatValue!(end, formatCtx, { end } as Entry)).toBe(
      formatDate('UTC', end, 'en-US', DATE_TIME_FORMAT),
    );
  });

  // Same constructor spread the percent test already pins. Core Fields name `date`, so the
  // replacement reaches `start` and `end`. mergeField is `{ ...bundle, ...declared }`: `end`
  // keeps formatEnd and takes only compare.
  it('overriding date rewrites start formatValue and compare; end keeps formatEnd and takes only compare', () => {
    const registry = new FieldRegistry({
      fieldTypes: { date: { formatValue: () => 'OVERRIDE', compare: () => 42 } },
    });
    const start = instant('2026-06-15T00:00:00Z');
    const end = instant('2026-06-20T00:00:00Z');
    const formatCtx = { timeZone: 'UTC', locale: 'en-US' as const };
    const withStart = { start, end } as Entry;

    expect(registry.get('start')!.formatValue!(start, formatCtx, withStart)).toBe('OVERRIDE');
    expect(registry.get('start')!.compare!(start, end)).toBe(42);
    expect(registry.get('end')!.compare!(start, end)).toBe(42);
    expect(registry.get('end')!.formatValue!(end, formatCtx, withStart)).toBe(
      formatEndInclusive('UTC', { start, end }, 'en-US', DATE_TIME_FORMAT),
    );
    expect(registry.get('end')!.formatValue!(end, formatCtx, withStart)).not.toBe('OVERRIDE');
  });
});

describe('requireResolvedIndex — a -1 index refuses to write, instead of landing on "-1" (#260)', () => {
  const start: Field = { key: 'start' };
  const end: Field = { key: 'end' };

  it('answers the position of a Field that is in the array', () => {
    expect(requireResolvedIndex([start, end], end, 'end')).toBe(1);
  });

  it('throws FreeGanttError, naming the key, when the Field is not in the array', () => {
    expect(() => requireResolvedIndex([start], end, 'end')).toThrow(FreeGanttError);
    expect(() => requireResolvedIndex([start], end, 'end')).toThrow(/"end"/);
  });
});
