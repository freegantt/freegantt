import { describe, expect, it, vi } from 'vitest';
import { FrameMemory } from './frame-memory.js';
import { createItemProducerRegistry } from './items/produce-items.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import * as packLanes from './lanes/pack-lanes.js';
import { rowId } from '../model/index.js';
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
    });
    expect(memory.heightOfRow(0)).toBe(32);

    const three = { ...one, segments: [one, one, one].map((span) => ({ start: span.start, end: span.end })) };
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
