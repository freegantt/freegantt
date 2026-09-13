import { describe, expect, it } from 'vitest';
import { editableOf, FieldRegistry, requireResolvedIndex } from './field-registry.js';
import { createFieldAccess, readFieldByKey, writeField } from './field-access.js';
import type { Field, FieldType } from '../../model/index.js';
import {
  ComputedFieldCannotBeWrittenError,
  DuplicateFieldKeyError,
  FreeGanttError,
  IllegalCoreFieldOverrideError,
  ReservedFieldKeyError,
  segmentId,
  UnknownAggregatorError,
  UnknownFieldError,
  UnknownFieldTypeError,
} from '../../model/index.js';

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
      kind: 'span' as const,
      start: 0 as never,
      end: 1 as never,
      segments: [{ id: segmentId('t1-seg'), start: 0 as never, end: 1 as never }],
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
      kind: 'span' as const,
      start: 0 as never,
      end: 1 as never,
      segments: [{ id: segmentId('t1-seg'), start: 0 as never, end: 1 as never }],
      props: {},
    };
    const cost = registry.get('cost')!;
    const written = writeField({ __brand: 'ProposedEdit', props: {}, proposedKeys: new Set() }, cost, 500);
    expect(written.props).toEqual({ cost: 500 });
    const next = { ...entry, props: written.props };
    expect(readFieldByKey(next, 'cost', context)).toBe(500);
  });
});

describe("#142 a consumer may override a core Field's editable, and nothing else", () => {
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

  it('a core-key declaration carrying a key other than editable throws IllegalCoreFieldOverrideError', () => {
    expect(() => new FieldRegistry({ fields: [{ key: 'start', rollUp: 'none' }] })).toThrow(
      IllegalCoreFieldOverrideError,
    );
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

  it('registerType(percent, …) throws, but the fieldTypes option overrides it silently', () => {
    const registry = new FieldRegistry();
    expect(() => registry.registerType('percent', {})).toThrow(DuplicateFieldKeyError);

    const withOverride = new FieldRegistry({
      fieldTypes: { percent: { inputType: 'text' } },
      fields: [{ key: 'progress', type: 'percent' }],
    });
    expect(withOverride.get('progress')?.inputType).toBe('text');
  });

  it('a type: percent Field with no rollUp leaves a parent’s stored value untouched (ADR 0008)', () => {
    const registry = new FieldRegistry({ fields: [{ key: 'progress', type: 'percent' }] });
    expect(registry.get('progress')?.rollUp).toBeUndefined();
    expect(registry.rollingUpFields().some((field) => field.key === 'progress')).toBe(false);
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
