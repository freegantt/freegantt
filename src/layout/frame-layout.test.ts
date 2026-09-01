import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { FrameLayout } from './frame-layout.js';
import { createItemProducerRegistry } from './items/produce-items.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { createTimeScale, dayPreset } from '../time/index.js';
import * as packLanes from './lanes/pack-lanes.js';
import type { Entry } from '../model/index.js';
import { changeSetId, entryId } from '../model/index.js';
import type { ChangeSet } from '../model/index.js';
import type { LayoutInput } from './frame.js';
import { PrefixSumHeightIndex } from './row-height-index.js';

// FrameLayout exists to keep ONE row-height index alive across a Gantt's renders (#47), so what has
// to be tested is how often it builds one. Counting constructions is the only observation of that:
// the index is private, exactly as it should be.
const built = vi.hoisted(() => ({ count: 0 }));
vi.mock('./row-height-index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./row-height-index.js')>();
  return {
    ...actual,
    PrefixSumHeightIndex: class extends actual.PrefixSumHeightIndex {
      constructor(count: number, getHeight: (index: number) => number) {
        built.count++;
        super(count, getHeight);
      }
    },
  };
});

const scale = createTimeScale({ timeZone: 'UTC', range: sampleEntries[0]!, pxPerMs: 1 / 1000 });
const preset = dayPreset;
const visible = { x: 0, y: 0, width: 0, height: 0 };
const itemProducerRegistry = createItemProducerRegistry();

function input(overrides: Partial<LayoutInput> = {}): LayoutInput {
  return {
    entries: sampleEntries,
    scale,
    preset,
    visible,
    rowHeight: 32,
    revision: 0,
    todayLine: false as const,
    itemProducerRegistry,
    ...overrides,
  };
}

function overlappingEntry(base: Entry, copies: number): Entry {
  const span = { start: base.start, end: base.end };
  return { ...base, segments: Array.from({ length: copies }, () => span) };
}

describe('FrameLayout', () => {
  it('builds the row-height index once and reuses it across renders', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input());
    layout.computeFrame(input());
    layout.computeFrame(input());

    expect(built.count).toBe(1);
  });

  it('rebuilds the index when the row height changes, and the frame follows the new height', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input());
    const taller = layout.computeFrame(input({ rowHeight: 50 }));

    expect(built.count).toBe(2);
    expect(taller.rows[1]?.top).toBe(50);
  });

  it('rebuilds the index when the row count changes, and the new rows are positioned', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input({ entries: sampleEntries.slice(0, 2) }));
    const grown = layout.computeFrame(input());

    expect(built.count).toBe(2);
    expect(grown.rows).toHaveLength(sampleEntries.length);
    expect(grown.rows[2]?.top).toBe(64);
  });

  it('produces exactly what computeFrame produces for the same input', () => {
    const layout = new FrameLayout();
    expect(layout.computeFrame(input())).toEqual(computeFrame(input()));
  });

  it('rowTop(index) matches the row top computeFrame reports for the same index', () => {
    const layout = new FrameLayout();
    const frame = layout.computeFrame(input());

    for (const [index, row] of frame.rows.entries()) {
      expect(layout.rowTop(index)).toBe(row.top);
    }
  });
});

describe('FrameLayout pack mode (S4.8, [S4-A5])', () => {
  const packRows = { source: 'entries' as const, heightMode: 'pack' as const };
  const laneGap = 2;

  it("a row's height follows its lane count; adding an overlap grows it and removing one shrinks it", () => {
    const layout = new FrameLayout();
    const one = overlappingEntry(sampleEntries[0]!, 1);
    const first = layout.computeFrame(input({ entries: [one], rows: packRows, laneGapPx: laneGap }));
    expect(first.rows[0]?.laneCount).toBe(1);
    expect(first.rows[0]?.height).toBe(32);

    const three = overlappingEntry(sampleEntries[0]!, 3);
    layout.invalidateFrom(0);
    const grown = layout.computeFrame(input({ entries: [three], rows: packRows, laneGapPx: laneGap }));
    expect(grown.rows[0]?.laneCount).toBe(3);
    expect(grown.rows[0]?.height).toBe(32 * 3 + 2 * laneGap);

    layout.invalidateFrom(0);
    const shrunk = layout.computeFrame(
      input({ entries: [overlappingEntry(sampleEntries[0]!, 2)], rows: packRows, laneGapPx: laneGap }),
    );
    expect(shrunk.rows[0]?.laneCount).toBe(2);
    expect(shrunk.rows[0]?.height).toBe(32 * 2 + laneGap);
  });

  it('packs a row once per revision, not once per read', () => {
    const spy = vi.spyOn(packLanes, 'packRow');
    const layout = new FrameLayout();
    const entries = [overlappingEntry(sampleEntries[0]!, 2), sampleEntries[1]!];
    const packInput = input({ entries, rows: packRows, laneGapPx: laneGap });

    layout.computeFrame(packInput);
    const firstCalls = spy.mock.calls.length;
    expect(firstCalls).toBe(entries.length);

    layout.computeFrame(packInput);
    expect(spy).toHaveBeenCalledTimes(firstCalls);
    spy.mockRestore();
  });

  it('invalidateFrom recomputes only the suffix; heightAt has a production caller', () => {
    const heightAt = vi.spyOn(PrefixSumHeightIndex.prototype, 'heightAt');
    const layout = new FrameLayout();
    const entries = [
      overlappingEntry(sampleEntries[0]!, 1),
      overlappingEntry(sampleEntries[1]!, 3),
      overlappingEntry(sampleEntries[2]!, 1),
    ];
    const packInput = input({ entries, rows: packRows, laneGapPx: laneGap });
    const first = layout.computeFrame(packInput);
    expect(first.rows[0]?.height).toBe(layout.rowTop(1) - layout.rowTop(0));
    expect(heightAt).toHaveBeenCalled();

    const packSpy = vi.spyOn(packLanes, 'packRow');
    packSpy.mockClear();
    layout.invalidateFrom(1);
    layout.computeFrame(packInput);
    const packedIds = packSpy.mock.calls.map((call) => call[0].map((item) => String(item.entryId)));
    expect(packedIds.some((ids) => ids.includes(String(sampleEntries[0]!.id)))).toBe(false);
    expect(packedIds.some((ids) => ids.includes(String(sampleEntries[1]!.id)))).toBe(true);
    heightAt.mockRestore();
    packSpy.mockRestore();
  });

  it('invalidateForChange walks from the lowest updated row, and from 0 on add/remove', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ rows: packRows }));
    const packSpy = vi.spyOn(packLanes, 'packRow');

    const update: ChangeSet = {
      id: changeSetId(1),
      origin: 'user',
      added: [],
      removed: [],
      updated: [
        {
          store: 'entries',
          id: entryId(String(sampleEntries[2]!.id)),
          field: 'name',
          from: 'a',
          to: 'b',
        },
      ],
    };
    layout.invalidateForChange(update);
    packSpy.mockClear();
    layout.computeFrame(input({ rows: packRows }));
    const afterUpdate = packSpy.mock.calls.length;
    expect(afterUpdate).toBeLessThan(sampleEntries.length);

    packSpy.mockClear();
    layout.invalidateForChange({
      id: changeSetId(2),
      origin: 'user',
      added: [{ store: 'entries', entity: sampleEntries[0]! }],
      removed: [],
      updated: [],
    });
    layout.computeFrame(input({ rows: packRows }));
    expect(packSpy.mock.calls.length).toBe(sampleEntries.length);
    packSpy.mockRestore();
  });
});
