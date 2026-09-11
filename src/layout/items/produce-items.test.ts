import { describe, expect, it } from 'vitest';
import { emptyGroupDataset } from '../../../fixtures/empty-group-dataset.js';
import { entryId, itemId, rowId, segmentId } from '../../model/index.js';
import type { Entry, EntryId, Instant } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { createItemProducerRegistry, produceItemsForRow, wholeEntryItem } from './produce-items.js';

describe('wholeEntryItem (review P3)', () => {
  it('covers the entry span and owns the Item id convention, so a plugin producer never restates it', () => {
    const t1 = spanEntry('t1', { name: 'Load test', kind: 'buffer' });
    expect(wholeEntryItem(t1)).toEqual({
      id: itemId(t1.id, 0),
      entryId: t1.id,
      kind: 'buffer',
      label: 'Load test',
      start: t1.start,
      end: t1.end,
    });
  });

  it('carries no segmentId, because it draws the whole Entry and stands for no single Segment (#212)', () => {
    const t1 = spanEntry('t1');
    expect(wholeEntryItem(t1).segmentId).toBeUndefined();
  });

  it('is what a registered producer returns: `(entry) => [wholeEntryItem(entry)]`', () => {
    const t1 = spanEntry('t1', { kind: 'buffer' });
    const registry = createItemProducerRegistry();
    registry.register('buffer', (entry) => [wholeEntryItem(entry)]);
    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([wholeEntryItem(t1)]);
  });
});

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
    segments: [{ id: segmentId(`${id}-1`), start: asInstant(0), end: asInstant(10) }],
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
        { id: segmentId('t1-0'), start: asInstant(0), end: asInstant(2) },
        { id: segmentId('t1-1'), start: asInstant(3), end: asInstant(5) },
        { id: segmentId('t1-2'), start: asInstant(6), end: asInstant(8) },
      ],
    });
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items.map((item) => item.id)).toEqual([itemId(t1.id, 0), itemId(t1.id, 1), itemId(t1.id, 2)]);
    expect(items.map((item) => item.start)).toEqual([asInstant(0), asInstant(3), asInstant(6)]);
    expect(items.map((item) => item.segmentId)).toEqual(t1.segments.map((segment) => segment.id));
  });

  it('produces t1:0 for an entry with its one default Segment (#212: an Entry never has none)', () => {
    const t1 = spanEntry('t1');
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.start).toBe(t1.start);
    expect(items[0]?.end).toBe(t1.end);
    expect(items[0]?.segmentId).toBe(t1.segments[0]?.id);
  });

  it('falls back to the span producer for an unregistered Kind and does not throw', () => {
    const t1 = spanEntry('t1', { kind: 'phase' });
    expect(() => produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).not.toThrow();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.kind).toBe('phase');
  });

  it('an Entry with one date and no Segment draws no bar (ADR 0012 Gate)', () => {
    const t1: Entry = { id: entryId('t1'), name: 't1', kind: 'span', start: asInstant(0), segments: [] };
    expect(t1.end).toBeUndefined();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(0);
  });

  it('[S4-A8] an empty group produces no Item; a child gives the group a real span (ADR 0012)', () => {
    const dataset = emptyGroupDataset();
    const empty = dataset.entries.get('g1')!;
    expect(empty.start).toBeUndefined();
    expect(empty.end).toBeUndefined();
    const emptyItems = produceItemsForRow(planned([empty.id]), entryByIdFor([empty]), registry);
    expect(emptyItems).toHaveLength(0);

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
        start: entry.start!,
        end: entry.end!,
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
        start: entry.start!,
        end: entry.end!,
      },
    ]);
    own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        kind: entry.kind,
        label: `second:${entry.name}`,
        start: entry.start!,
        end: entry.end!,
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
