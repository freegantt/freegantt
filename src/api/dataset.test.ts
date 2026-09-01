import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import {
  changeSetId,
  entryId,
  instant,
  invertChangeSet,
  InvalidReplayOriginError,
  EntryNotFoundError,
  UnknownFieldError,
} from './index.js';
import type { ChangeSet, Duration, Entry, EntryInput } from './index.js';

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
    const fields = changes[0]?.updated.map((row) => row.field).sort();
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
    const costRows = changes[0]!.updated.filter((row) => row.field === 'cost');
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
    expect(dataset.entries.fieldValue<Duration>('t1', 'duration')).toEqual({
      value: 1,
      unit: 'millisecond',
    });
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
    expect(dataset.entries.fieldValue<number>('t1', 'cost')).toBe(500);

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
