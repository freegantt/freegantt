import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { fieldRowsOf } from '../data/change-set.js';
import {
  changeSetId,
  entryId,
  instant,
  invertChangeSet,
  InvalidReplayOriginError,
  EntryNotFoundError,
  MissingPluginError,
  MutationCancelledError,
  RegistrationClosedError,
  UnknownFieldError,
} from './index.js';
import type { ChangeSet, DatasetPlugin, Duration, Entry, EntryInput } from './index.js';

const utc = (iso: string): number => Date.parse(iso);

/** The one entry every test below varies, so each case states only what it is about. */
const oneEntry = (overrides: Partial<EntryInput> = {}): EntryInput => ({
  id: 't1',
  name: 'Design',
  start: '2026-09-01',
  end: '2026-09-08',
  ...overrides,
});

const first = (dataset: Dataset): Entry => {
  const entry = dataset.entries.all[0];
  if (!entry) throw new Error('expected one entry');
  return entry;
};

describe('new Dataset()', () => {
  it('takes plain string ids and brands them', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ id: 'root' }), oneEntry({ id: 't1', parentId: 'root' })],
    });
    expect(first(dataset).id).toBe(entryId('root'));
    expect(dataset.entries.all[1]?.parentId).toBe(entryId('root'));
  });

  it("takes date strings and reads them in the dataset's zone", () => {
    const utcDataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const chicago = new Dataset({ timeZone: 'America/Chicago', entries: [oneEntry()] });
    expect(first(utcDataset).start).toBe(utc('2026-09-01T00:00:00Z'));
    expect(first(chicago).start).toBe(utc('2026-09-01T05:00:00Z'));
  });

  // A `Date` input is exercised in time/input.test.ts instead: I10 bans `new Date()` outside time/,
  // and that is the layer that actually reads one.
  it('takes epoch milliseconds and an already-branded Instant unchanged', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        oneEntry({ id: 'a', start: 1_000_000, end: 2_000_000 }),
        oneEntry({ id: 'b', start: instant('2026-09-01T00:00:00Z'), end: 3_000_000 }),
      ],
    });
    expect(first(dataset).start).toBe(1_000_000);
    expect(first(dataset).end).toBe(2_000_000);
    expect(dataset.entries.all[1]?.start).toBe(utc('2026-09-01T00:00:00Z'));
  });

  it('reads a date-only end as inclusive by default', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(first(dataset).end).toBe(utc('2026-09-09T00:00:00Z'));
    expect(dataset.dateOnlyEnd).toBe('inclusive');
  });

  it("reads a date-only end literally under dateOnlyEnd: 'exclusive'", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      dateOnlyEnd: 'exclusive',
      entries: [oneEntry()],
    });
    expect(first(dataset).end).toBe(utc('2026-09-08T00:00:00Z'));
    expect(dataset.dateOnlyEnd).toBe('exclusive');
  });

  it('leaves an end that carries a time of day alone under either rule', () => {
    for (const dateOnlyEnd of ['inclusive', 'exclusive'] as const) {
      const dataset = new Dataset({
        timeZone: 'UTC',
        dateOnlyEnd,
        entries: [oneEntry({ end: '2026-09-08T00:00:00Z' })],
      });
      expect(first(dataset).end).toBe(utc('2026-09-08T00:00:00Z'));
    }
  });

  it('reads segment spans by the same rules as the entry span', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        oneEntry({
          segments: [
            { start: '2026-09-01', end: '2026-09-02' },
            { start: '2026-09-05', end: '2026-09-08' },
          ],
        }),
      ],
    });
    expect(first(dataset).segments).toEqual([
      { start: utc('2026-09-01T00:00:00Z'), end: utc('2026-09-03T00:00:00Z') },
      { start: utc('2026-09-05T00:00:00Z'), end: utc('2026-09-09T00:00:00Z') },
    ]);
  });

  it('carries optional fields through, and leaves absent ones absent', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ kind: 'milestone', meta: { team: 'A' } })],
    });
    const entry = first(dataset);
    expect(entry.kind).toBe('milestone');
    expect(entry.meta).toEqual({ team: 'A' });
    // exactOptionalPropertyTypes: an absent key must not become a key holding undefined.
    expect(Object.keys(entry).sort()).toEqual(['end', 'id', 'kind', 'meta', 'start', 'name'].sort());
  });

  it('does not mutate the entries the consumer handed it', () => {
    const input = oneEntry();
    const dataset = new Dataset({ timeZone: 'UTC', entries: [input] });
    expect(input.start).toBe('2026-09-01');
    expect(first(dataset)).not.toBe(input);
  });
});

describe('Dataset timeZone omission (#129)', () => {
  it('new Dataset({ entries }) works with no timeZone and resolves a concrete IANA string', () => {
    const dataset = new Dataset({ entries: [oneEntry()] });
    expect(typeof dataset.timeZone).toBe('string');
    expect(dataset.timeZone.length).toBeGreaterThan(0);
  });

  it('an explicit timeZone still overrides the resolved default', () => {
    const dataset = new Dataset({ timeZone: 'America/Chicago', entries: [oneEntry()] });
    expect(dataset.timeZone).toBe('America/Chicago');
  });

  it('a Plain date in entries ingests through the resolved zone, not through UTC', () => {
    // The whole point of resolving a zone: the omitted path must feed the same ingest the explicit
    // path feeds. `2026-09-01` in New York is 04:00Z, five hours after the same date read as UTC.
    const original = Intl.DateTimeFormat;
    Intl.DateTimeFormat = (() => ({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }) as Intl.ResolvedDateTimeFormatOptions,
    })) as unknown as typeof Intl.DateTimeFormat;
    try {
      const resolved = new Dataset({ entries: [oneEntry()] });
      const explicit = new Dataset({ timeZone: 'America/New_York', entries: [oneEntry()] });

      expect(resolved.timeZone).toBe('America/New_York');
      expect(first(resolved).start).toBe(utc('2026-09-01T04:00:00Z'));
      expect(first(resolved).start).toBe(first(explicit).start);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it('toJSON/fromJSON round-trips the resolved zone, not a sentinel', () => {
    const dataset = new Dataset({ entries: [oneEntry()] });
    const doc = dataset.toJSON();
    expect(doc.timeZone).toBe(dataset.timeZone);
    expect(doc.timeZone).not.toBe('local');

    const restored = Dataset.fromJSON(doc);
    expect(restored.timeZone).toBe(dataset.timeZone);
  });
});

describe('Dataset.time (S5.6, D-S5-16)', () => {
  it("is bound to this Dataset's own zone", () => {
    const dataset = new Dataset({ timeZone: 'America/Chicago', entries: [oneEntry()] });
    expect(dataset.time.zone).toBe('America/Chicago');
  });

  it('a Dataset with no explicit timeZone binds the resolved one (#129)', () => {
    const dataset = new Dataset({ entries: [oneEntry()] });
    expect(dataset.time.zone).toBe(dataset.timeZone);
    expect(dataset.time.zone.length).toBeGreaterThan(0);
  });

  it('forwards zone-aware date arithmetic — eachDay/dayOfWeek pick out a week of weekends', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const start = dataset.time.startOfDay(instant('2026-06-15T00:00:00Z')); // a Monday
    const end = dataset.time.addDays(start, 7);
    const weekendDays = dataset.time
      .eachDay({ start, end })
      .filter((day) => dataset.time.dayOfWeek(day) >= 6);
    expect(weekendDays).toHaveLength(2);
  });
});

describe('Dataset transaction/on/off delegation', () => {
  it('transaction() returns the body value; an empty body emits no change', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    let fired = false;
    dataset.on('change', () => {
      fired = true;
    });

    const result = dataset.transaction(() => 'ok');

    expect(result).toBe('ok');
    expect(fired).toBe(false);
  });

  it('entries.childrenOf returns direct children; rollUpKinds defaults to group', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'p1', name: 'Sitework', kind: 'group' }, oneEntry({ id: 't1', parentId: 'p1' })],
    });
    expect(dataset.rollUpKinds).toEqual(['group']);
    expect(dataset.hierarchy).toEqual({ autoGroup: true });
    expect(dataset.entries.childrenOf('p1').map((e) => e.id)).toEqual([entryId('t1')]);
  });

  it("rollUpKinds setter accepts 'none' and [] as empty-list sugar (D-S4-6)", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'p1', name: 'Sitework', kind: 'group', start: '2026-01-01', end: '2026-01-05' }],
    });
    dataset.rollUpKinds = 'none';
    expect(dataset.rollUpKinds).toEqual([]);
    expect(dataset.isRollUpKind('group')).toBe(false);
    dataset.rollUpKinds = [];
    expect(dataset.rollUpKinds).toEqual([]);
    dataset.rollUpKinds = ['group'];
    expect(dataset.rollUpKinds).toEqual(['group']);
    expect(dataset.isRollUpKind('group')).toBe(true);
  });

  it('live hierarchy.autoGroup changes later first-child promotions only', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p-off', name: 'Off', start: '2026-01-01', end: '2026-01-05' },
        { id: 'p-on', name: 'On', start: '2026-01-01', end: '2026-01-05' },
      ],
    });
    dataset.hierarchy = { autoGroup: false };
    dataset.entries.add({
      id: 'c-off',
      parentId: 'p-off',
      name: 'Child off',
      start: '2026-02-01',
      end: '2026-02-05',
    });
    expect(dataset.entries.get('p-off')!.kind).toBe('span');

    dataset.hierarchy = { autoGroup: true };
    dataset.entries.add({
      id: 'c-on',
      parentId: 'p-on',
      name: 'Child on',
      start: '2026-03-01',
      end: '2026-03-05',
    });
    expect(dataset.entries.get('p-on')!.kind).toBe('group');
    expect(dataset.entries.get('p-off')!.kind).toBe('span');
  });

  it('off() stops a handler from seeing further events', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    let calls = 0;
    const handler = (): void => {
      calls += 1;
    };
    dataset.on('beforeChange', handler);
    dataset.off('beforeChange', handler);
    dataset.transaction(() => undefined);
    expect(calls).toBe(0);
  });

  it('toJSON / fromJSON round-trips byte-stable on the façade (D-S2-12)', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ start: '2026-09-01T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' })],
    });
    const doc = dataset.toJSON();
    const round = Dataset.fromJSON(doc).toJSON();
    expect(JSON.stringify(round)).toBe(JSON.stringify(doc));
  });

  it('[S4-A1] fromJSON(toJSON(d), { aggregators }) still sums after a later child edit', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Sitework', kind: 'group' },
        oneEntry({ id: 'leaf', parentId: 'root', meta: { cost: 100 } }),
      ],
    });
    expect(dataset.entries.fieldValue('root', 'cost')).toBe(100);
    const restored = Dataset.fromJSON(dataset.toJSON(), { aggregators: {} });
    expect(restored.entries.fieldValue('root', 'cost')).toBe(100);
    restored.entries.update('leaf', { cost: 250 });
    expect(restored.entries.fieldValue('leaf', 'cost')).toBe(250);
    expect(restored.entries.fieldValue('root', 'cost')).toBe(250);
  });
});

/** A consumer History, written against `Dataset`'s public surface only — no `data/` import
 *  (`plans/s2-data-core/s2b-undo-replay-seam.md`). Exactly the shape the seam doc's decision names. */
class ConsumerHistory {
  #stack: ChangeSet[] = [];

  constructor(dataset: Dataset) {
    dataset.on('change', ({ changeSet }) => {
      if (changeSet.origin === 'user') this.#stack.push(changeSet);
    });
  }

  undo(dataset: Dataset): void {
    const changeSet = this.#stack.pop();
    if (changeSet) dataset.replay(invertChangeSet(changeSet));
  }
}

describe('Dataset.replay / invertChangeSet (consumer-surface undo)', () => {
  it('a consumer History built on on/replay/invertChangeSet undoes a rollup cascade, restoring both rows', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'parent', name: 'Sitework', kind: 'group' },
        oneEntry({ id: 'child', parentId: 'parent' }),
      ],
    });
    const parentBefore = dataset.entries.get('parent')!;
    const childBefore = dataset.entries.get('child')!;
    const history = new ConsumerHistory(dataset);

    dataset.entries.update('child', { end: '2026-10-01' });
    expect(dataset.entries.get('parent')?.end).not.toEqual(parentBefore.end);

    history.undo(dataset);

    expect(dataset.entries.get('child')?.end).toEqual(childBefore.end);
    expect(dataset.entries.get('parent')?.start).toEqual(parentBefore.start);
    expect(dataset.entries.get('parent')?.end).toEqual(parentBefore.end);
  });

  it("replay refuses origin 'user' with InvalidReplayOriginError and never calls an injected extender", () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const changeSet: ChangeSet = {
      id: changeSetId(1),
      origin: 'user',
      added: [],
      removed: [],
      updated: [{ store: 'entries', id: first(dataset).id, field: 'name', from: 'Design', to: 'Blocked' }],
    };

    expect(() => dataset.replay(changeSet)).toThrow(InvalidReplayOriginError);
    expect(first(dataset).name).toBe('Design');
  });

  it('replay with an empty changeset is a no-op: no event, no throw', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    let fired = false;
    dataset.on('change', () => {
      fired = true;
    });

    expect(() =>
      dataset.replay({ id: changeSetId(1), origin: 'undo', added: [], removed: [], updated: [] }),
    ).not.toThrow();
    expect(fired).toBe(false);
  });
});

describe('Dataset fields (S4.1)', () => {
  it('field(key) returns the resolved declaration, and fields.all lists them (#125)', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [oneEntry({ meta: { cost: 400 } })],
    });

    expect(dataset.field('cost')).toEqual(
      expect.objectContaining({
        key: 'cost',
        type: 'money',
        rollUp: 'sum',
        source: { from: 'meta', key: 'cost' },
      }),
    );
    expect(dataset.field('missing')).toBeUndefined();

    const keys = dataset.fields.all.map((field) => field.key);
    expect(keys).toContain('start');
    expect(keys).toContain('cost');
    expect(dataset.fields).not.toHaveProperty('get');
  });

  it("update('t1', { start, cost }) is one transaction and one changeset", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [oneEntry({ meta: { cost: 400 } })],
    });
    const changes: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });

    const updated = dataset.entries.update('t1', { start: '2026-10-05', cost: 500 });

    expect(changes).toHaveLength(1);
    expect(updated.meta).toEqual({ cost: 500 });
    const fields = fieldRowsOf(changes[0]!)
      .map((row) => row.field)
      .sort();
    expect(fields).toEqual(['cost', 'start']);
    expect(changes[0]?.updated).toContainEqual(
      expect.objectContaining({ field: 'cost', from: 400, to: 500 }),
    );
  });

  it("a child cost edit rolls the group parent's cost in the same changeset (S4.2)", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Root', kind: 'group' },
        {
          id: 'leaf',
          name: 'Leaf',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          meta: { cost: 100 },
        },
      ],
    });
    const changes: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });

    dataset.entries.update('leaf', { cost: 500 });

    expect(changes).toHaveLength(1);
    const costRows = fieldRowsOf(changes[0]!).filter((row) => row.field === 'cost');
    expect(costRows.map((row) => row.id)).toEqual(expect.arrayContaining(['root', 'leaf']));
  });

  it("D-S4-11: a child cost edit leaves entries.all's order and the other child's stored cost", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Root', kind: 'group' },
        {
          id: 'a',
          name: 'A',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          meta: { cost: 40, team: 'A' },
        },
        {
          id: 'b',
          name: 'B',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          meta: { cost: 60, team: 'B' },
        },
      ],
    });
    const order = dataset.entries.all.map((entry) => String(entry.id));

    dataset.entries.update('a', { cost: 50 });

    expect(dataset.entries.all.map((entry) => String(entry.id))).toEqual(order);
    expect(dataset.entries.get('b')?.meta).toEqual({ cost: 60, team: 'B' });
    expect(dataset.entries.get('root')?.meta).toEqual({ cost: 110 });
  });
});

describe('entries.fieldValue', () => {
  it('reads a meta Field without going through entry.meta', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'money' }],
      fieldTypes: { money: { rollUp: 'sum' } },
      entries: [oneEntry()],
    });
    dataset.entries.update('t1', { cost: 500 });
    expect(dataset.entries.fieldValue('t1', 'cost')).toBe(500);
  });

  it('reads an entry-sourced Field', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(dataset.entries.fieldValue('t1', 'start')).toBe(first(dataset).start);
    expect(dataset.entries.fieldValue('t1', 'name')).toBe('Design');
  });

  it('reads duration on a headless Dataset before any Gantt exists', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      dateOnlyEnd: 'exclusive',
      entries: [oneEntry({ start: 0, end: 1 })],
    });
    // `duration` computes its value and owns no `Entry` key, and still reads back as a `Duration`.
    const duration: Duration | undefined = dataset.entries.fieldValue('t1', 'duration');
    expect(duration).toEqual({ value: 1, unit: 'millisecond' });
  });

  it('throws UnknownFieldError for an unregistered key', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(() => dataset.entries.fieldValue('t1', 'cost')).toThrow(UnknownFieldError);
  });

  it('throws EntryNotFoundError for a missing id', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(() => dataset.entries.fieldValue('missing', 'name')).toThrow(EntryNotFoundError);
  });

  it('reads a staged write inside an open transaction', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost' }],
      entries: [oneEntry()],
    });
    dataset.transaction(() => {
      dataset.entries.update('t1', { cost: 40 });
      expect(dataset.entries.fieldValue('t1', 'cost')).toBe(40);
    });
  });
});

describe('Dataset generics (#123)', () => {
  it('types meta from TMeta and declared Field writes from TFields', () => {
    const dataset = new Dataset<{ team: string }, { cost: number }>({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        {
          id: 't1',
          name: 'Design',
          start: '2026-09-01',
          end: '2026-09-08',
          meta: { team: 'A' },
        },
      ],
    });

    const team: string | undefined = dataset.entries.get('t1')?.meta?.team;
    expect(team).toBe('A');

    const updated = dataset.entries.update('t1', { cost: 500 });
    expect(updated.meta?.team).toBe('A');

    // The key types the read — no type argument at the call, and no `as` (#144, ADR 0005).
    const cost: number | undefined = dataset.entries.fieldValue('t1', 'cost');
    expect(cost).toBe(500);
    const name: string | undefined = dataset.entries.fieldValue('t1', 'name');
    expect(name).toBe('Design');

    const fromJson = Dataset.fromJSON<{ team: string }, { cost: number }>(dataset.toJSON());
    expect(fromJson.entries.get('t1')?.meta?.team).toBe('A');

    // Compile-time only: a string is not a number for `cost`, and `bogus` is not a Field key.
    if (false as boolean) {
      // @ts-expect-error — cost is number
      dataset.entries.update('t1', { cost: 'nope' });
      // @ts-expect-error — undeclared key
      dataset.entries.update('t1', { bogus: 1 });
    }
  });
});

// S5.10, D-S5-23/24/30/31: `DatasetOptions.plugins` is the public way in. Each case below writes a
// plugin the way an application author writes one — a factory returning `{ id, setup }`.
describe('Dataset plugins (S5.10)', () => {
  interface LockRow {
    readonly locked: true;
  }

  /** Locks one entry: its own store row says which, and `beforeChange` refuses any commit that
   *  touches it — the same shape harness/plugins/lock-entries.ts ships (D-S5-24's refusal note). */
  function lockEntries(ids: readonly string[]): DatasetPlugin {
    return {
      id: 'demo.lock',
      setup(ctx) {
        const store = ctx.store.reserve<LockRow>();
        for (const id of ids) store.set(entryId(id), { locked: true });
        ctx.events.on('beforeChange', ({ changeSet }) =>
          fieldRowsOf(changeSet).some((row) => store.get(row.id) !== undefined) ? false : undefined,
        );
      },
    };
  }

  it('installs the plugins the options list, and reports them read-only', () => {
    const plugin = lockEntries([]);
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [plugin] });
    expect(dataset.plugins).toEqual([plugin]);
  });

  it('seeds a store during setup, before any consumer handler or history exists', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    expect(dataset.canUndo).toBe(false);
    expect(dataset.toJSON().plugins).toEqual({ 'demo.lock': { t1: { locked: true } } });
  });

  it('refuses an edit to a locked entry through beforeChange (D-S5-24)', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    expect(() => dataset.entries.update('t1', { name: 'Renamed' })).toThrow(MutationCancelledError);
    expect(first(dataset).name).toBe('Design');
  });

  it('keeps two Datasets independent under one plugin id (I2)', () => {
    const locked = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    const open = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries([])] });

    expect(() => locked.entries.update('t1', { name: 'Renamed' })).toThrow(MutationCancelledError);
    expect(open.entries.update('t1', { name: 'Renamed' }).name).toBe('Renamed');
    expect(open.toJSON().plugins).toBeUndefined();
  });

  it('throws RegistrationClosedError when a plugin registers a Field after setup returned', () => {
    let registerLate = (): void => undefined;
    const late: DatasetPlugin = {
      id: 'demo.late',
      setup(ctx) {
        registerLate = () => ctx.fields.register({ key: 'cost' });
      },
    };
    new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [late] });
    expect(registerLate).toThrow(RegistrationClosedError);
  });

  it('has a Field a plugin declares in the registry before the first Rollup walks (D-S5-4)', () => {
    const declaresCost: DatasetPlugin = {
      id: 'demo.cost',
      setup(ctx) {
        ctx.fields.registerType('money', { rollUp: 'sum' });
        ctx.fields.register({ key: 'cost', type: 'money' });
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'Sitework', kind: 'group', start: '2026-09-01', end: '2026-09-02' },
        oneEntry({ id: 't1', parentId: 'p1', meta: { cost: 500 } }),
      ],
      plugins: [declaresCost],
    });
    expect(dataset.field('cost')?.type).toBe('money');
    expect(dataset.entries.fieldValue('p1', 'cost')).toBe(500);
  });

  it('sets up in requires order, whichever order the array writes (D-S5-31)', () => {
    const order: string[] = [];
    const base: DatasetPlugin = {
      id: 'demo.base',
      setup(ctx) {
        order.push('base');
        ctx.store.reserve<{ note: string }>().set(entryId('t1'), { note: 'from base' });
      },
    };
    const reader: DatasetPlugin = {
      id: 'demo.reader',
      requires: ['demo.base'],
      setup(ctx) {
        order.push('reader');
        // The store its prerequisite reserved is already there to read (D-S5-30).
        seen = ctx.store.read<{ note: string }>('demo.base')?.get(entryId('t1'))?.note;
      },
    };
    let seen: string | undefined;

    new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [reader, base] });
    expect(order).toEqual(['base', 'reader']);
    expect(seen).toBe('from base');
  });

  it('throws MissingPluginError naming both ids when a prerequisite is absent', () => {
    const orphan: DatasetPlugin = { id: 'demo.reader', requires: ['demo.base'], setup: () => undefined };
    expect(() => new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [orphan] })).toThrow(
      MissingPluginError,
    );
  });

  it('composes the extension hook in that same order, rather than evicting it (D-S5-23)', () => {
    const cascadesTo = (id: string, to: string): DatasetPlugin => ({
      id,
      ...(id === 'demo.second' ? { requires: ['demo.first'] } : {}),
      setup(ctx) {
        ctx.edits.setExtender(
          (next) => (request) => new Map([...next(request), [entryId(to), { name: to }]]),
        );
      },
    });
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry(), oneEntry({ id: 'a' }), oneEntry({ id: 'b' })],
      plugins: [cascadesTo('demo.second', 'b'), cascadesTo('demo.first', 'a')],
    });

    dataset.entries.update('t1', { name: 'Renamed' });
    // Both wrappers ran: the second added to the first output instead of replacing it.
    expect(dataset.entries.get('a')?.name).toBe('a');
    expect(dataset.entries.get('b')?.name).toBe('b');
  });

  it('releases every plugin on destroy()', () => {
    const released: string[] = [];
    const noisy: DatasetPlugin = {
      id: 'demo.noisy',
      setup: () => () => released.push('demo.noisy'),
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [noisy] });
    dataset.destroy();
    expect(released).toEqual(['demo.noisy']);
  });

  it('carries plugin rows through a public toJSON/fromJSON round trip', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    const reopened = Dataset.fromJSON(dataset.toJSON());
    // No plugin installed on the reading side, so nothing refuses the write — and the rows survive.
    expect(reopened.entries.update('t1', { name: 'Renamed' }).name).toBe('Renamed');
    expect(reopened.toJSON().plugins).toEqual({ 'demo.lock': { t1: { locked: true } } });
  });
});
