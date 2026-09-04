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

function planned(entryIds: readonly EntryId[], kind: 'entry' | 'header' = 'entry'): PlannedRow {
  return {
    id: rowId(entryIds[0] !== undefined ? String(entryIds[0]) : 'header'),
    kind: entryIds.length === 0 ? 'header' : kind,
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

  it('[S5.9, D-S5-22] a registered producer draws its own kind; the shipped three are unchanged', () => {
    const own = createItemProducerRegistry();
    const t1 = spanEntry('t1', { kind: 'buffer' });
    own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        kind: entry.kind,
        label: `buffer:${entry.name}`,
        start: entry.start,
        end: entry.end,
      },
    ]);
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), own);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('buffer:t1');
    const span = spanEntry('t2');
    const spanItems = produceItemsForRow(planned([span.id]), entryByIdFor([span]), own);
    expect(spanItems[0]?.label).toBe('t2');
  });

  it('register() returns a Disposer that falls back to the built-in producer for that kind', () => {
    const own = createItemProducerRegistry();
    const originalSpan = own.producerFor('span');
    const dispose = own.register('span', () => []);
    expect(own.producerFor('span')).not.toBe(originalSpan);
    dispose();
    expect(own.producerFor('span')).toBe(originalSpan);
  });

  it('register() on an unregistered kind restores the span fallback on dispose', () => {
    const own = createItemProducerRegistry();
    const dispose = own.register('buffer', () => []);
    expect(own.producerFor('buffer')).not.toBe(own.producerFor('span'));
    dispose();
    expect(own.producerFor('buffer')).toBe(own.producerFor('span'));
  });

  it('disposing the first of two registrations on one kind leaves the second producing', () => {
    const own = createItemProducerRegistry();
    const t1 = spanEntry('t1', { kind: 'buffer' });
    const disposeFirst = own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        kind: entry.kind,
        label: `first:${entry.name}`,
        start: entry.start,
        end: entry.end,
      },
    ]);
    own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        kind: entry.kind,
        label: `second:${entry.name}`,
        start: entry.start,
        end: entry.end,
      },
    ]);
    disposeFirst();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), own);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('second:t1');
  });

  it('a header row (kind: header) produces no Items', () => {
    const t1 = spanEntry('t1');
    const header: PlannedRow = {
      id: rowId('header'),
      kind: 'header',
      index: 0,
      depth: 0,
      entryIds: [],
      expandable: false,
      expanded: true,
      heightMode: 'fixed',
      headerLabel: 'Team',
    };
    const items = produceItemsForRow(header, entryByIdFor([t1]), registry);
    expect(items).toEqual([]);
  });
});
