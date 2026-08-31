import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { changeSetId, entryId, instant, invertChangeSet, InvalidReplayOriginError } from './index.js';
import type { ChangeSet, Entry, EntryInput } from './index.js';

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
    expect(dataset.entries.childrenOf('p1').map((e) => e.id)).toEqual([entryId('t1')]);
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
});
