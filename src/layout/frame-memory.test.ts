import { describe, expect, it, vi } from 'vitest';
import { FrameMemory } from './frame-memory.js';
import { createVariantRegistry } from './items/variants.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import * as produceItems from './items/produce-items.js';
import { entryId, rowId, segmentId } from '../model/index.js';
import type { Entry } from '../model/index.js';
import { entryDoubleLike } from './entry-double.js';
import type { PlannedRow } from './rows/row-source.js';

function planOf(entries = sampleEntries): readonly PlannedRow[] {
  return entries.map((entry, index) => ({
    id: rowId(entry.id),
    kind: 'entry' as const,
    index,
    depth: 0,
    entryIds: [entry.id],
    expandable: false,
    expanded: false,
  }));
}

describe('FrameMemory (A2)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });

  it('heightOfRow stays at rowHeight regardless of how many Segments a row draws (singleLane, D-S4-19)', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = planOf([one]);
    memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });
    expect(memory.heightOfRow(0)).toBe(32);

    const three = entryDoubleLike(one, {
      segments: [one, one, one].map((span, index) => ({
        id: segmentId(`${one.id}-${index}`),
        start: span.start!,
        end: span.end!,
      })),
    });
    memory.sync({ plan, rowHeight: 32, entries: [three], registry, datasetRevision: 1 });
    expect(memory.heightOfRow(0)).toBe(32);
  });

  it('a new datasetRevision invalidates the produced cache, so it never reports stale Segment ids (#243)', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = planOf([one]);
    memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });
    const firstSegmentId = memory.rowMemory(String(plan[0]!.id)).segmentIds;
    expect(firstSegmentId).toEqual([one.segments[0]!.id]);

    const two = entryDoubleLike(one, {
      segments: [
        one.segments[0]!,
        { id: segmentId(`${one.id}-1`), start: one.segments[0]!.start, end: one.segments[0]!.end },
      ],
    });
    memory.sync({ plan, rowHeight: 32, entries: [two], registry, datasetRevision: 1 });

    expect(memory.rowMemory(String(plan[0]!.id)).segmentIds).toEqual(two.segments.map((s) => s.id));
  });

  it('a new datasetRevision produces again without invalidateFrom', () => {
    const spy = vi.spyOn(produceItems, 'produceItemsForRow');
    const memory = new FrameMemory();
    const bind = {
      plan: planOf(sampleEntries.slice(0, 1)),
      rowHeight: 32,
      entries: sampleEntries.slice(0, 1),
      registry,
    };
    memory.sync({ ...bind, datasetRevision: 0 });
    memory.rowMemory(String(bind.plan[0]!.id));
    const first = spy.mock.calls.length;
    memory.sync({ ...bind, datasetRevision: 1 });
    memory.rowMemory(String(bind.plan[0]!.id));
    expect(spy.mock.calls.length).toBeGreaterThan(first);
    spy.mockRestore();
  });
});

describe('FrameMemory remembers the Segment sets beside the Items (#230 R1)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });

  function memoryFor(entries: readonly Entry[]): { memory: FrameMemory; rowKey: string } {
    const plan = planOf(entries);
    const memory = new FrameMemory();
    memory.sync({ plan, rowHeight: 32, entries, registry, datasetRevision: 0 });
    return { memory, rowKey: String(plan[0]!.id) };
  }

  it('caches segmentIdsByItem, so a repeated ask allocates nothing (I5)', () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);

    expect(memory.rowMemory(rowKey).segmentIdsByItem).toBe(memory.rowMemory(rowKey).segmentIdsByItem);
  });

  it('names the Segments each Item stands for, keyed by that Item', () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);
    const row = memory.rowMemory(rowKey);

    for (const item of row.items) {
      expect(row.segmentIdsByItem.get(item.id)).toEqual(
        item.segmentId === undefined ? sampleEntries[0]!.segments.map((s) => s.id) : [item.segmentId],
      );
    }
  });

  it("names every Segment of every Entry the row owns, in the row's order", () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);

    expect(memory.rowMemory(rowKey).segmentIds).toEqual(sampleEntries[0]!.segments.map((s) => s.id));
  });

  it('answers a row no frame planned with nothing, and allocates nothing to say so', () => {
    const { memory } = memoryFor([sampleEntries[0]!]);

    expect(memory.rowMemory('no-such-row').segmentIds).toEqual([]);
    expect(memory.rowMemory('no-such-row')).toBe(memory.rowMemory('no-other-row'));
  });

  it('segmentIdsOfEntries answers for an Entry no planned row owns — a collapsed row still asks', () => {
    // `FrameLayout.entryIdsForRow` names the Entries of a row collapse hid, so its Segment answer
    // must agree with it. That is why this reads the Entry map, not the planned rows.
    const held = sampleEntries[0]!;
    const plan = planOf([held]);
    const memory = new FrameMemory();
    const other = sampleEntries[1]!;
    memory.sync({ plan, rowHeight: 32, entries: [held, other], registry, datasetRevision: 0 });

    expect(memory.segmentIdsOfEntries([other.id])).toEqual(other.segments.map((s) => s.id));
    expect(memory.segmentIdsOfEntries([])).toEqual([]);
    expect(memory.segmentIdsOfEntries([entryId('never-synced')])).toEqual([]);
  });
});
