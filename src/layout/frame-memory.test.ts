import { describe, expect, it, vi } from 'vitest';
import { FrameMemory } from './frame-memory.js';
import { createItemProducerRegistry } from './items/produce-items.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import * as packLanes from './lanes/pack-lanes.js';
import { entryId, rowId, segmentId } from '../model/index.js';
import type { Entry } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';

function packPlan(entries = sampleEntries): readonly PlannedRow[] {
  return entries.map((entry, index) => ({
    id: rowId(entry.id),
    kind: 'entry' as const,
    index,
    depth: 0,
    entryIds: [entry.id],
    expandable: false,
    expanded: false,
    heightMode: 'pack' as const,
  }));
}

describe('FrameMemory (A2)', () => {
  const registry = createItemProducerRegistry();
  const laneGap = 2;

  it('heightOfRow follows packed lane count without a FrameLayout', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = packPlan([one]);
    memory.sync({
      plan,
      rowHeight: 32,
      laneGap,
      entries: [one],
      registry,
      datasetRevision: 0,
    });
    expect(memory.heightOfRow(0)).toBe(32);

    const three = {
      ...one,
      segments: [one, one, one].map((span, index) => ({
        id: segmentId(`${one.id}-${index}`),
        start: span.start,
        end: span.end,
      })),
    };
    memory.sync({
      plan,
      rowHeight: 32,
      laneGap,
      entries: [three],
      registry,
      datasetRevision: 1,
    });
    expect(memory.heightOfRow(0)).toBe(32 * 3 + 2 * laneGap);
  });

  it('a new datasetRevision invalidates the packed cache, so it never reports stale Segment ids (#243)', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = packPlan([one]);
    memory.sync({ plan, rowHeight: 32, laneGap, entries: [one], registry, datasetRevision: 0 });
    const firstSegmentId = memory.packedRow(String(plan[0]!.id)).segmentIds;
    expect(firstSegmentId).toEqual([one.segments[0]!.id]);

    const two = {
      ...one,
      segments: [
        one.segments[0]!,
        { id: segmentId(`${one.id}-1`), start: one.segments[0]!.start, end: one.segments[0]!.end },
      ],
    };
    memory.sync({ plan, rowHeight: 32, laneGap, entries: [two], registry, datasetRevision: 1 });

    expect(memory.packedRow(String(plan[0]!.id)).segmentIds).toEqual(two.segments.map((s) => s.id));
  });

  it('a new datasetRevision packs again without invalidateFrom', () => {
    const spy = vi.spyOn(packLanes, 'packRow');
    const memory = new FrameMemory();
    const bind = {
      plan: packPlan(sampleEntries.slice(0, 1)),
      rowHeight: 32,
      laneGap,
      entries: sampleEntries.slice(0, 1),
      registry,
    };
    memory.sync({ ...bind, datasetRevision: 0 });
    memory.packedRow(String(bind.plan[0]!.id));
    const first = spy.mock.calls.length;
    memory.sync({ ...bind, datasetRevision: 1 });
    memory.packedRow(String(bind.plan[0]!.id));
    expect(spy.mock.calls.length).toBeGreaterThan(first);
    spy.mockRestore();
  });
});

describe('FrameMemory remembers the Segment sets beside the Items (#230 R1)', () => {
  const registry = createItemProducerRegistry();
  const laneGap = 2;

  function memoryFor(entries: readonly Entry[]): { memory: FrameMemory; rowKey: string } {
    const plan = packPlan(entries);
    const memory = new FrameMemory();
    memory.sync({ plan, rowHeight: 32, laneGap, entries, registry, datasetRevision: 0 });
    return { memory, rowKey: String(plan[0]!.id) };
  }

  it('caches segmentIdsByItem, so a repeated ask allocates nothing (I5)', () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);

    expect(memory.packedRow(rowKey).segmentIdsByItem).toBe(memory.packedRow(rowKey).segmentIdsByItem);
  });

  it('names the Segments each Item stands for, keyed by that Item', () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);
    const row = memory.packedRow(rowKey);

    for (const item of row.items) {
      expect(row.segmentIdsByItem.get(item.id)).toEqual(
        item.segmentId === undefined ? sampleEntries[0]!.segments.map((s) => s.id) : [item.segmentId],
      );
    }
  });

  it("names every Segment of every Entry the row owns, in the row's order", () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);

    expect(memory.packedRow(rowKey).segmentIds).toEqual(sampleEntries[0]!.segments.map((s) => s.id));
  });

  it('answers a row no frame planned with nothing, and allocates nothing to say so', () => {
    const { memory } = memoryFor([sampleEntries[0]!]);

    expect(memory.packedRow('no-such-row').segmentIds).toEqual([]);
    expect(memory.packedRow('no-such-row')).toBe(memory.packedRow('no-other-row'));
  });

  it('segmentIdsOfEntries answers for an Entry no planned row owns — a collapsed row still asks', () => {
    // `FrameLayout.entryIdsForRow` names the Entries of a row collapse hid, so its Segment answer
    // must agree with it. That is why this reads the Entry map, not the planned rows.
    const held = sampleEntries[0]!;
    const plan = packPlan([held]);
    const memory = new FrameMemory();
    const other = sampleEntries[1]!;
    memory.sync({ plan, rowHeight: 32, laneGap, entries: [held, other], registry, datasetRevision: 0 });

    expect(memory.segmentIdsOfEntries([other.id])).toEqual(other.segments.map((s) => s.id));
    expect(memory.segmentIdsOfEntries([])).toEqual([]);
    expect(memory.segmentIdsOfEntries([entryId('never-synced')])).toEqual([]);
  });
});
