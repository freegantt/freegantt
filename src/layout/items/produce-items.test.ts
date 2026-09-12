import { describe, expect, it } from 'vitest';
import { emptyGroupDataset } from '../../../fixtures/empty-group-dataset.js';
import { itemId, rowId, segmentId } from '../../model/index.js';
import type { Entry, EntryId, Instant } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import type { PlannedRow } from '../rows/row-source.js';
import { createItemProducerRegistry, produceItemsForRow, wholeEntryItem } from './produce-items.js';

describe('wholeEntryItem (review P3)', () => {
  it('covers the entry span, stamps the look it is told, and owns the Item id convention', () => {
    const t1 = spanEntry('t1', { name: 'Load test' });
    expect(wholeEntryItem(t1, 'buffer')).toEqual({
      id: itemId(t1.id, 0),
      entryId: t1.id,
      look: 'buffer',
      label: 'Load test',
      start: t1.start,
      end: t1.end,
    });
  });

  it('carries no segmentId, because it draws the whole Entry and stands for no single Segment (#212)', () => {
    const t1 = spanEntry('t1');
    expect(wholeEntryItem(t1, 'leaf').segmentId).toBeUndefined();
  });

  it('is what a registered producer returns: `(entry) => [wholeEntryItem(entry, look)]`', () => {
    const t1 = spanEntry('t1');
    const registry = createItemProducerRegistry();
    registry.registerClaim('buffer', () => true);
    registry.register('buffer', (entry) => [wholeEntryItem(entry, 'buffer')]);
    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([
      wholeEntryItem(t1, 'buffer'),
    ]);
  });
});

function asInstant(ms: number): Instant {
  return ms as Instant;
}

function spanEntry(id: string, extras: Partial<EntryDoubleValues> = {}): Entry {
  return entryDouble({ id, start: 0, end: 10, ...extras });
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

  it('falls back to the leaf producer for a childless Entry no registered look claims (ADR 0013)', () => {
    const t1 = spanEntry('t1');
    expect(() => produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).not.toThrow();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.look).toBe('leaf');
  });

  it('falls back to the parent producer for an Entry with children no registered look claims', () => {
    const [t1] = entryDoubles([
      { id: 't1', start: 0, end: 10 },
      { id: 'c1', parentId: 't1', start: 0, end: 10 },
    ]);
    const items = produceItemsForRow(planned([t1!.id]), entryByIdFor([t1!]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.look).toBe('parent');
  });

  it('an Entry with one date and no Segment draws no bar (ADR 0012 Gate)', () => {
    const t1 = entryDouble({ id: 't1', start: 0 });
    expect(t1.end).toBeUndefined();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(0);
  });

  it('[S4-A8] an entry with no children produces no Item; a child gives it a real span (ADR 0012)', () => {
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

  it('[S5.9, D-S5-22] a registered producer draws its own look; the shipped two are unchanged', () => {
    const own = createItemProducerRegistry();
    const t1 = spanEntry('t1');
    // A plugin claims the entries it owns (Q10) — `t1.id` alone, so `t2` below still falls through
    // to the shipped `'leaf'`. The producer then draws whatever the claim won.
    own.registerClaim('buffer', (entry) => entry.id === t1.id);
    own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        look: 'buffer',
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

  it('register() returns a Disposer that falls back to the built-in producer for that look', () => {
    const own = createItemProducerRegistry();
    const originalLeaf = own.producerFor('leaf');
    const dispose = own.register('leaf', () => []);
    expect(own.producerFor('leaf')).not.toBe(originalLeaf);
    dispose();
    expect(own.producerFor('leaf')).toBe(originalLeaf);
  });

  it('register() on an unregistered look leaves nothing behind on dispose', () => {
    const own = createItemProducerRegistry();
    const dispose = own.register('buffer', () => []);
    expect(own.producerFor('buffer')).not.toBeUndefined();
    dispose();
    expect(own.producerFor('buffer')).toBeUndefined();
  });

  it('disposing the first of two registrations on one look leaves the second producing', () => {
    const own = createItemProducerRegistry();
    const t1 = spanEntry('t1');
    own.registerClaim('buffer', () => true);
    const disposeFirst = own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        look: 'buffer',
        label: `first:${entry.name}`,
        start: entry.start!,
        end: entry.end!,
      },
    ]);
    own.register('buffer', (entry) => [
      {
        id: itemId(entry.id, 0),
        entryId: entry.id,
        look: 'buffer',
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
