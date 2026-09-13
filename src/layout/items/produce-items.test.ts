import { describe, expect, it } from 'vitest';
import { emptyGroupDataset } from '../../../fixtures/empty-group-dataset.js';
import { itemId, rowId, segmentId } from '../../model/index.js';
import type { Entry, EntryId, Instant } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDouble, entryDoubles } from '../entry-double.js';
import type { PlannedRow } from '../rows/row-source.js';
import { produceItemsForRow } from './produce-items.js';
import { followSegments, wholeEntryItem } from './item.js';
import { createVariantRegistry } from './variants.js';

describe('wholeEntryItem (review P3)', () => {
  it('covers the entry span, stamps the variant it is told, and owns the Item id convention', () => {
    const t1 = spanEntry('t1', { name: 'Load test' });
    expect(wholeEntryItem(t1, 'buffer')).toEqual({
      id: itemId(t1.id, 0),
      entryId: t1.id,
      variant: 'buffer',
      label: 'Load test',
      start: t1.start,
      end: t1.end,
    });
  });

  it('carries no segmentId, because it draws the whole Entry and stands for no single Segment (#212)', () => {
    const t1 = spanEntry('t1');
    expect(wholeEntryItem(t1, 'leaf').segmentId).toBeUndefined();
  });

  it('is what a variant with no `items` of its own draws when the Entry has no Segments (ADR 0023)', () => {
    const t1 = spanEntry('t1', { segments: [] });
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({ name: 'buffer', when: () => true });
    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), own)).toEqual([
      wholeEntryItem(t1, 'buffer'),
    ]);
  });

  it('draws one Item per Segment for a variant with no `items` of its own (ADR 0023)', () => {
    const t1 = spanEntry('t1');
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({ name: 'buffer', when: () => true });
    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), own)).toEqual(
      followSegments(t1, 'buffer'),
    );
  });
});

describe('a producer stamps the registration’s own name, not one it invents (ADR 0018, J3)', () => {
  it('receives the resolved variant’s name, so one producer registered under two names stamps each correctly', () => {
    const t1 = spanEntry('t1');
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    const dispose = registry.addPluginVariant({
      name: 'phase',
      when: () => true,
      items: (entry, variant) => [wholeEntryItem(entry, variant)],
    });

    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([
      wholeEntryItem(t1, 'phase'),
    ]);

    dispose();
    registry.addPluginVariant({
      name: 'stage',
      when: () => true,
      items: (entry, variant) => [wholeEntryItem(entry, variant)],
    });
    expect(produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).toEqual([
      wholeEntryItem(t1, 'stage'),
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

const registry = createVariantRegistry({ fieldFor: () => undefined });

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

  it('draws the leaf variant for a childless Entry no rule claims (ADR 0013)', () => {
    const t1 = spanEntry('t1');
    expect(() => produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry)).not.toThrow();
    const items = produceItemsForRow(planned([t1.id]), entryByIdFor([t1]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(itemId(t1.id, 0));
    expect(items[0]?.variant).toBe('leaf');
  });

  it('draws the parent variant for an Entry with children no rule claims', () => {
    const [t1] = entryDoubles([
      { id: 't1', start: 0, end: 10 },
      { id: 'c1', parentId: 't1', start: 0, end: 10 },
    ]);
    const items = produceItemsForRow(planned([t1!.id]), entryByIdFor([t1!]), registry);
    expect(items).toHaveLength(1);
    expect(items[0]?.variant).toBe('summary');
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
