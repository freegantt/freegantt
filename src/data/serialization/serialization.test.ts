import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from '../dataset-state.js';
import { toJSON, readDocument, warnIfRollUpsWereCorrected } from './index.js';
import { FreeGanttError, UnsupportedSchemaError } from '../../model/index.js';
import type { DatasetDocument } from '../../model/index.js';
import type { EntryInput } from '../../model/index.js';

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
  const state = new DatasetState(readDocument(doc));
  warnIfRollUpsWereCorrected(doc, state);
  return state;
}

function roundTrip(dataset: DatasetState): void {
  const doc = toJSON(dataset);
  const round = toJSON(fromJSON(doc));
  expect(JSON.stringify(round)).toBe(JSON.stringify(doc));
}

describe('[S2-A2] toJSON / fromJSON', () => {
  it('round-trips byte-stable from a Dataset write', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('t1')],
    });
    roundTrip(dataset);
  });

  it('writes every optional field when present, and omits them when absent', () => {
    const withAll = new DatasetState({
      timeZone: 'UTC',
      entries: [
        span('t1', {
          parentId: 'p1',
          kind: 'milestone',
          segments: [{ start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' }],
          meta: { team: 'A' },
        }),
        { id: 'p1', kind: 'group', name: 'Parent' },
      ],
    });
    const present = toJSON(withAll).entries.find((row) => row.id === 't1');
    expect(present?.parentId).toBe('p1');
    expect(present?.kind).toBe('milestone');
    expect(present?.segments).toEqual([
      { start: '2026-09-01T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
    ]);
    expect(present?.meta).toEqual({ team: 'A' });
    roundTrip(withAll);

    const bare = toJSON(new DatasetState({ timeZone: 'UTC', entries: [span('t1')] })).entries[0];
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

  it('preserves meta nested objects, arrays, and key order by reference', () => {
    const meta = { z: 1, nested: { b: 2, a: 3 }, list: [1, { k: 'v' }] };
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('t1', { meta })],
    });
    const doc = toJSON(dataset);
    expect(doc.entries[0]?.meta).toBe(meta);
    const round = fromJSON(doc);
    expect(round.entries.get('t1')?.meta).toBe(meta);
    expect(JSON.stringify(toJSON(round))).toBe(JSON.stringify(doc));
  });

  it('keeps a non-UTC timeZone and writes Z-suffixed instants', () => {
    const dataset = new DatasetState({
      timeZone: 'America/Chicago',
      entries: [span('t1')],
    });
    const doc = toJSON(dataset);
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
    expect(toJSON(dataset).dateOnlyEnd).toBe('exclusive');
    roundTrip(dataset);
  });

  it('round-trips a non-default rollUpKinds', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      rollUpKinds: ['milestone'],
      entries: [span('t1')],
    });
    expect(toJSON(dataset).rollUpKinds).toEqual(['milestone']);
    roundTrip(dataset);
  });

  it('writes entries in insertion order after add and remove, not constructor order', () => {
    const dataset = new DatasetState({
      timeZone: 'UTC',
      entries: [span('a'), span('b'), span('c')],
    });
    dataset.entries.remove('a');
    dataset.entries.add(span('d'));
    expect(toJSON(dataset).entries.map((row) => row.id)).toEqual(['b', 'c', 'd']);
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
    const round = toJSON(fromJSON(raw));
    expect('extraTop' in round).toBe(false);
    expect(round.entries[0] && 'extraEntry' in round.entries[0]).toBe(false);
    expect(JSON.stringify(toJSON(fromJSON(round)))).toBe(JSON.stringify(round));
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
      ...readDocument(raw),
      fieldTypes: { money: { rollUp: 'sum' } },
      fields: [{ key: 'cost', type: 'money' }],
    });
    expect(state.entries.get('t1') && 'cost' in (state.entries.get('t1') as object)).toBe(false);
    expect(state.entries.get('t1')?.meta).toEqual({ cost: 400 });
    expect(state.fields.get('cost')?.source).toEqual({ from: 'meta', key: 'cost' });
    expect(toJSON(state).entries[0]?.meta).toEqual({ cost: 400 });
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
    const first = toJSON(fromJSON(disagreeing));
    const parent = first.entries.find((row) => row.id === 'p1');
    expect(parent?.start).toBe('2026-09-01T00:00:00.000Z');
    expect(parent?.end).toBe('2026-09-11T00:00:00.000Z');
    const second = toJSON(fromJSON(first));
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

  it('fromJSON throws FreeGanttError (InvalidInstantError), not a bare RangeError, on a zoneless stored date', () => {
    const doc: DatasetDocument = {
      schema: 1,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: ['group'],
      entries: [{ id: 't1', name: 't1', start: '2026-09-01', end: '2026-09-11T00:00:00.000Z' }],
    };
    expect(() => readDocument(doc)).toThrow(FreeGanttError);
  });

  it('throws UnsupportedSchemaError for a schema this build does not read', () => {
    const doc = {
      schema: 4,
      timeZone: 'UTC',
      dateOnlyEnd: 'inclusive',
      rollUpKinds: [],
      entries: [],
    };
    expect(() => readDocument(doc as unknown as DatasetDocument)).toThrow(UnsupportedSchemaError);
    try {
      readDocument(doc as unknown as DatasetDocument);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaError);
      if (error instanceof UnsupportedSchemaError) {
        expect(error.code).toBe('unsupported-schema');
        expect(error.schema).toBe(4);
        expect(error.supported).toEqual([1, 2, 3]);
      }
    }
  });

  it('fromJSON starts with an empty history — a document is a state, not a session', () => {
    const dataset = new DatasetState({ timeZone: 'UTC', entries: [span('t1')] });
    dataset.entries.update('t1', { name: 'Renamed' });
    const restored = fromJSON(toJSON(dataset));
    expect(restored.canUndo).toBe(false);
    expect(restored.canRedo).toBe(false);
  });
});
