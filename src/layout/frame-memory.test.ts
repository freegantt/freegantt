import { describe, expect, it, vi } from 'vitest';
import { FrameMemory } from './frame-memory.js';
import { createVariantRegistry } from './bars/variants.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import * as produceBars from './bars/produce-bars.js';
import { rowId } from '../model/index.js';
import type { RowId } from '../model/index.js';
import fc from 'fast-check';
import { entryDoubleLike } from './entry-double.js';
import type { PlannedRow } from './rows/row-source.js';
import type { RowHeightContext } from './row-height.js';
import type { LaneLayout } from './lane.js';
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
    const firstBars = memory.rowMemory(String(plan[0]!.id)).bars;
    expect(firstBars).toHaveLength(1);
    expect(firstBars[0]!.entryId).toBe(one.id);

    const moved = entryDoubleLike(one, {
      start: addMs(one.start!, 1000),
      end: addMs(one.end!, 1000),
    });
    memory.sync({ plan, rowHeight: 32, entries: [moved], registry, datasetRevision: 1 });

    const secondBars = memory.rowMemory(String(plan[0]!.id)).bars;
    expect(secondBars[0]!.start).toBe(moved.start);
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

describe('FrameMemory caches entryById by entries identity, not datasetRevision (#414)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });

  it('two frames over the same entries array share one Map', () => {
    const memory = new FrameMemory();
    const entries = [sampleEntries[0]!];
    const plan = planOf(entries);
    memory.sync({ plan, rowHeight: 32, entries, registry, datasetRevision: 0 });
    const firstMap = memory.entryById;
    memory.sync({ plan, rowHeight: 32, entries, registry, datasetRevision: 0 });
    expect(memory.entryById).toBe(firstMap);
  });

  it('a frame after a commit — a new entries array — paints the moved Entry, not the cached one', () => {
    const memory = new FrameMemory();
    const one = sampleEntries[0]!;
    const plan = planOf([one]);
    memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });
    expect(memory.entryById.get(one.id)).toBe(one);

    const moved = entryDoubleLike(one, {
      start: addMs(one.start!, 1000),
      end: addMs(one.end!, 1000),
    });
    memory.sync({ plan, rowHeight: 32, entries: [moved], registry, datasetRevision: 1 });
    expect(memory.entryById.get(one.id)).toBe(moved);
  });

  it(
    'a new entries array refreshes entryById even when datasetRevision stays the same — the shape a ' +
      'preview reaching placeFrame would need, guarded even though today no preview takes that path ' +
      '(GanttShell paints a preview through #backend.applyState, never through placeFrame)',
    () => {
      const memory = new FrameMemory();
      const one = sampleEntries[0]!;
      const plan = planOf([one]);
      memory.sync({ plan, rowHeight: 32, entries: [one], registry, datasetRevision: 0 });

      const previewed = entryDoubleLike(one, { start: addMs(one.start!, 1000) });
      memory.sync({ plan, rowHeight: 32, entries: [previewed], registry, datasetRevision: 0 });
      expect(memory.entryById.get(one.id)).toBe(previewed);
    },
  );
});

// Retired (ADR 0026, #421): this describe block used to be 'FrameMemory remembers the Segment sets
// beside the Bars' — `RowMemory.segmentIds`/`segmentIdsByBar` and
// `FrameMemory.segmentIdsOfEntries` named which Segment(s) each Bar stood for. A core Entry now
// always draws exactly one Bar over its own span, so there is no Segment set left to name, and
// `RowMemory` carries only `bars`. Two tests below still ask a real question about the cache
// itself and are kept, rewritten against `bars`.
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

    expect(memory.rowMemory('no-such-row').bars).toEqual([]);
    expect(memory.rowMemory('no-such-row')).toBe(memory.rowMemory('no-other-row'));
  });
});

describe('FrameMemory row height function (ADR 0044)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });
  const entries = sampleEntries.slice(0, 3);

  it('asks the function with the Row’s Entry, kind and depth', () => {
    const memory = new FrameMemory();
    const heightById = new Map(entries.map((entry, i) => [entry.id, 40 + i]));
    const rowHeightOf = vi.fn((ctx: RowHeightContext) => {
      expect(ctx.kind).toBe('entry');
      expect(ctx.depth).toBe(0);
      return heightById.get(ctx.entry!.id)!;
    });
    memory.sync({ plan: planOf(entries), rowHeight: 32, rowHeightOf, entries, registry, datasetRevision: 0 });
    expect(memory.heightOfRow(0)).toBe(40);
    expect(memory.heightOfRow(1)).toBe(41);
    expect(memory.heights.topAt(2)).toBe(81);
  });

  it('tells the function the default Row height', () => {
    const memory = new FrameMemory();
    const seen: number[] = [];
    memory.sync({
      plan: planOf(entries),
      rowHeight: 37,
      rowHeightOf: (ctx) => {
        seen.push(ctx.defaultHeight);
        return ctx.defaultHeight + 1;
      },
      entries,
      registry,
      datasetRevision: 0,
    });
    expect(memory.heightOfRow(0)).toBe(38);
    expect(new Set(seen)).toEqual(new Set([37]));
  });

  it('builds the height index again when the function changes', () => {
    const memory = new FrameMemory();
    const plan = planOf(entries);
    memory.sync({ plan, rowHeight: 32, rowHeightOf: () => 50, entries, registry, datasetRevision: 0 });
    expect(memory.heightOfRow(1)).toBe(50);
    memory.sync({ plan, rowHeight: 32, rowHeightOf: () => 60, entries, registry, datasetRevision: 0 });
    expect(memory.heightOfRow(1)).toBe(60);
  });

  it('builds the height index again when a new plan keeps the same row count', () => {
    const memory = new FrameMemory();
    const [a, b, c] = entries;
    const heightById = new Map([
      [a!.id, 100],
      [b!.id, 30],
      [c!.id, 30],
    ]);
    const rowHeightOf = (ctx: RowHeightContext): number => heightById.get(ctx.entry!.id)!;
    const bind = { rowHeight: 32, rowHeightOf, entries, registry, datasetRevision: 0 };
    memory.sync({ ...bind, plan: planOf([a!, b!, c!]) });
    expect(memory.heights.topAt(1)).toBe(100);
    memory.sync({ ...bind, plan: planOf([b!, c!, a!]) });
    expect(memory.heights.topAt(1)).toBe(30);
    expect(memory.heights.topAt(2)).toBe(60);
  });

  it('gives the default height for an answer that is not a positive number', () => {
    const memory = new FrameMemory();
    const answers = [0, Number.NaN, -4];
    let call = 0;
    memory.sync({
      plan: planOf(entries),
      rowHeight: 32,
      rowHeightOf: () => answers[call++]!,
      entries,
      registry,
      datasetRevision: 0,
    });
    expect([0, 1, 2].map((i) => memory.heightOfRow(i))).toEqual([32, 32, 32]);
  });
});

describe('FrameMemory lanes (ADR 0043)', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });
  const entries = sampleEntries.slice(0, 3);
  const geometry = { heightPx: 30, gapPx: 6, paddingPx: 10 };
  const lanesOf = (counts: number[]): LaneLayout => {
    const countById = new Map(entries.map((entry, i) => [entry.id, counts[i]!]));
    return { rule: { laneCount: ({ entry }) => countById.get(entry!.id)!, laneOf: () => 0 }, geometry };
  };

  it('sizes a row from its Lane count, and a row with none from rowHeight', () => {
    const memory = new FrameMemory();
    memory.sync({
      plan: planOf(entries),
      rowHeight: 32,
      lanes: lanesOf([1, 2, 0]),
      entries,
      registry,
      datasetRevision: 0,
    });
    expect([0, 1, 2].map((i) => memory.heightOfRow(i))).toEqual([50, 86, 32]);
  });

  it('keeps a Lane Row as tall as its Lanes when the default Row height is smaller', () => {
    const memory = new FrameMemory();
    memory.sync({
      plan: planOf(entries),
      rowHeight: 20,
      lanes: { rule: { laneCount: () => 2, laneOf: () => 0 }, geometry },
      entries,
      registry,
      datasetRevision: 0,
    });
    expect(memory.heightOfRow(0)).toBe(86);
  });

  it('keeps a Lane Row at the default Row height when that is taller than its Lanes', () => {
    const memory = new FrameMemory();
    memory.sync({
      plan: planOf(entries),
      rowHeight: 120,
      lanes: { rule: { laneCount: () => 2, laneOf: () => 0 }, geometry },
      entries,
      registry,
      datasetRevision: 0,
    });
    expect(memory.heightOfRow(0)).toBe(120);
  });

  it('tells the height function the Lane count and the Lane height', () => {
    const memory = new FrameMemory();
    const seen: [number, number | undefined][] = [];
    memory.sync({
      plan: planOf(entries),
      rowHeight: 32,
      rowHeightOf: (ctx) => {
        seen.push([ctx.laneCount, ctx.laneHeight]);
        return ctx.laneHeight ?? 48;
      },
      lanes: lanesOf([1, 2, 0]),
      entries,
      registry,
      datasetRevision: 0,
    });
    expect([0, 1, 2].map((i) => memory.heightOfRow(i))).toEqual([50, 86, 48]);
    expect(seen).toEqual([
      [1, 50],
      [2, 86],
      [0, undefined],
    ]);
  });

  it('centres the Lanes of a row the height function made taller', () => {
    const memory = new FrameMemory();
    memory.sync({
      plan: planOf(entries),
      rowHeight: 32,
      rowHeightOf: () => 100,
      lanes: lanesOf([1, 1, 1]),
      entries,
      registry,
      datasetRevision: 0,
    });
    expect(memory.lanesOfRow(0, 0, 100)).toEqual([{ top: 35, height: 30 }]);
  });

  it('builds the height index again when the Lane geometry changes', () => {
    const memory = new FrameMemory();
    const plan = planOf(entries);
    memory.sync({ plan, rowHeight: 32, lanes: lanesOf([1, 1, 1]), entries, registry, datasetRevision: 0 });
    expect(memory.heightOfRow(0)).toBe(50);
    const taller = { ...lanesOf([1, 1, 1]), geometry: { ...geometry, heightPx: 40 } };
    memory.sync({ plan, rowHeight: 32, lanes: taller, entries, registry, datasetRevision: 0 });
    expect(memory.heightOfRow(0)).toBe(60);
  });
});

describe('FrameMemory Row details', () => {
  const registry = createVariantRegistry({ fieldFor: () => undefined });
  const entries = sampleEntries.slice(0, 6);
  const plan = planOf(entries);
  const id = (index: number): RowId => plan[index]!.id;
  const detailsOf = (...pairs: [number, number][]) =>
    new Map<RowId, number>(pairs.map(([index, height]) => [id(index), height]));
  const bind = (rowDetailHeights?: ReadonlyMap<RowId, number>, datasetRevision = 0) => ({
    plan,
    rowHeight: 32,
    entries,
    registry,
    datasetRevision,
    ...(rowDetailHeights !== undefined ? { rowDetailHeights } : {}),
  });

  it('steps by the row plus its detail, and keeps the row own height', () => {
    const memory = new FrameMemory();
    memory.sync(bind(detailsOf([1, 100], [3, 40])));
    expect([0, 1, 2, 3, 4, 5].map((i) => memory.heights.topAt(i))).toEqual([0, 32, 164, 196, 268, 300]);
    expect(memory.heights.totalHeight).toBe(332);
    expect(memory.heightOfRow(1)).toBe(32);
    expect(memory.detailHeightOfRow(1)).toBe(100);
    expect(memory.detailHeightOfRow(0)).toBe(0);
  });

  it('finds the row at a y inside a detail', () => {
    const memory = new FrameMemory();
    memory.sync(bind(detailsOf([1, 100])));
    expect(memory.heights.indexAtY(32 + 31)).toBe(1);
    expect(memory.heights.indexAtY(32 + 32 + 99)).toBe(1);
    expect(memory.heights.indexAtY(32 + 132)).toBe(2);
  });

  it('ignores the detail of a row the plan does not hold', () => {
    const memory = new FrameMemory();
    memory.sync(bind(new Map([[rowId('collapsed-away'), 500]])));
    expect(memory.heights.totalHeight).toBe(6 * 32);
  });

  it('keeps the produced Bars when a detail changes', () => {
    const memory = new FrameMemory();
    memory.sync(bind(detailsOf([1, 100])));
    const before = memory.rowMemory(String(id(4)));
    const revision = memory.producedRevision;
    memory.sync(bind(detailsOf([1, 140])));
    expect(memory.rowMemory(String(id(4)))).toBe(before);
    expect(memory.producedRevision).toBe(revision);
    expect(memory.heights.topAt(2)).toBe(32 + 32 + 140);
  });

  it('bumps the height index revision for a detail change and for nothing else', () => {
    const memory = new FrameMemory();
    memory.sync(bind(detailsOf([1, 100])));
    const revision = memory.heightIndexRevision;
    memory.sync(bind(detailsOf([1, 100])));
    expect(memory.heightIndexRevision).toBe(revision);
    memory.sync(bind(new Map([[id(1), 100]])));
    expect(memory.heightIndexRevision).toBe(revision);
    memory.sync(bind(detailsOf([1, 101])));
    expect(memory.heightIndexRevision).toBe(revision + 1);
  });

  it('a detail change recomputes the rows from its own row down, not from row 0 (P1)', () => {
    const asked: number[] = [];
    const rowHeightOf = (context: { entry: { id: unknown } | undefined }) => {
      asked.push(entries.findIndex((entry) => entry.id === context.entry?.id));
      return 32;
    };
    const memory = new FrameMemory();
    memory.sync({ ...bind(detailsOf([4, 100])), rowHeightOf });
    expect(memory.heights.totalHeight).toBe(6 * 32 + 100);
    asked.length = 0;
    memory.sync({ ...bind(detailsOf([4, 160])), rowHeightOf });
    expect(memory.heights.totalHeight).toBe(6 * 32 + 160);
    expect([...new Set(asked)].sort()).toEqual([4, 5]);
  });

  it('a Gantt with no detail never reads the detail map (P2)', () => {
    const get = vi.fn();
    const empty = new Map<RowId, number>();
    empty.get = get;
    const memory = new FrameMemory();
    memory.sync(bind(empty));
    expect(memory.heights.totalHeight).toBe(6 * 32);
    expect(memory.detailHeightOfRow(2)).toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  it('closing the last detail takes the room back', () => {
    const memory = new FrameMemory();
    memory.sync(bind(detailsOf([1, 100])));
    memory.sync(bind(new Map()));
    expect(memory.heights.totalHeight).toBe(6 * 32);
  });

  it('property: tops are the running sum of row plus detail, and indexAtY inverts them', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 6, maxLength: 6 }),
        fc.integer({ min: 0, max: 2000 }),
        (details, y) => {
          const memory = new FrameMemory();
          memory.sync(bind(new Map(details.map((height, index) => [id(index), height]))));
          let top = 0;
          for (let i = 0; i < 6; i++) {
            expect(memory.heights.topAt(i)).toBe(top);
            top += 32 + details[i]!;
          }
          expect(memory.heights.totalHeight).toBe(top);
          const index = memory.heights.indexAtY(y);
          expect(memory.heights.topAt(index)).toBeLessThanOrEqual(Math.min(y, top));
          if (index < 5) expect(memory.heights.topAt(index + 1)).toBeGreaterThan(y);
        },
      ),
    );
  });
});
