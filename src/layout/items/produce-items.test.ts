import { describe, expect, it } from 'vitest';
import { emptyGroupDataset } from '../../../fixtures/empty-group-dataset.js';
import { entryId, itemId, rowId } from '../../model/index.js';
import type { Entry, EntryId, Instant } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { createItemProducerRegistry, produceItemsForRow } from './produce-items.js';

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

function planned(entryIds: readonly EntryId[]): PlannedRow {
  return {
    id: rowId(entryIds[0] !== undefined ? String(entryIds[0]) : 'header'),
    index: 0,
    depth: 0,
    entryIds,
    expandable: false,
    expanded: true,
    heightMode: 'fixed',
  };
}

function entryByIdFor(entries: readonly Entry[]): ReadonlyMap<EntryId, Entry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

const registry = createItemProducerRegistry();

describe('produceItemsForRow', () => {
  it('produces one Item per Segment with ids t1:0, t1:1, t1:2', () => {
    const t1 = spanEntry('t1', {
      segments: [
        { start: asInstant(0), end: asInstant(2) },
        { start: asInstant(3), end: asInstant(5) },
        { start: asInstant(6), end: asInstant(8) },
      ],
    });
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items.map((item) => item.id)).toEqual([itemId(t1.id, 0), itemId(t1.id, 1), itemId(t1.id, 2)]);
    expect(items.map((item) => item.start)).toEqual([asInstant(0), asInstant(3), asInstant(6)]);
  });

  it('produces t1:0 when the entry has no segments', () => {
    const t1 = spanEntry('t1');
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.start).toBe(t1.start);
    expect(items[0]?.end).toBe(t1.end);
  });

  it('falls back to the span producer for an unregistered Kind and does not throw', () => {
    const t1 = spanEntry('t1', { kind: 'phase' });
    expect(() => produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).not.toThrow();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.kind).toBe('phase');
  });

  it('[S4-A8] an empty group produces one Item; a child gives the group a real span', () => {
    const dataset = emptyGroupDataset();
    const empty = dataset.entries.get('g1')!;
    const emptyItems = produceItemsForRow(planned([empty.id]), entryByIdFor([empty]), registry);
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
    const filledItems = produceItemsForRow(planned([filled.id]), entryByIdFor([filled]), registry);
    expect(filledItems).toHaveLength(1);
    expect(filledItems[0]?.start).toBe(filled.start);
    expect(filledItems[0]?.end).toBe(filled.end);
    expect(filledItems[0]?.start).not.toBe(filledItems[0]?.end);
  });

  it('a header row (empty entryIds) produces no Items', () => {
    const t1 = spanEntry('t1');
    const items = produceItemsForRow(planned([]), entryByIdFor([t1]), registry);
    expect(items).toEqual([]);
  });
});
