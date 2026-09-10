import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from '../dataset-state.js';
import { toDocument, fromDocument, reportCorrectedRollUps } from './index.js';
import { createErrorRaiser } from '../error-reporting.js';
import type { ErrorReport } from '../../model/index.js';
import { entryId, FreeGanttError, UnsupportedSchemaError } from '../../model/index.js';
import type { DatasetDocument } from '../../model/index.js';
import type { EntryInput } from '../../model/index.js';
import { instant } from '../../time/index.js';

function span(id: string, overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    id,
    name: id,
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

function fromJSON(doc: DatasetDocument): DatasetState {
  const state = new DatasetState(fromDocument(doc));
  reportCorrectedRollUps(doc, state, createErrorRaiser(state.bus));
  return state;
}

function roundTrip(dataset: DatasetState): void {
  const doc = toDocument(dataset);
  const round = toDocument(fromJSON(doc));
  expect(JSON.stringify(round)).toBe(JSON.stringify(doc));
}

describe('[S2-A2] toDocument / fromJSON', () => {
  it('round-trips byte-stable from a Dataset write', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('t1')],
    });
    roundTrip(dataset);
  });

  // #212 fix-plan review, finding B1: the Rollup wrote a rolled-up `start`/`end` straight onto the
  // group without ever touching its Segment, so `toDocument` published an Entry whose envelope disagreed
  // with its own Segments. Reading that document back with `rollUpKinds: []` (no Rollup to paper over
  // it) then derived `start`/`end` from the stale Segment instead — the authored 2026 span was gone.
  it('a rolled-up group survives toDocument -> fromJSON with rollUpKinds: [], no lost span', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'p1', kind: 'group', start: 0, end: 1 },
        span('c1', { parentId: 'p1', start: '2026-01-01T00:00:00.000Z', end: '2026-01-10T00:00:00.000Z' }),
      ],
    });
    const rolledUp = dataset.entries.get('p1')!;
    expect(rolledUp.start).toBe(instant('2026-01-01T00:00:00.000Z'));
    expect(rolledUp.end).toBe(instant('2026-01-10T00:00:00.000Z'));
    // The writer keeps the group's one Segment paired with the envelope it just rolled up — no
    // document can carry the disagreement this defect used to publish.
    expect(rolledUp.segments).toEqual([
      { id: rolledUp.segments[0]!.id, start: rolledUp.start, end: rolledUp.end },
    ]);

    const doc = { ...toDocument(dataset), rollUpKinds: [] };
    const reread = new DatasetState(fromDocument(doc));
    const p1 = reread.entries.get('p1')!;
    expect(p1.start).toBe(rolledUp.start);
    expect(p1.end).toBe(rolledUp.end);
  });

  // #212 R2 fix-plan review, finding B1 remainder: B1's own fix only paired a rolled-up envelope onto
  // a group's Segment when it drew exactly one. A group drawing several had no such pairing, so
  // `toDocument` could still publish a group whose Segments disagreed with its rolled-up `start`/`end` —
  // this is that second case, closed by `widenSegmentsToEnvelope` (`data/rollup.ts`).
  it('a rolled-up group drawing several Segments still matches them, and survives toDocument round-tripped', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [
        {
          id: 'p1',
          name: 'p1',
          kind: 'group',
          segments: [
            { id: 'ps1', start: '2026-05-01T00:00:00.000Z', end: '2026-05-05T00:00:00.000Z' },
            { id: 'ps2', start: '2026-05-10T00:00:00.000Z', end: '2026-05-15T00:00:00.000Z' },
          ],
        },
        span('c1', { parentId: 'p1', start: '2026-01-01T00:00:00.000Z', end: '2026-01-10T00:00:00.000Z' }),
      ],
    });

    const rolledUp = dataset.entries.get('p1')!;
    expect(rolledUp.start).toBe(instant('2026-01-01T00:00:00.000Z'));
    expect(rolledUp.end).toBe(instant('2026-01-10T00:00:00.000Z'));
    // Neither authored Segment falls anywhere near the rolled-up span any more, so both clamp onto
    // it: the earliest-starting one supplies the new `start`, the latest-ending one the new `end`.
    expect(rolledUp.segments).toEqual([
      { id: 'ps1', start: rolledUp.start, end: rolledUp.end },
      { id: 'ps2', start: rolledUp.end, end: rolledUp.end },
    ]);

    roundTrip(dataset);
  });

  it('writes every optional field when present, and omits them when absent', () => {
    const withAll = new DatasetState({
      timeZone: 'UTC',
      entries: [
        span('t1', {
          parentId: 'p1',
          kind: 'milestone',
          // Two Segments, not one (#212, finding 4): a sole Segment ingest reads always becomes the
          // Entry's own envelope, so it round-trips as the entry's plain `start`/`end` and never
          // reaches this array. Two Segments spanning the same envelope are what still gets written.
          segments: [
            { start: '2026-09-01T00:00:00.000Z', end: '2026-09-06T00:00:00.000Z' },
            { start: '2026-09-06T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
          ],
          meta: { team: 'A' },
        }),
        { id: 'p1', kind: 'group', name: 'Parent' },
      ],
    });
    const present = toDocument(withAll).entries.find((row) => row.id === 't1');
    expect(present?.parentId).toBe('p1');
    expect(present?.kind).toBe('milestone');
    expect(present?.segments).toEqual([
      { id: 'sg1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-06T00:00:00.000Z' },
      { id: 'sg2', start: '2026-09-06T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
    ]);
    expect(present?.meta).toEqual({ team: 'A' });
    roundTrip(withAll);

    const bare = toDocument(new DatasetState({ timeZone: 'UTC', entries: [span('t1')] })).entries[0];
    expect(bare).toEqual({
      id: 't1',
      name: 't1',
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-09-11T00:00:00.000Z',
    });
    expect(bare && 'kind' in bare).toBe(false);
    expect(bare && 'parentId' in bare).toBe(false);
    expect(bare && 'segments' in bare).toBe(false);
    expect(bare && 'meta' in bare).toBe(false);
  });

  it('round-trips a plain entry and a multi-segment entry byte-stable at schema: 4', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [
        span('plain'),
        span('multi', {
          segments: [
            { id: 'first-half', start: '2026-09-01T00:00:00.000Z', end: '2026-09-06T00:00:00.000Z' },
            { id: 'second-half', start: '2026-09-06T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' },
          ],
        }),
      ],
    });
    const first = toDocument(dataset);
    expect(first.schema).toBe(4);
    const multiRow = first.entries.find((row) => row.id === 'multi');
    expect(multiRow?.segments?.map((segment) => segment.id)).toEqual(['first-half', 'second-half']);
    const second = toDocument(fromJSON(first));
    expect(second).toEqual(first);
  });

  it('preserves meta nested objects, arrays, and key order by reference', () => {
    const meta = { z: 1, nested: { b: 2, a: 3 }, list: [1, { k: 'v' }] };
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('t1', { meta })],
    });
    const doc = toDocument(dataset);
    expect(doc.entries[0]?.meta).toBe(meta);
    const round = fromJSON(doc);
    expect(round.entries.get('t1')?.meta).toBe(meta);
    expect(JSON.stringify(toDocument(round))).toBe(JSON.stringify(doc));
  });

  it('keeps a non-UTC timeZone and writes Z-suffixed instants', () => {
    const dataset = new DatasetState({
      timeZone: 'America/Chicago',
      entries: [span('t1')],
    });
    const doc = toDocument(dataset);
    expect(doc.timeZone).toBe('America/Chicago');
    expect(doc.entries[0]?.start.endsWith('Z')).toBe(true);
    roundTrip(dataset);
  });

  it("round-trips dateOnlyEnd: 'exclusive'", () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      dateOnlyEnd: 'exclusive',
      entries: [span('t1')],
    });
    expect(toDocument(dataset).dateOnlyEnd).toBe('exclusive');
    roundTrip(dataset);
  });

  it('round-trips a non-default rollUpKinds', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      rollUpKinds: ['milestone'],
      entries: [span('t1')],
    });
    expect(toDocument(dataset).rollUpKinds).toEqual(['milestone']);
    roundTrip(dataset);
  });

  it('writes entries in insertion order after add and remove, not constructor order', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('a'), span('b'), span('c')],
    });
    dataset.entries.remove('a');
    dataset.entries.add(span('d'));
    expect(toDocument(dataset).entries.map((row) => row.id)).toEqual(['b', 'c', 'd']);
    roundTrip(dataset);
  });

  it('drops unknown top-level keys and unknown entry keys deliberately', () => {
    const raw = {
      schema: 1 as const,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive' as const,
      rollUpKinds: ['group'],
      extraTop: true,
      entries: [
        {
          id: 't1',
          name: 'Groundwork',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-11T00:00:00.000Z',
          extraEntry: true,
        },
      ],
    };
    const round = toDocument(fromJSON(raw));
    expect('extraTop' in round).toBe(false);
    expect(round.entries[0] && 'extraEntry' in round.entries[0]).toBe(false);
    expect(JSON.stringify(toDocument(fromJSON(round)))).toBe(JSON.stringify(round));
  });

  it('drops a top-level cost on ingest; a declared Field reads meta.cost', () => {
    const raw = {
      schema: 1 as const,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive' as const,
      rollUpKinds: ['group'],
      entries: [
        {
          id: 't1',
          name: 'Groundwork',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-11T00:00:00.000Z',
          cost: 500,
          meta: { cost: 400 },
        },
      ],
    };
    const state = new DatasetState({
      ...fromDocument(raw),
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    expect(state.entries.get('t1') && 'cost' in (state.entries.get('t1') as object)).toBe(false);
    expect(state.entries.get('t1')?.meta).toEqual({ cost: 400 });
    expect(state.fields.get('cost')?.source).toEqual({ from: 'meta', key: 'cost' });
    expect(toDocument(state).entries[0]?.meta).toEqual({ cost: 400 });
  });

  it('corrects a stored group span that disagrees with its children, then stays stable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const disagreeing: DatasetDocument = {
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [
        {
          id: 'p1',
          kind: 'group',
          name: 'Sitework',
          start: '2020-01-01T00:00:00.000Z',
          end: '2020-01-02T00:00:00.000Z',
        },
        {
          id: 't1',
          parentId: 'p1',
          name: 'Groundwork',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-11T00:00:00.000Z',
        },
      ],
    };
    const first = toDocument(fromJSON(disagreeing));
    const parent = first.entries.find((row) => row.id === 'p1');
    expect(parent?.start).toBe('2026-09-01T00:00:00.000Z');
    expect(parent?.end).toBe('2026-09-11T00:00:00.000Z');
    const second = toDocument(fromJSON(first));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    warn.mockRestore();
  });

  it('does not warn when a stored group span already matches its children under a different offset form', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc: DatasetDocument = {
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [
        {
          id: 'p1',
          kind: 'group',
          name: 'Sitework',
          start: '2026-09-01T00:00:00Z',
          end: '2026-09-11T00:00:00Z',
        },
        {
          id: 't1',
          parentId: 'p1',
          name: 'Groundwork',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-11T00:00:00.000Z',
        },
      ],
    };
    fromJSON(doc);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a corrected roll-up raises at warning, and the console line is the unsubscribed fallback (D-S5-41)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const disagreeing: DatasetDocument = {
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [
        {
          id: 'p1',
          kind: 'group',
          name: 'Sitework',
          start: '2020-01-01T00:00:00.000Z',
          end: '2020-01-02T00:00:00.000Z',
        },
        {
          id: 't1',
          parentId: 'p1',
          name: 'Groundwork',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-11T00:00:00.000Z',
        },
      ],
    };

    // No subscriber: the console line fires, exactly as it did before this seam existed.
    const unwatched = new DatasetState(fromDocument(disagreeing));
    reportCorrectedRollUps(disagreeing, unwatched, createErrorRaiser(unwatched.bus));
    expect(warn).toHaveBeenCalledTimes(1);

    // One subscriber: the console stays silent and the consumer gets the whole report.
    warn.mockClear();
    const watched = new DatasetState(fromDocument(disagreeing));
    const reports: ErrorReport[] = [];
    watched.on('error', (report) => {
      reports.push(report);
    });
    reportCorrectedRollUps(disagreeing, watched, createErrorRaiser(watched.bus));

    expect(warn).not.toHaveBeenCalled();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.code).toBe('rollup-corrected');
    expect(reports[0]?.severity).toBe('warning');
    expect(reports[0]?.by).toBe('core');
    expect(reports[0]?.entryId).toBe(entryId('p1'));
    warn.mockRestore();
  });

  it('fromJSON throws FreeGanttError (InvalidInstantError), not a bare RangeError, on a zoneless stored date', () => {
    const doc: DatasetDocument = {
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [{ id: 't1', name: 't1', start: '2026-09-01', end: '2026-09-11T00:00:00.000Z' }],
    };
    expect(() => fromDocument(doc)).toThrow(FreeGanttError);
  });

  it('throws UnsupportedSchemaError for a schema this build does not read', () => {
    const doc = {
      schema: 5,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: [],
      entries: [],
    };
    expect(() => fromDocument(doc as unknown as DatasetDocument)).toThrow(UnsupportedSchemaError);
    try {
      fromDocument(doc as unknown as DatasetDocument);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaError);
      if (error instanceof UnsupportedSchemaError) {
        expect(error.code).toBe('unsupported-schema');
        expect(error.schema).toBe(5);
        expect(error.supported).toEqual([1, 2, 3, 4]);
      }
    }
  });

  it('fromJSON starts with an empty history — a document is a state, not a session', () => {
    const dataset = new DatasetState({ timeZone: 'UTC', entries: [span('t1')] });
    dataset.entries.update('t1', { name: 'Renamed' });
    const restored = fromJSON(toDocument(dataset));
    expect(restored.canUndo).toBe(false);
    expect(restored.canRedo).toBe(false);
  });
});

// D-S5-24: plugin rows serialize under `plugins: { [id]: … }` at `schema: 3`. A Document an
// application reads without installing that plugin keeps the rows untouched — passenger data, the
// posture an undeclared `meta` key already has.
describe('plugin rows (schema: 3, D-S5-24)', () => {
  function withLockedT1(): DatasetState {
    const dataset = new DatasetState({ timeZone: 'UTC', entries: [span('t1'), span('t2')] });
    dataset.pluginStores.reserve<{ locked: true }>('demo.lock').set(entryId('t1'), { locked: true });
    return dataset;
  }

  it('writes the plugins key and round-trips it byte-stably', () => {
    const dataset = withLockedT1();
    const doc = toDocument(dataset);
    expect(doc.schema).toBe(4);
    expect(doc.plugins).toEqual({ 'demo.lock': { t1: { locked: true } } });
    roundTrip(dataset);
  });

  it('omits the plugins key when no plugin holds a row', () => {
    const doc = toDocument(new DatasetState({ timeZone: 'UTC', entries: [span('t1')] }));
    expect('plugins' in doc).toBe(false);
  });

  it('carries the rows of a plugin this Dataset never installs', () => {
    const doc = toDocument(withLockedT1());
    // A second application reads the same Document with no plugin installed at all.
    const passenger = fromJSON(doc);
    expect(passenger.pluginStores.read('demo.lock')).toBeUndefined();
    expect(JSON.stringify(toDocument(passenger))).toBe(JSON.stringify(doc));
  });

  it('hands the rows back to the plugin that reserves the store on the reading side', () => {
    const doc = toDocument(withLockedT1());
    const reopened = fromJSON(doc);
    const lock = reopened.pluginStores.reserve<{ locked: true }>('demo.lock');
    expect(lock.get(entryId('t1'))).toEqual({ locked: true });
    expect(lock.get(entryId('t2'))).toBeUndefined();
  });

  it('reads a schema 2 document, which carries no plugin rows, and writes it back at schema 3', () => {
    const older: DatasetDocument = {
      schema: 2,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [{ id: 't1', name: 't1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' }],
    };
    const written = toDocument(fromJSON(older));
    expect(written.schema).toBe(4);
    expect('plugins' in written).toBe(false);
  });

  it('ignores a plugins key on a schema 1 document — that schema has no such key', () => {
    const mislabelled = {
      schema: 1 as const,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive' as const,
      rollUpKinds: ['group'],
      plugins: { 'demo.lock': { t1: { locked: true } } },
      entries: [{ id: 't1', name: 't1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-11T00:00:00.000Z' }],
    };
    expect('plugins' in toDocument(fromJSON(mislabelled))).toBe(false);
  });
});
