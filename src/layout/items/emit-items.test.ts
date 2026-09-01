import { describe, expect, it } from 'vitest';
import { Dataset } from '../../api/dataset.js';
import { entryId, itemId, rowId } from '../../model/index.js';
import type { Entry, EntryId, Instant } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { emitRow } from './emit-items.js';

function asInstant(ms: number): Instant {
  return ms as Instant;
}

function spanEntry(id: string, extras: Partial<Entry> = {}): Entry {
  return {
    id: entryId(id),
    name: id,
    start: asInstant(0),
    end: asInstant(10),
    kind: 'span',
    ...extras,
  };
}

function planned(entryIds: readonly EntryId[], kind: PlannedRow['kind'] = 'entry'): PlannedRow {
  return {
    id: rowId(entryIds[0] !== undefined ? String(entryIds[0]) : 'header'),
    kind,
    index: 0,
    depth: 0,
    entryIds,
    expandable: false,
    expanded: true,
    heightMode: 'fixed',
  };
}

function ctxFor(entries: readonly Entry[]) {
  return { entryById: new Map(entries.map((entry) => [entry.id, entry])) };
}

describe('emitRow', () => {
  it('emits one Item per Segment with ids t1:0, t1:1, t1:2', () => {
    const t1 = spanEntry('t1', {
      segments: [
        { start: asInstant(0), end: asInstant(2) },
        { start: asInstant(3), end: asInstant(5) },
        { start: asInstant(6), end: asInstant(8) },
      ],
    });
    const items = emitRow(planned([t1.id]), ctxFor([t1]));
    expect(items.map((item) => item.id)).toEqual([itemId(t1.id, 0), itemId(t1.id, 1), itemId(t1.id, 2)]);
    expect(items.map((item) => item.start)).toEqual([asInstant(0), asInstant(3), asInstant(6)]);
  });

  it('emits t1:0 when the entry has no segments', () => {
    const t1 = spanEntry('t1');
    const items = emitRow(planned([t1.id]), ctxFor([t1]));
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.start).toBe(t1.start);
    expect(items[0]?.end).toBe(t1.end);
  });

  it('falls back to emitSpan for an unregistered Kind and does not throw', () => {
    const t1 = spanEntry('t1', { kind: 'phase' });
    expect(() => emitRow(planned([t1.id]), ctxFor([t1]))).not.toThrow();
    const items = emitRow(planned([t1.id]), ctxFor([t1]));
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.kind).toBe('phase');
  });

  it('[S4-A8] an empty group emits one Item; a child gives the group a real span', () => {
    const dataset = new Dataset({
      entries: [{ id: 'g1', kind: 'group', name: 'g1' }],
      timeZone: 'UTC',
    });
    const empty = dataset.entries.get('g1')!;
    const emptyItems = emitRow(planned([empty.id]), ctxFor([empty]));
    expect(emptyItems).toHaveLength(1);
    expect(emptyItems[0]?.kind).toBe(empty.kind);
    expect(emptyItems[0]?.start).toBe(empty.end);

    dataset.entries.add({
      id: 'c1',
      parentId: 'g1',
      name: 'c1',
      start: '2026-03-01',
      end: '2026-03-05',
    });
    const filled = dataset.entries.get('g1')!;
    const filledItems = emitRow(planned([filled.id]), ctxFor([filled]));
    expect(filledItems).toHaveLength(1);
    expect(filledItems[0]?.start).toBe(filled.start);
    expect(filledItems[0]?.end).toBe(filled.end);
    expect(filledItems[0]?.start).not.toBe(filledItems[0]?.end);
  });

  it("a PlannedRow.kind: 'header' row emits no Items", () => {
    const t1 = spanEntry('t1');
    const items = emitRow(planned([], 'header'), ctxFor([t1]));
    expect(items).toEqual([]);
  });
});
