import { describe, expect, it, vi } from 'vitest';
import { Dataset, extraEditsFor } from './dataset.js';
import { fieldRowsOf } from '../data/change-set.js';
import {
  changeSetId,
  entryId,
  formatDateTime,
  formatInclusiveDate,
  instant,
  invertChangeSet,
  mergeEntryEdits,
  InvalidReplayOriginError,
  ComputedFieldCannotBeWrittenError,
  DuplicateEntryIdError,
  EntryNotFoundError,
  FieldNotEditableError,
  IllegalCoreFieldOverrideError,
  MissingPluginError,
  MutationCancelledError,
  ParentCycleError,
  PluginSetupError,
  RegistrationClosedError,
  UnknownFieldError,
  DuplicatePluginIdError,
} from './index.js';
import { diffMs, spansTime } from './index.js';
import type { ChangeSet, DataPlugin, Duration, Entry, EntryInput, Field } from './index.js';
import type { EditRequest, ProposedEdit, ProposedEdits, WriteTarget } from '../model/index.js';
import { lockEntries } from '../../harness/plugins/lock-entries.js';

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
    expect(dataset.entries.all[1]?.parent()?.id).toBe(entryId('root'));
  });

  it("takes date strings and reads them in the dataset's zone", () => {
    const utcDataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const chicago = new Dataset({ timeZone: 'America/Chicago', entries: [oneEntry()] });
    expect(first(utcDataset).start).toBe(utc('2026-09-01T00:00:00Z'));
    expect(first(chicago).start).toBe(utc('2026-09-01T05:00:00Z'));
  });

  // Retired (ADR 0026, #421): 'gives an entry authored without segments one Segment, with a minted
  // id' and 'mints Segment ids from a per-instance counter' pinned `Entry.segments` and its minted
  // ids. The `Segment` type no longer exists — an Entry has no stored classification and no internal parts.

  // A `Date` input is exercised in time/input.test.ts instead: I10 bans `new Date()` outside time/,
  // and that is the layer that actually reads one.
  it('takes epoch milliseconds and an already-branded Instant unchanged', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        oneEntry({ id: 'a', start: 1_000_000, end: 2_000_000 }),
        oneEntry({
          id: 'b',
          start: instant('2026-09-01T00:00:00Z'),
          end: instant('2026-09-01T00:50:00Z'),
        }),
      ],
    });
    expect(first(dataset).start).toBe(1_000_000);
    expect(first(dataset).end).toBe(2_000_000);
    expect(dataset.entries.all[1]?.start).toBe(utc('2026-09-01T00:00:00Z'));
  });

  it('reads a date-only end as through that day, with or without a start', () => {
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    const withStart = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(first(withStart).end).toBe(utc('2026-09-09T00:00:00Z'));

    const noStart = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'A', end: '2026-03-04' }],
    });
    expect(first(noStart).end).toBe(utc('2026-03-05T00:00:00Z'));
  });

  it('offers no dateOnlyEnd option: a date-only end always means through that day', () => {
    // @ts-expect-error — dateOnlyEnd is not a DatasetOptions key.
    new Dataset({ timeZone: 'UTC', dateOnlyEnd: 'exclusive', entries: [oneEntry()] });
  });

  it('leaves an end that carries a time of day alone, stored as is', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ end: '2026-09-08T17:00:00Z' })],
    });
    expect(first(dataset).end).toBe(utc('2026-09-08T17:00:00Z'));
  });

  // Retired (ADR 0026, #421): 'reads segment spans by the same rules as the entry span' pinned a
  // `segments:` entry input, which no longer exists — an Entry's span is its own `start`/`end`,
  // already covered by "reads a date-only end as inclusive by default" above.

  it('carries optional fields through, and leaves absent ones absent', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ props: { team: 'A' } })],
    });
    // The shape a row *stores* is this test's subject, so it reads the stored values (ADR 0017).
    const entry = dataset.entries.storedValues.get(first(dataset).id)!;
    expect(entry.props).toEqual({ team: 'A' });
    // exactOptionalPropertyTypes: an absent key must not become a key holding undefined.
    expect(Object.keys(entry).sort()).toEqual(['end', 'id', 'props', 'start', 'name', 'siblingIndex'].sort());
  });

  it('does not mutate the entries the consumer handed it', () => {
    const input = oneEntry();
    const dataset = new Dataset({ timeZone: 'UTC', entries: [input] });
    expect(input.start).toBe('2026-09-01');
    expect(first(dataset)).not.toBe(input);
  });

  it('takes an omitted start/end, and an explicit undefined, leaving both absent (#431)', () => {
    const omitted = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'No span' }],
    });
    expect(first(omitted).start).toBeUndefined();
    expect(first(omitted).end).toBeUndefined();

    const explicitUndefined = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'No span', start: undefined, end: undefined }],
    });
    expect(first(explicitUndefined).start).toBeUndefined();
    expect(first(explicitUndefined).end).toBeUndefined();
  });

  it('rejects a null start/end with a fault naming the fix, not a zone problem (#431)', () => {
    // The way this actually reaches a consumer: a row read from JSON, where a missing column often
    // deserializes as `null` rather than an absent key.
    const rows = JSON.parse('[{"id":"t1","name":"P","start":null,"end":null}]') as EntryInput[];
    expect(() => new Dataset({ timeZone: 'UTC', entries: rows })).toThrow(
      'null names no instant. An absent date is a value left out, not a null one. Write a date, or leave it out.',
    );
    expect(() => new Dataset({ timeZone: 'UTC', entries: rows })).not.toThrow(/offset|zone/i);
  });

  it('rejects a null end on its own, once start reads fine (#431)', () => {
    expect(
      () => new Dataset({ timeZone: 'UTC', entries: [oneEntry({ end: null as unknown as string })] }),
    ).toThrow(
      'null names no instant. An absent date is a value left out, not a null one. Write a date, or leave it out.',
    );
  });

  describe('checks its own batch the same way entries.load does (ADR 0031)', () => {
    it('throws DuplicateEntryIdError for two entries naming the same id', () => {
      expect(
        () =>
          new Dataset({
            timeZone: 'UTC',
            entries: [oneEntry({ id: 'a' }), oneEntry({ id: 'a' })],
          }),
      ).toThrow(DuplicateEntryIdError);
    });

    it('throws EntryNotFoundError for a parentId naming no id in the batch', () => {
      expect(
        () =>
          new Dataset({
            timeZone: 'UTC',
            entries: [oneEntry({ id: 'a', parentId: 'ghost' })],
          }),
      ).toThrow(EntryNotFoundError);
    });

    it('throws ParentCycleError for a parentId loop', () => {
      expect(
        () =>
          new Dataset({
            timeZone: 'UTC',
            entries: [oneEntry({ id: 'a', parentId: 'b' }), oneEntry({ id: 'b', parentId: 'a' })],
          }),
      ).toThrow(ParentCycleError);
    });

    it('does not throw when a child is listed before its parent', () => {
      expect(
        () =>
          new Dataset({
            timeZone: 'UTC',
            entries: [oneEntry({ id: 'b', parentId: 'a' }), oneEntry({ id: 'a' })],
          }),
      ).not.toThrow();
    });

    it("names 'new Dataset' as the door, not entries.load", () => {
      expect(
        () =>
          new Dataset({
            timeZone: 'UTC',
            entries: [oneEntry({ id: 'a' }), oneEntry({ id: 'a' })],
          }),
      ).toThrow('new Dataset');
    });
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
});

describe('Dataset.time (S5.6)', () => {
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

  it('entry.children() returns direct children', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'p1', name: 'Sitework' }, oneEntry({ id: 't1', parentId: 'p1' })],
    });
    expect((dataset.entries.get('p1')?.children() ?? []).map((e) => e.id)).toEqual([entryId('t1')]);
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

  // Every plugin registration seam returns a Disposer (I2) — `on` is that seam for a Dataset event.
  it('on() returns a Disposer that removes exactly the handler it was returned for', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    let calls = 0;
    let otherCalls = 0;
    const dispose = dataset.on('beforeChange', () => {
      calls += 1;
    });
    dataset.on('beforeChange', () => {
      otherCalls += 1;
    });

    dataset.entries.update('t1', { name: 'Design v2' });
    dispose();
    dataset.entries.update('t1', { name: 'Design v3' });

    expect(calls).toBe(1);
    expect(otherCalls).toBe(2);
  });

  it('calling the on() Disposer twice is safe', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const dispose = dataset.on('beforeChange', () => {});
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it('[S4-A1] a Dataset rebuilt from entries.all still sums after a later child edit', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Sitework' },
        oneEntry({ id: 'leaf', parentId: 'root', props: { cost: 100 } }),
      ],
    });
    expect(dataset.entries.get('root')?.read('cost')).toBe(100);
    const restored = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      // `toInput()` is the copy door (ADR 0017): a live row answers questions, and the stored values
      // a rebuild needs — `props` included — are what `entries.add()` takes.
      entries: dataset.entries.all.map((entry) => entry.toInput()),
    });
    expect(restored.entries.get('root')?.read('cost')).toBe(100);
    restored.entries.update('leaf', { cost: 250 });
    expect(restored.entries.get('leaf')?.read('cost')).toBe(250);
    expect(restored.entries.get('root')?.read('cost')).toBe(250);
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
      entries: [{ id: 'parent', name: 'Sitework' }, oneEntry({ id: 'child', parentId: 'parent' })],
    });
    // A "before" reading is a value, never a row: one `Entry` per id, and every read is live, so a
    // held row always agrees with itself (ADR 0017 rule 2).
    const parentBefore = {
      start: dataset.entries.get('parent')!.start,
      end: dataset.entries.get('parent')!.end,
    };
    const childBefore = { end: dataset.entries.get('child')!.end };
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
      entries: [oneEntry({ props: { cost: 400 } })],
    });

    expect(dataset.field('cost')).toEqual(
      expect.objectContaining({
        key: 'cost',
        type: 'money',
        rollUp: 'sum',
      }),
    );
    expect(dataset.field('missing')).toBeUndefined();

    const keys = dataset.fields.all.map((field) => field.key);
    expect(keys).toContain('start');
    expect(keys).toContain('cost');
    expect(dataset.fields).not.toHaveProperty('get');
  });

  // ADR 0015: the override merges into the resolved Field, so the list a consumer reads answers with
  // it. Nothing carries the lock anywhere else — there is no save format to encode it into.
  it("fields.all reads { key: 'end', editable: false } back, as the word it aliases", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'end', editable: false }],
      entries: [oneEntry()],
    });

    expect(dataset.fields.all.find((field) => field.key === 'end')?.editable).toBe('never');
    expect(dataset.field('end')?.editable).toBe('never');
  });

  it('setFieldEditable locks a Field after setup, and entries.update() then refuses it', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const before = dataset.fields.all;

    dataset.setFieldEditable('start', 'never');

    expect(dataset.field('start')?.editable).toBe('never');
    // A reader that cached the list by identity sees a new one (#187).
    expect(dataset.fields.all).not.toBe(before);
    expect(() => dataset.entries.update('t1', { start: '2026-06-01' })).toThrow(FieldNotEditableError);
  });

  it('setFieldEditable refuses a key no Field declares — the Field set stays fixed', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });

    expect(() => dataset.setFieldEditable('nothing-declares-this', 'never')).toThrow(UnknownFieldError);
  });

  it("update('t1', { start, cost }) is one transaction and one changeset", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [oneEntry({ props: { cost: 400 } })],
    });
    const changes: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });

    const updated = dataset.entries.update('t1', { start: '2026-09-05', cost: 500 });

    expect(changes).toHaveLength(1);
    expect(updated.read('cost')).toBe(500);
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
        { id: 'root', name: 'Root' },
        {
          id: 'leaf',
          name: 'Leaf',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { cost: 100 },
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

  it("a child cost edit leaves entries.all's order and the other child's stored cost", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Root' },
        {
          id: 'a',
          name: 'A',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { cost: 40, team: 'A' },
        },
        {
          id: 'b',
          name: 'B',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { cost: 60, team: 'B' },
        },
      ],
    });
    const order = dataset.entries.all.map((entry) => String(entry.id));

    dataset.entries.update('a', { cost: 50 });

    expect(dataset.entries.all.map((entry) => String(entry.id))).toEqual(order);
    expect(dataset.entries.get('b')?.toInput().props).toEqual({ cost: 60, team: 'B' });
    expect(dataset.entries.get('root')?.toInput().props).toEqual({ cost: 110 });
  });
});

describe('Start and End take either formatter (#577)', () => {
  const formatCtx = { timeZone: 'UTC', locale: 'en-US' as const };
  const readField = (dataset: Dataset, key: string) => {
    const entry = first(dataset);
    return dataset.field(key)!.formatValue!(entry.read(key), formatCtx, entry);
  };

  it('end only: shows the last day it covers', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Design', end: '2026-03-04' }],
    });
    expect(readField(dataset, 'end')).toBe('Mar 4, 2026');
  });

  it('adding a start later leaves the End cell unchanged', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Design', end: '2026-03-04' }],
    });
    dataset.entries.update('t1', { start: '2026-03-02' });
    expect(readField(dataset, 'end')).toBe('Mar 4, 2026');
  });

  it('a date-only start and end never show a time of day', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Design', start: '2026-03-02', end: '2026-03-04' }],
    });
    expect(readField(dataset, 'end')).not.toContain('11:59');
    expect(readField(dataset, 'end')).toBe('Mar 4, 2026');
  });

  it('a zero-length span shows its own day', () => {
    const at = instant('2026-03-05T00:00:00Z');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Design', start: at, end: at }],
    });
    expect(readField(dataset, 'end')).toBe('Mar 5, 2026');
  });

  it('a timed end defaults to the last day it covers; formatDateTime shows the stored moment', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'end', formatValue: formatDateTime }],
      entries: [{ id: 't1', name: 'Design', start: '2026-03-02', end: '2026-03-04T17:00' }],
    });
    expect(readField(dataset, 'end')).toBe('Mar 4, 2026, 5:00 PM');
  });

  it('Start defaults to the stored moment; formatInclusiveDate shows the date only', () => {
    const entry = { id: 't1', name: 'Design', start: '2026-03-02', end: '2026-03-04' };
    const withDefault = new Dataset({ timeZone: 'UTC', entries: [entry] });
    expect(readField(withDefault, 'start')).toBe('Mar 2, 2026, 12:00 AM');

    const withOverride = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'start', formatValue: formatInclusiveDate }],
      entries: [entry],
    });
    expect(readField(withOverride, 'start')).toBe('Mar 2, 2026');
  });

  it('formatDateTime on a date-only end shows the stored moment, not the last covered day', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'end', formatValue: formatDateTime }],
      entries: [{ id: 't1', name: 'Design', start: '2026-03-02', end: '2026-03-04' }],
    });
    expect(readField(dataset, 'end')).toBe('Mar 5, 2026, 12:00 AM');
  });

  it('a consumer may not override formatValue with an unrelated key on a core Field', () => {
    expect(
      () =>
        new Dataset({
          timeZone: 'UTC',
          fields: [{ key: 'name', column: { header: 'X' } }],
          entries: [oneEntry()],
        }),
    ).toThrow(IllegalCoreFieldOverrideError);
  });
});

describe('entry.read — the one value door (ADR 0017)', () => {
  it('reads a props-addressed Field without going through entry.props directly', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: 'money' }],
      fieldTypes: { money: { rollUp: 'sum' } },
      entries: [oneEntry()],
    });
    dataset.entries.update('t1', { cost: 500 });
    expect(dataset.entries.get('t1')?.read('cost')).toBe(500);
  });

  it('reads an entry-sourced Field', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(dataset.entries.get('t1')?.read('start')).toBe(first(dataset).start);
    expect(dataset.entries.get('t1')?.read('name')).toBe('Design');
  });

  it('reads duration on a headless Dataset before any Gantt exists', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ start: 0, end: 1 })],
    });
    // `duration` computes its value and owns no `Entry` key, and still reads back as a `Duration`.
    const duration: Duration | undefined = dataset.entries.get('t1')?.read('duration');
    expect(duration).toEqual({ value: 1, unit: 'millisecond' });
  });

  // The consumer pattern for "a parent sums its children": a `compute` Field that walks
  // `ctx.leaves(entry)` itself, with no `rollUp` (a `compute` Field never gets one).
  const WORK: Field<Duration> = {
    key: 'work',
    type: 'duration',
    compute: (entry, ctx): Duration | undefined => {
      const rows = ctx.hasChildren(entry) ? ctx.leaves(entry) : [entry];
      const spans = rows.filter(spansTime);
      return spans.length === 0
        ? undefined
        : { value: spans.reduce((ms, row) => ms + diffMs(row.end, row.start), 0), unit: 'millisecond' };
    },
  };

  it('sums a parent’s leaves’ own spans, so a gap between children does not count', () => {
    const at = (iso: string): string => `2026-01-${iso}T00:00:00Z`;
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [WORK],
      entries: [
        { id: 'parent', name: 'Parent', start: at('01'), end: at('20') },
        { id: 'c1', name: 'C1', parentId: 'parent', start: at('01'), end: at('03') },
        { id: 'c2', name: 'C2', parentId: 'parent', start: at('07'), end: at('09') },
      ],
    });

    const parent = dataset.entries.get('parent')!;
    const c1 = dataset.entries.get('c1')!;

    // Two children, two days each, so the gap between them (four days) does not count.
    expect(parent.read('work')).toEqual({ value: diffMs(c1.end!, c1.start!) * 2, unit: 'millisecond' });
    expect((parent.read('work') as Duration).value).toBeLessThan(diffMs(parent.end!, parent.start!));
    expect(c1.read('work')).toEqual({ value: diffMs(c1.end!, c1.start!), unit: 'millisecond' });
  });

  it('answers undefined for a row with no dates', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [WORK],
      entries: [{ id: 'undated', name: 'Undated' }],
    });

    expect(dataset.entries.get('undated')!.read('work')).toBeUndefined();
  });

  it('throws UnknownFieldError for an unregistered key', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(() => dataset.entries.get('t1')?.read('cost')).toThrow(UnknownFieldError);
  });

  // A missing id has one door, and it is `entries.get`. The read door is on the row, so a caller
  // that holds no row never reaches it, and no error names the id (ADR 0017).
  it('answers no row for a missing id, so there is nothing to read from', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    expect(dataset.entries.get('missing')).toBeUndefined();
    expect(dataset.entries.has('missing')).toBe(false);
  });

  it('reads a staged write inside an open transaction', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost' }],
      entries: [oneEntry()],
    });
    dataset.transaction(() => {
      dataset.entries.update('t1', { cost: 40 });
      expect(dataset.entries.get('t1')?.read('cost')).toBe(40);
    });
  });
});

describe('Dataset generics (#123)', () => {
  it('types props from one TProps generic — declared Field keys and passenger keys alike', () => {
    const dataset = new Dataset<{ team: string; cost: number; note: string }>({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      // `entry.read` refuses a key no Field declares (ADR 0017), so both props keys are declared.
      fields: [{ key: 'cost', type: 'money' }, { key: 'team' }],
      entries: [
        {
          id: 't1',
          name: 'Design',
          start: '2026-09-01',
          end: '2026-09-08',
          props: { team: 'A', note: 'carried' },
        },
      ],
    });

    const team: string | undefined = dataset.entries.get('t1')?.read('team');
    expect(team).toBe('A');

    // `note` is a passenger key: it is in `TProps`, and no Field declares it. No read door answers
    // it (ADR 0017), and the row still carries it.
    expect(dataset.entries.get('t1')?.toInput().props?.note).toBe('carried');

    const updated = dataset.entries.update('t1', { cost: 500 });
    expect(updated.read('team')).toBe('A');

    // The key types the read — no type argument at the call, and no `as` (#144, ADR 0005).
    const cost: number | undefined = dataset.entries.get('t1')?.read('cost');
    expect(cost).toBe(500);
    const name: string | undefined = dataset.entries.get('t1')?.read('name');
    expect(name).toBe('Design');

    // Compile-time only: a string is not a number for `cost`, and `bogus` is not a Field key.
    if (false as boolean) {
      // @ts-expect-error — cost is number
      dataset.entries.update('t1', { cost: 'nope' });
      // @ts-expect-error — undeclared key
      dataset.entries.update('t1', { bogus: 1 });
    }
  });

  // ADR 0011, #281: a declared Field key type-checks flat, at the top, at both doors that build
  // a row — the constructor's `entries` array and `entries.add()` — the same shape `update()` already
  // typed. Runtime already read the flat key either way (`propsFromInput`); this is the static half.
  it('types a flat declared Field key at both doors: the constructor and entries.add() (#281)', () => {
    const dataset = new Dataset<{ owner: string; cost?: number }>({
      timeZone: 'UTC',
      fields: [{ key: 'owner' }, { key: 'cost' }],
      // Flat, not `props: { owner: … }` — the constructor door.
      entries: [{ id: 't1', name: 'Design', owner: 'Ali' }],
    });
    expect(dataset.entries.get('t1')?.read('owner')).toBe('Ali');

    // Flat, not `props: { owner: … }` — the `add()` door.
    const added = dataset.entries.add({ id: 't2', name: 'Build', owner: 'Sam', cost: 500 });
    expect(added.read('owner')).toBe('Sam');
    expect(added.read('cost')).toBe(500);

    // Nested `props` still works too (a bag already held, or a passenger key) — unchanged by #281.
    const nested = dataset.entries.add({ id: 't3', name: 'Ship', props: { owner: 'Ren' } });
    expect(nested.read('owner')).toBe('Ren');

    // Compile-time only: an undeclared flat key must still fail to type-check, at both doors, the
    // same as it did before #281 — the fix widens what is accepted, never what is refused.
    if (false as boolean) {
      new Dataset<{ owner: string }>({
        timeZone: 'UTC',
        // @ts-expect-error — bogus is not a declared key
        entries: [{ id: 't1', bogus: 'nope' }],
      });
      // @ts-expect-error — bogus is not a declared key
      dataset.entries.add({ id: 't4', bogus: 'nope' });
    }
  });

  // `FlatEntryInput` type-checks every `TProps` key flat, declared or not (#281's own doc note on
  // `stored-entry.ts`). Ingest is narrower: `propsFromInput` (`data/entry-reader.ts`) only honours a
  // flat key that names a declared Field, and warns-and-drops the rest (ADR 0011: "an undeclared key
  // is never written by the library, ever"). This pins that gap so a future ingest change that closes
  // it — or widens it by accident — shows here first.
  it('a flat TProps key with no declared Field type-checks and still warns-and-drops at ingest (#281)', () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      warnings.push(String(line));
    });

    const dataset = new Dataset<{ owner: string; passengerKey: number }>({
      timeZone: 'UTC',
      fields: [{ key: 'owner' }],
      // `passengerKey` is in TProps, but no Field declares it — type-checks flat, drops at runtime.
      entries: [{ id: 't1', owner: 'Ali', passengerKey: 1 }],
    });

    expect(dataset.entries.get('t1')?.toInput().props?.passengerKey).toBeUndefined();
    // The warning names both ways out, not just the drop.
    expect(
      warnings.some(
        (line) =>
          line.includes('passengerKey') &&
          line.includes('drops') &&
          line.includes('props: { passengerKey }') &&
          line.includes('"fields"'),
      ),
    ).toBe(true);

    // Nesting it under `props` instead — the documented way out — carries it through.
    const nested = new Dataset<{ owner: string; passengerKey: number }>({
      timeZone: 'UTC',
      fields: [{ key: 'owner' }],
      entries: [{ id: 't1', owner: 'Ali', props: { passengerKey: 1 } }],
    });
    expect(nested.entries.get('t1')?.toInput().props?.passengerKey).toBe(1);
  });
});

// S5.10: `DatasetOptions.plugins` is the public way in. Each case below writes a
// plugin the way an application author writes one — a factory returning `{ id, setup }`.
describe('Dataset plugins (S5.10)', () => {
  interface LockRow {
    readonly locked: true;
  }

  /** Locks one entry: its own store row says which, and `beforeChange` refuses any commit that
   *  touches it — the same shape harness/plugins/lock-entries.ts ships. */
  function lockEntries(ids: readonly string[]): DataPlugin {
    return {
      id: 'demo.lock',
      data(ctx) {
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

  it('seeds a store during setup, before any consumer handler exists, leaving canUndo false', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    expect(dataset.canUndo).toBe(false);
    expect(dataset.pluginStore('demo.lock')?.get('t1')).toEqual({ locked: true });
  });

  it('refuses an edit to a locked entry through beforeChange', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    expect(() => dataset.entries.update('t1', { name: 'Renamed' })).toThrow(MutationCancelledError);
    expect(first(dataset).name).toBe('Design');
  });

  it('keeps two Datasets independent under one plugin id (I2)', () => {
    const locked = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries(['t1'])] });
    const open = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [lockEntries([])] });

    expect(() => locked.entries.update('t1', { name: 'Renamed' })).toThrow(MutationCancelledError);
    expect(open.entries.update('t1', { name: 'Renamed' }).name).toBe('Renamed');
    expect(open.pluginStore('demo.lock')?.all.size).toBe(0);
  });

  it('removes a plugin’s ctx.events.on handler, added during setup, on destroy()', () => {
    let calls = 0;
    const plugin: DataPlugin = {
      id: 'demo.listener',
      data(ctx) {
        ctx.events.on('beforeChange', () => {
          calls += 1;
        });
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [plugin] });
    dataset.entries.update('t1', { name: 'Design v2' });
    dataset.destroy();
    expect(() => dataset.entries.update('t1', { name: 'Design v3' })).not.toThrow();
    expect(calls).toBe(1);
  });

  it('removes a plugin’s ctx.events.on handler, added after setup returned, on destroy()', () => {
    let calls = 0;
    let addLateHandler = (): void => undefined;
    const plugin: DataPlugin = {
      id: 'demo.late-listener',
      data(ctx) {
        addLateHandler = () =>
          ctx.events.on('beforeChange', () => {
            calls += 1;
          });
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [plugin] });
    addLateHandler();
    dataset.entries.update('t1', { name: 'Design v2' });
    dataset.destroy();
    dataset.entries.update('t1', { name: 'Design v3' });
    expect(calls).toBe(1);
  });

  it('a plugin calling its own events.on Disposer early, then destroy(), throws nothing', () => {
    const plugin: DataPlugin = {
      id: 'demo.early-dispose',
      data(ctx) {
        const dispose = ctx.events.on('beforeChange', () => undefined);
        dispose();
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [plugin] });
    expect(() => dataset.destroy()).not.toThrow();
  });

  it('destroying one plugin leaves another plugin’s and the app’s own handlers firing', () => {
    let pluginCalls = 0;
    let appCalls = 0;
    const plugin: DataPlugin = {
      id: 'demo.tracked-listener',
      data(ctx) {
        ctx.events.on('beforeChange', () => {
          pluginCalls += 1;
        });
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [plugin] });
    dataset.on('beforeChange', () => {
      appCalls += 1;
    });
    dataset.destroy();
    dataset.entries.update('t1', { name: 'Design v2' });
    expect(pluginCalls).toBe(0);
    expect(appCalls).toBe(1);
  });

  it('throws RegistrationClosedError when a plugin claims the extension hook after setup returned', () => {
    let setExtenderLate = (): void => undefined;
    const late: DataPlugin = {
      id: 'demo.late',
      data(ctx) {
        setExtenderLate = () => ctx.edits.setExtender((next) => next);
      },
    };
    new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [late] });
    expect(setExtenderLate).toThrow(RegistrationClosedError);
  });

  it('has a Field a plugin declares in the registry, already settled by the construction Rollup (#496)', () => {
    const declaresCost: DataPlugin = {
      id: 'demo.cost',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      data() {},
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'Sitework', start: '2026-09-01', end: '2026-09-02' },
        oneEntry({ id: 't1', parentId: 'p1', props: { cost: 500 } }),
      ],
      plugins: [declaresCost],
    });
    expect(dataset.field('cost')?.type).toBe('money');
    expect(dataset.entries.get('p1')?.read('cost')).toBe(500);
  });

  it('sets up in requires order, whichever order the array writes', () => {
    const order: string[] = [];
    const base: DataPlugin = {
      id: 'demo.base',
      data(ctx) {
        order.push('base');
        ctx.store.reserve<{ note: string }>().set(entryId('t1'), { note: 'from base' });
      },
    };
    const reader: DataPlugin = {
      id: 'demo.reader',
      requires: ['demo.base'],
      data(ctx) {
        order.push('reader');
        // The store its prerequisite reserved is already there to read.
        seen = ctx.store.read<{ note: string }>('demo.base')?.get(entryId('t1'))?.note;
      },
    };
    let seen: string | undefined;

    new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [reader, base] });
    expect(order).toEqual(['base', 'reader']);
    expect(seen).toBe('from base');
  });

  it('throws MissingPluginError naming both ids when a prerequisite is absent', () => {
    const orphan: DataPlugin = { id: 'demo.reader', requires: ['demo.base'], data: () => undefined };
    expect(() => new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [orphan] })).toThrow(
      MissingPluginError,
    );
  });

  it('composes the extension hook in that same order, rather than evicting it', () => {
    const cascadesTo = (id: string, to: string): DataPlugin => ({
      id,
      ...(id === 'demo.second' ? { requires: ['demo.first'] } : {}),
      data(ctx) {
        ctx.edits.setExtender(
          (next) => (request) => mergeEntryEdits(next(request), new Map([[entryId(to), { name: to }]])),
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

  // #197: composing with a `Map` spread stayed green only because each wrapper wrote a different
  // Entry. Two extenders on one Entry lost the earlier write, and the Rollup then read a stale child.
  it('a second extender writing the same child still leaves the first write for the Rollup (#197)', () => {
    const proposesCost: DataPlugin = {
      id: 'demo.cost',
      data(ctx) {
        ctx.edits.setExtender(
          // #209 C3: the plugin writes the Field by name, the same object `entries.update()` takes.
          // Core derives `proposedKeys` from the composed result, so this plugin cannot get it wrong.
          () => () => new Map([[entryId('leaf'), { cost: 500 }]]),
        );
      },
    };
    const movesLeaf: DataPlugin = {
      id: 'demo.move',
      requires: ['demo.cost'],
      data(ctx) {
        ctx.edits.setExtender(
          (next) => (request) =>
            mergeEntryEdits(
              next(request),
              // Loose dates, read by core in the dataset's own zone (#209 C3) — this plugin makes no
              // `time/` call of its own.
              new Map([[entryId('leaf'), { start: '2026-02-01', end: '2026-02-05' }]]),
            ),
        );
      },
    };
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [
        { id: 'root', name: 'Root' },
        {
          id: 'leaf',
          name: 'Leaf',
          parentId: 'root',
          start: '2026-01-01',
          end: '2026-01-05',
          props: { cost: 100 },
        },
      ],
      plugins: [movesLeaf, proposesCost],
    });

    dataset.entries.update('leaf', { name: 'Renamed' });

    // Both extender writes landed on the one child...
    expect(dataset.entries.get('leaf')?.read('cost')).toBe(500);
    expect(dataset.entries.get('leaf')?.start).toBe(instant(utc('2026-02-01')));
    // ...and the Rollup read the child both of them wrote, not the one the last wrapper left.
    expect(dataset.entries.get('root')?.read('cost')).toBe(500);
    expect(dataset.entries.get('root')?.start).toBe(instant(utc('2026-02-01')));
  });

  it('releases every plugin on destroy()', () => {
    const released: string[] = [];
    const noisy: DataPlugin = {
      id: 'demo.noisy',
      data: () => () => released.push('demo.noisy'),
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [noisy] });
    dataset.destroy();
    expect(released).toEqual(['demo.noisy']);
  });

  // ADR 0031: a Dataset builds completely — Field, hierarchy source, construction Rollup all settle —
  // before the first plugin's data() runs. The five tests below read that finished Dataset back.

  it('reads every entry through ctx.dataset.entries.all inside data()', () => {
    let seenIds: string[] = [];
    const reads: DataPlugin = {
      id: 'demo.reads',
      data(ctx) {
        seenIds = [...ctx.dataset.entries.all].map((entry) => entry.id);
      },
    };
    new Dataset({ timeZone: 'UTC', entries: [oneEntry(), oneEntry({ id: 't2' })], plugins: [reads] });
    expect(seenIds).toEqual(['t1', 't2']);
  });

  it('reads a rolled-up parent value inside data(), already settled by the construction Rollup', () => {
    let parentCost: number | undefined;
    const reads: DataPlugin = {
      id: 'demo.reads-rollup',
      data(ctx) {
        parentCost = ctx.dataset.entries.get('p1')?.read('cost') as number | undefined;
      },
    };
    new Dataset({
      timeZone: 'UTC',
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
      entries: [{ id: 'p1', name: 'Sitework' }, oneEntry({ id: 't1', parentId: 'p1', props: { cost: 500 } })],
      plugins: [reads],
    });
    expect(parentCost).toBe(500);
  });

  it('fires change to an earlier plugin’s handler when a later plugin seeds its store, and leaves canUndo false', () => {
    const seenByFirst: unknown[] = [];
    const first: DataPlugin = {
      id: 'demo.first',
      data(ctx) {
        ctx.events.on('change', ({ changeSet }) => {
          seenByFirst.push(changeSet.origin);
        });
      },
    };
    const second: DataPlugin = {
      id: 'demo.second',
      requires: ['demo.first'],
      data(ctx) {
        ctx.store.reserve<LockRow>().set(entryId('t1'), { locked: true });
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [first, second] });
    expect(seenByFirst).toEqual(['user']);
    expect(dataset.canUndo).toBe(false);
  });

  it('reads canUndo true inside a plugin’s change handler, for a user edit after construction', () => {
    let canUndoDuringHandler: boolean | undefined;
    const watches: DataPlugin = {
      id: 'demo.watches',
      data(ctx) {
        ctx.events.on('change', () => {
          canUndoDuringHandler = ctx.dataset.canUndo;
        });
      },
    };
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [watches] });
    dataset.entries.update('t1', { name: 'Renamed' });
    expect(canUndoDuringHandler).toBe(true);
  });

  it('disposes the earlier plugins and throws PluginSetupError when a later data() throws', () => {
    const released: string[] = [];
    const ok: DataPlugin = {
      id: 'demo.ok',
      data: () => () => released.push('demo.ok'),
    };
    const throws: DataPlugin = {
      id: 'demo.throws',
      requires: ['demo.ok'],
      data() {
        throw new Error('setup failed');
      },
    };
    expect(() => new Dataset({ timeZone: 'UTC', entries: [oneEntry()], plugins: [ok, throws] })).toThrow(
      PluginSetupError,
    );
    expect(released).toEqual(['demo.ok']);
  });
});

describe("a plugin's per-entry lock rule opens a cell for a cascade (#473)", () => {
  /** Opens `owner` on `open` only; `locked` stays refused. Both are `editable: false` Fields, so
   *  the cascade's only door onto `open` is this rule. */
  const opensOneEntry: DataPlugin = {
    id: 'demo.unlock',
    data(ctx) {
      ctx.edits.setLockRule(
        (next) => (entry, field) =>
          entry.id === entryId('open') && field === 'owner' ? 'anywhere' : next(entry, field),
      );
    },
  };

  function twoLockedEntries(
    cascadeTo: (id: string, owner: string) => NonNullable<DataPlugin['data']>,
  ): Dataset {
    return new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'owner', editable: false }],
      entries: [
        { id: 'open', name: 'Open', start: '2026-09-01', end: '2026-09-02', props: { owner: 'nobody' } },
        { id: 'locked', name: 'Locked', start: '2026-09-01', end: '2026-09-02', props: { owner: 'nobody' } },
      ],
      plugins: [
        opensOneEntry,
        { id: 'demo.cascade', requires: ['demo.unlock'], data: cascadeTo('open', 'ana') },
      ],
    });
  }

  it('lets a cascade write the Entry the lock rule names, unchanged from a locked sibling', () => {
    const cascadesOwner =
      (id: string, owner: string): NonNullable<DataPlugin['data']> =>
      (ctx) => {
        ctx.edits.setExtender(() => () => new Map([[entryId(id), { owner }]]));
      };
    const dataset = twoLockedEntries(cascadesOwner);

    dataset.entries.update('open', { name: 'Renamed' });

    expect(dataset.entries.get('open')?.read('owner')).toBe('ana');
    expect(dataset.entries.get('locked')?.read('owner')).toBe('nobody');
  });

  it('still refuses a cascade onto a cell the lock rule has no opinion on', () => {
    const cascadesOwner =
      (id: string, owner: string): NonNullable<DataPlugin['data']> =>
      (ctx) => {
        ctx.edits.setExtender(() => () => new Map([[entryId(id), { owner }]]));
      };
    const dataset = twoLockedEntries(() => cascadesOwner('locked', 'ana'));

    expect(() => dataset.entries.update('open', { name: 'Renamed' })).toThrow(FieldNotEditableError);
    expect(dataset.entries.get('locked')?.read('owner')).toBe('nobody');
    expect(dataset.entries.get('open')?.name).toBe('Open');
  });

  it('Dataset.editableOf answers the same lock a cascade or entries.update() write against', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'owner', editable: false }],
      entries: [oneEntry({ id: 'open', props: { owner: 'nobody' } })],
      plugins: [opensOneEntry],
    });

    expect(dataset.editableOf('open', 'owner')).toBe('anywhere');
    expect(dataset.editableOf('open', 'name')).toBe('anywhere');
  });

  // #473's ocr finding: `editableOf` used to default an undeclared `editable` to `'anywhere'` for a
  // `compute` Field, so a plugin that guarded a write with `editableOf(...) !== 'never'` passed the
  // guard and then met `ComputedFieldCannotBeWrittenError` from `entries.update()`.
  it('answers never for a compute Field, the same refusal entries.update() gives it', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'derived', compute: () => 0 }],
      entries: [oneEntry()],
    });

    expect(dataset.editableOf('t1', 'derived')).toBe('never');
    expect(() => dataset.entries.update('t1', { derived: 1 })).toThrow(ComputedFieldCannotBeWrittenError);
  });
});

describe('a plugin’s declared Field is the plugin’s, not the document’s (#162)', () => {
  /** The S5.10 shape: a plugin declares a Field, and entries carry its values in `props`. */
  const declaresRisk: DataPlugin = {
    id: 'demo.risk',
    fields: [{ key: 'risk', rollUp: 'none' }],
    data() {},
  };

  const withRisk = (): Dataset =>
    new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ props: { risk: 'high' } })],
      fields: [{ key: 'note' }],
      plugins: [declaresRisk],
    });

  it('keeps the plugin’s values, which live in props and never needed the declaration', () => {
    expect(withRisk().entries.get('t1')?.toInput().props).toEqual({ risk: 'high' });
  });

  it('authors no orphan Field when the reading application leaves the plugin out', () => {
    const dataset = withRisk();
    const reloaded = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'note' }],
      entries: dataset.entries.all.map((entry) => entry.toInput()),
    });

    expect(reloaded.field('risk')).toBeUndefined();
    expect(reloaded.field('note')).toBeDefined();
    // The plugin's data is still there, opaque, waiting for the plugin to come back.
    expect(reloaded.entries.get('t1')?.toInput().props).toEqual({ risk: 'high' });
  });

  it('re-declares cleanly when the reading application installs the same plugin again', () => {
    const dataset = withRisk();
    const reloaded = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'note' }],
      // `all` hands back live rows (ADR 0017), and a row is copied through `toInput()`.
      entries: dataset.entries.all.map((entry) => entry.toInput()),
      plugins: [declaresRisk],
    });

    expect(reloaded.field('risk')).toBeDefined();
    expect(reloaded.entries.get('t1')?.read('risk')).toBe('high');
  });
});

describe('a plugin Field declared at construction is there before entries are read (#496 grill round 3)', () => {
  /** No `ctx.fields.register` call: the plugin declares `locked` on itself, the same shape
   *  `DatasetOptions.fields` takes. This is what `harness/plugins/lock-entries.ts` moves to. */
  const locks = () => ({
    id: 'demo.locks',
    fields: [{ key: 'locked', type: 'boolean', editable: 'api' }] as const,
    data(): void {
      /* the extension hook and the store are out of scope for this gap — see lock-entries.ts */
    },
  });

  it('keeps a flat plugin-Field value new Dataset() is given, the same as entries.load() already does', () => {
    const dataset = new Dataset<{ locked?: boolean }>({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08', locked: true }],
      plugins: [locks()],
    });

    expect(dataset.entries.get('t1')?.read('locked')).toBe(true);
  });

  it('gives new Dataset() and entries.load() the same entries for the same input (oracle)', () => {
    const rows = [{ id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08', locked: true }];
    const fresh = new Dataset<{ locked?: boolean }>({ timeZone: 'UTC', entries: rows, plugins: [locks()] });
    const loaded = new Dataset<{ locked?: boolean }>({ timeZone: 'UTC', entries: [], plugins: [locks()] });
    loaded.entries.load(rows);

    expect(loaded.entries.all.map((entry) => entry.toInput())).toEqual(
      fresh.entries.all.map((entry) => entry.toInput()),
    );
  });

  it('reports a duplicate plugin id, not a shared Field key it also declares (ocr review of #532)', () => {
    // Two installs of the same factory: same id, same declared Field key. Duplicate-id must win —
    // that is the error docs/06-plugin-authoring.md documents for two plugins sharing an id — and it
    // has to win *before* the Field merge below ever sees the shared key, or a factory called twice
    // throws the wrong error naming a key instead of the plugin id it actually got wrong.
    expect(() => new Dataset({ timeZone: 'UTC', entries: [], plugins: [locks(), locks()] })).toThrow(
      DuplicatePluginIdError,
    );
  });

  it("harness's lockEntries() ghosts a construction-time lock on the drag preview it never itself committed", () => {
    // The real plugin, not the `locks()` double above: this pins `lockedIds`' own seed walk
    // (`harness/plugins/lock-entries.ts`), which the local double does not have.
    const locks = lockEntries();
    const dataset = new Dataset<{ locked?: boolean }>({
      timeZone: 'UTC',
      entries: [
        { id: 'mover', name: 'Mover', start: '2026-09-01', end: '2026-09-03' },
        // Locked from construction alone — never its own commit, so `lockedIds` cannot have
        // learned about it from a `change` this entry raised.
        { id: 'anchor', name: 'Anchor', start: '2026-09-01', end: '2026-09-03', locked: true },
      ],
      plugins: [locks],
    });

    // The preview path, not a commit: `beforeChange` refuses a real write that moves `anchor`'s
    // dates too (that refusal is the plugin's whole point, pinned by `e2e/plugins.spec.ts`), so the
    // fact under test — does the extender's cascade reach `anchor` on the very first call? — is read
    // off `extraEditsFor`, the same door a drag preview frame calls.
    const draft = proposedDraft('mover', {
      start: instant('2026-09-05T00:00:00Z'),
      end: instant('2026-09-07T00:00:00Z'),
    });
    const preview = extraEditsFor(dataset, draft);

    // `anchor` ghosts alongside `mover` on this very first preview — the cascade the extender adds
    // for every entry in `lockedIds` (#496 grill round 3 follow-up).
    expect(preview.get(entryId('anchor'))?.start).toEqual(instant('2026-09-05T00:00:00Z'));
  });
});

describe("harness's lockEntries() lets an undo and a redo through on a locked entry", () => {
  it('still refuses a plain write on a locked entry', () => {
    const dataset = new Dataset<{ locked?: boolean }>({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-08', locked: true }],
      plugins: [lockEntries()],
    });

    expect(() => dataset.entries.update('a', { name: 'edited' })).toThrow(MutationCancelledError);
  });

  it('lets an undo reverse a step recorded before a sync locked the entry', () => {
    const dataset = new Dataset<{ locked?: boolean }>({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'Design', start: '2026-09-01', end: '2026-09-08' }],
      plugins: [lockEntries()],
    });

    dataset.entries.update('a', { name: 'edited' });
    // A sync records no step of its own (#517), so the undo below reverses the rename above, on an
    // entry the sync's own list has since locked.
    dataset.entries.syncAll([
      { id: 'a', name: 'edited', start: '2026-09-01', end: '2026-09-08', locked: true },
    ]);

    expect(() => dataset.undo()).not.toThrow();
    expect(dataset.entries.get('a')?.read('name')).toBe('Design');
    expect(dataset.entries.get('a')?.read('locked')).toBe(true);

    dataset.redo();
    expect(dataset.entries.get('a')?.read('name')).toBe('edited');
  });
});

describe('Dataset.entries.syncChanges', () => {
  it('reaches the store: an unknown id in upsert adds an entry', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'a', start: '2026-09-01', end: '2026-09-02' }],
    });

    dataset.entries.syncChanges({
      upsert: [{ id: 'b', name: 'b', start: '2026-09-03', end: '2026-09-04' }],
    });

    expect(dataset.entries.get('b')?.name).toBe('b');
  });
});

/** Every tree answer an extender can read off one `EditRequest`, in one object — so a disagreement
 *  between two callers shows up as one failed comparison rather than six. */
interface TreeAnswers {
  readonly depotHasChildren: boolean;
  readonly vanHasChildren: boolean;
  readonly crateHasChildren: boolean;
  readonly depotCost: WriteTarget;
  readonly vanCost: WriteTarget;
  readonly undeclared: WriteTarget;
}

function treeAnswersOf(request: EditRequest): TreeAnswers {
  return {
    depotHasChildren: request.hasChildren('depot'),
    vanHasChildren: request.hasChildren('van-1'),
    crateHasChildren: request.hasChildren('crate-a'),
    depotCost: request.writeTarget('depot', 'cost'),
    vanCost: request.writeTarget('van-1', 'cost'),
    undeclared: request.writeTarget('depot', 'nobodyDeclaredThis'),
  };
}

/** A branded draft, the shape the gesture pipeline hands the preview path (ADR 0011: nobody outside
 *  core builds one, so a test states the brand rather than reaching for a door that does not exist). */
function proposedDraft(id: string, patch: Record<string, unknown>): ProposedEdits {
  const edit: ProposedEdit = {
    __brand: 'ProposedEdit',
    props: {},
    proposedKeys: new Set(Object.keys(patch)),
    ...patch,
  };
  return new Map([[entryId(id), edit]]);
}

describe('the preview path and the commit path read one tree (#466)', () => {
  // Step 3's whole premise: `extraEditsFor` (preview, every drag frame) and `entries.update()`
  // (commit, once) build their `EditRequest` through the one `createEditRequest`. If either grew its
  // own construction back, an extender would see one tree while dragging and a different one on drop
  // — the class of bug no assertion on either path alone can catch.
  function datasetRecording(into: TreeAnswers[]): Dataset {
    const records: DataPlugin = {
      id: 'demo.records-the-tree',
      data(ctx) {
        ctx.edits.setExtender((next) => (request) => {
          into.push(treeAnswersOf(request));
          return next(request);
        });
      },
    };
    return new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost', rollUp: 'sum' }],
      entries: [
        { id: 'depot', name: 'Depot' },
        { id: 'van-1', name: 'Van 1', parentId: 'depot' },
        { id: 'crate-a', name: 'Crate A' },
      ],
      plugins: [records],
    });
  }

  it('agrees on a draft that moves no row — the committed index answers both', () => {
    const seen: TreeAnswers[] = [];
    const dataset = datasetRecording(seen);

    extraEditsFor(dataset, proposedDraft('van-1', { name: 'Van One' }));
    dataset.entries.update('van-1', { name: 'Van One' });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(seen[0]);
    // And the answers are the tree's own, not an empty default that would agree by accident.
    expect(seen[0]).toEqual({
      depotHasChildren: true,
      vanHasChildren: false,
      crateHasChildren: false,
      depotCost: 'refused',
      vanCost: 'entry',
      undeclared: 'entry',
    });
  });

  it('agrees on a draft that moves a row — both rebuild the effective index instead', () => {
    // `Van 1` leaves `Depot` and lands under `Crate A`, so three of the six answers change. This is
    // the draft that defeats the "this commit moves no row" shortcut (#421 C4) on both paths at once.
    const seen: TreeAnswers[] = [];
    const dataset = datasetRecording(seen);

    extraEditsFor(dataset, proposedDraft('van-1', { parentId: entryId('crate-a') }));
    dataset.entries.update('van-1', { parentId: 'crate-a' });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[0]).toEqual({
      depotHasChildren: false,
      vanHasChildren: false,
      crateHasChildren: true,
      depotCost: 'entry',
      vanCost: 'entry',
      undeclared: 'entry',
    });
  });
});
