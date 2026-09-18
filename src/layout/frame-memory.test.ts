import { describe, expect, it, vi } from 'vitest';
import { FrameMemory } from './frame-memory.js';
import { createVariantRegistry } from './items/variants.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import * as produceBars from './items/produce-items.js';
import { rowId } from '../model/index.js';
import { entryDoubleLike } from './entry-double.js';
import type { PlannedRow } from './rows/row-source.js';
import { addMs } from '../time/index.js';

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

  it('heightOfRow stays at rowHeight regardless of how many Entries a row draws (singleLane, D-S4-19)', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = planOf([one]);
    memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });
    expect(memory.heightOfRow(0)).toBe(32);

    // A row.entryIds naming several Entries — a packed row's own shape (ADR 0026 retired the
    // multi-Segment single-Entry row this test used to build instead) — draws one Bar per Entry,
    // and still keeps the row at rowHeight.
    const packedPlan: readonly PlannedRow[] = [
      {
        id: rowId('packed'),
        kind: 'entry',
        index: 0,
        depth: 0,
        entryIds: sampleEntries.slice(0, 3).map((entry) => entry.id),
        expandable: false,
        expanded: false,
      },
    ];
    memory.sync({
      plan: packedPlan,
      rowHeight: 32,
      entries: sampleEntries.slice(0, 3),
      registry,
      datasetRevision: 1,
    });
    expect(memory.heightOfRow(0)).toBe(32);
  });

  it('a new datasetRevision invalidates the produced cache, so it never reports stale Bars (#243)', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = planOf([one]);
    memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });
    const firstItems = memory.rowMemory(String(plan[0]!.id)).items;
    expect(firstItems).toHaveLength(1);
    expect(firstItems[0]!.entryId).toBe(one.id);

    const moved = entryDoubleLike(one, {
      start: addMs(one.start!, 1000),
      end: addMs(one.end!, 1000),
    });
    memory.sync({ plan, rowHeight: 32, entries: [moved], registry, datasetRevision: 1 });

    const secondItems = memory.rowMemory(String(plan[0]!.id)).items;
    expect(secondItems[0]!.start).toBe(moved.start);
  });

  it('a new datasetRevision produces again without invalidateFrom', () => {
    const spy = vi.spyOn(produceBars, 'produceBarsForRow');
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

// Retired (ADR 0026, #421): this describe block used to be 'FrameMemory remembers the Segment sets
// beside the Bars (#230 R1)' — `RowMemory.segmentIds`/`segmentIdsByBar` and
// `FrameMemory.segmentIdsOfEntries` named which Segment(s) each Bar stood for. A core Entry now
// always draws exactly one Bar over its own span, so there is no Segment set left to name, and
// `RowMemory` carries only `items`. Two tests below still ask a real question about the cache
// itself and are kept, rewritten against `items`.
describe('FrameMemory caches the Bars a row produced (#230 R1)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });

  function memoryFor(entries: readonly (typeof sampleEntries)[number][]): {
    memory: FrameMemory;
    rowKey: string;
  } {
    const plan = planOf(entries);
    const memory = new FrameMemory();
    memory.sync({ plan, rowHeight: 32, entries, registry, datasetRevision: 0 });
    return { memory, rowKey: String(plan[0]!.id) };
  }

  it('caches the produced RowMemory, so a repeated ask allocates nothing (I5)', () => {
    const { memory, rowKey } = memoryFor([sampleEntries[0]!]);

    expect(memory.rowMemory(rowKey)).toBe(memory.rowMemory(rowKey));
  });

  it('answers a row no frame planned with nothing, and allocates nothing to say so', () => {
    const { memory } = memoryFor([sampleEntries[0]!]);

    expect(memory.rowMemory('no-such-row').items).toEqual([]);
    expect(memory.rowMemory('no-such-row')).toBe(memory.rowMemory('no-other-row'));
  });
});
