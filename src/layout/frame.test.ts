import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { seededEntryInputs } from '../../fixtures/seeded-dataset.js';
import { createTimeScale, dayPreset, instant, formatDate, formatEndInclusive } from '../time/index.js';
import { entryId } from '../model/index.js';
import type { Entry } from '../model/index.js';

const scale = createTimeScale({ timeZone: 'UTC', range: sampleEntries[0]!, pxPerMs: 1 / 1000 });
const preset = dayPreset;
const visible = { x: 0, y: 0, width: 0, height: 0 };
const TIGHT = { verticalRows: 0, horizontalPx: 0 };

describe('computeFrame', () => {
  it('emits one row and one bar per entry, positioned by time (S0 scope)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.rows).toHaveLength(sampleEntries.length);
    expect(frame.bars).toHaveLength(sampleEntries.length);
    expect(frame.rows[0]?.top).toBe(0);
    expect(frame.rows[1]?.top).toBe(32);
  });

  it('carries the total dataset row count, not the windowed one (D-S1.10-5/7)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 64 }, // windows to two rows
      overscan: { verticalRows: 0, horizontalPx: 0 },
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.rows.length).toBeLessThan(sampleEntries.length);
    expect(frame.rowCount).toBe(sampleEntries.length);
  });

  it("composes FrameBar.a11yLabel from the entry's name and formatted span (D-S1.10-5)", () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    const entry = sampleEntries[1]!; // Stakeholder interviews
    const bar = frame.bars.find((b) => b.entryId === entry.id);
    expect(bar?.a11yLabel).toBe(
      `${entry.name}, ${formatDate(scale.timeZone, entry.start)} – ${formatEndInclusive(scale.timeZone, entry.end)}`,
    );
  });

  it('produces deterministic Item.id across repeated passes (I8)', () => {
    const first = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    const second = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 1,
    });
    expect(first.bars.map((b) => b.id)).toEqual(second.bars.map((b) => b.id));
    expect(new Set(first.bars.map((b) => b.id)).size).toBe(sampleEntries.length);
  });

  it('labels bars and rows with the entry name, not its id (#26)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars[0]?.label).toBe(sampleEntries[0]?.name);
    expect(frame.rows[0]?.label).toBe(sampleEntries[0]?.name);
  });

  it('culls rows outside the vertical window (#20), with overscan disabled', () => {
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 0, height: 32 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
    });
    expect(windowed.rows.map((r) => r.index)).toEqual([1]);
    // contentHeight still covers every row, from the height index — not just the windowed ones.
    expect(windowed.contentHeight).toBe(sampleEntries.length * 32);
  });

  it('expands the vertical window by verticalRows on both edges, in index space (default overscan)', () => {
    // Window covers row index 2 only (y=64, height=32); default verticalRows=2 buffers 2 rows each
    // side through the index, not through a fixed pixel amount.
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 64, width: 0, height: 32 },
      rowHeight: 32,
      revision: 0,
    });
    expect(windowed.rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours verticalRows through the index, not through pixels, when row heights vary', () => {
    const rowHeights = [100, 10, 10, 10, 10, 10];
    const heights = new PrefixSumHeightIndex(rowHeights.length, (i) => rowHeights[i]!);
    const entries = sampleEntries.slice(0, rowHeights.length);
    // Window covers row index 2 (top 110, height 10); verticalRows=1 buffers exactly one row of
    // whatever height it has on each side, not a fixed px amount.
    const windowed = computeFrame(
      {
        entries,
        scale,
        preset,
        visible: { x: 0, y: 110, width: 0, height: 10 },
        overscan: { verticalRows: 1, horizontalPx: 0 },
        rowHeight: 10,
        revision: 0,
      },
      heights,
    );
    expect(windowed.rows.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it('a zero height disables vertical culling entirely, even with a non-zero y', () => {
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 500, width: 0, height: 0 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
    });
    expect(windowed.rows).toHaveLength(sampleEntries.length);
  });

  it('contentHeight/contentWidth stay the full extent regardless of the window', () => {
    const full = computeFrame({ entries: sampleEntries, scale, preset, visible, rowHeight: 32, revision: 0 });
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 10, height: 32 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
    });
    expect(windowed.contentHeight).toBe(full.contentHeight);
    expect(windowed.contentWidth).toBe(full.contentWidth);
    expect(windowed.contentWidth).toBe(scale.contentWidth);
  });

  it('emits header ticks through the render seam, not around it (#19)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.header.bands).toHaveLength(1);
    expect(frame.header.bands[0]?.ticks.length).toBeGreaterThan(0);
    expect(frame.header.bands[0]?.ticks[0]).toHaveProperty('x');
    expect(frame.header.bands[0]?.ticks[0]).toHaveProperty('width');
    expect(frame.header.bands[0]?.ticks[0]).toHaveProperty('label');
  });

  it('emits one band per preset.headers entry, coarsest first', () => {
    const twoHeaderPreset = {
      ...preset,
      headers: [
        { unit: 'w' as const, increment: 1, format: () => 'w' },
        { unit: 'd' as const, increment: 1, format: () => 'd' },
      ],
    };
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset: twoHeaderPreset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.header.bands).toHaveLength(2);
    expect(frame.header.bands[0]?.unit).toBe('w');
    expect(frame.header.bands[1]?.unit).toBe('d');
    expect(frame.header.bands[0]?.ticks.length).toBeGreaterThan(0);
    expect(frame.header.bands[1]?.ticks.length).toBeGreaterThan(0);
  });

  it('accepts a caller-supplied RowHeightIndex and reads windowing off it (#47)', () => {
    const heights = new PrefixSumHeightIndex(sampleEntries.length, () => 32);
    const spy = vi.spyOn(heights, 'indexAtY');

    const windowed = computeFrame(
      {
        entries: sampleEntries,
        scale,
        preset,
        visible: { x: 0, y: 32, width: 0, height: 32 },
        overscan: TIGHT,
        rowHeight: 32,
        revision: 0,
      },
      heights,
    );

    expect(windowed.rows.map((r) => r.index)).toEqual([1]);
    expect(spy).toHaveBeenCalledWith(32);
  });

  it('matches the golden snapshot for the fixture dataset', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 3),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars).toMatchSnapshot();
  });

  it('I8 under scroll: the id set for the overlapping region is identical before and after a window move', () => {
    const before = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 64 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
    });
    const after = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 0, height: 64 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
    });
    // The overlap of [0, 64) and [32, 96) is [32, 64) — row index 1 only.
    const idsInOverlap = (frame: ReturnType<typeof computeFrame>): string[] =>
      frame.rows
        .filter((row) => row.top >= 32 && row.top < 64)
        .map((row) => frame.bars.find((bar) => bar.rowId === row.id)!.id);
    expect(idsInOverlap(before)).toEqual(idsInOverlap(after));
    expect(idsInOverlap(before)).toHaveLength(1);
  });
});

describe('computeFrame — horizontal culling', () => {
  // A trivial scale (range starts at instant 0, 1px/ms) so entry start/end can double as x pixels.
  const smallScale = createTimeScale({
    timeZone: 'UTC',
    range: { start: instant(0), end: instant(1000) },
    pxPerMs: 1,
  });

  function entryAt(id: string, x: number, width: number): Entry {
    return { id: entryId(id), name: id, start: instant(x), end: instant(x + width) };
  }

  const entries: Entry[] = [
    entryAt('outside-left', 0, 100), // [0, 100) — fully left of the window, even buffered
    entryAt('touches-left', 150, 50), // [150, 200) — touches the tight window's left edge
    entryAt('inside', 250, 10), // [250, 260) — fully inside
    entryAt('touches-right', 300, 50), // [300, 350) — touches the tight window's right edge
    entryAt('outside-right', 310, 90), // [310, 400) — right of the tight window, inside the buffered one
  ];

  it('emits only bars intersecting the window, plus horizontalPx, and every row regardless (D-B)', () => {
    const frame = computeFrame({
      entries,
      scale: smallScale,
      preset,
      visible: { x: 200, y: 0, width: 100, height: 0 }, // height 0: rows are never horizontally culled
      overscan: { verticalRows: 0, horizontalPx: 0 },
      rowHeight: 10,
      revision: 0,
    });
    expect(frame.rows).toHaveLength(entries.length);
    expect(frame.bars.map((b) => b.entryId)).toEqual([
      entryId('touches-left'),
      entryId('inside'),
      entryId('touches-right'),
    ]);
  });

  it('the horizontalPx buffer widens which bars intersect', () => {
    const frame = computeFrame({
      entries,
      scale: smallScale,
      preset,
      visible: { x: 200, y: 0, width: 100, height: 0 },
      overscan: { verticalRows: 0, horizontalPx: 110 },
      rowHeight: 10,
      revision: 0,
    });
    expect(frame.bars).toHaveLength(entries.length);
  });

  it('a zero width disables horizontal culling entirely', () => {
    const frame = computeFrame({
      entries,
      scale: smallScale,
      preset,
      visible: { x: 200, y: 0, width: 0, height: 0 },
      overscan: { verticalRows: 0, horizontalPx: 0 },
      rowHeight: 10,
      revision: 0,
    });
    expect(frame.bars).toHaveLength(entries.length);
  });
});

describe(
  'computeFrame — 5,000 entries (supporting test for [S1-A1], not the acceptance proof itself:' +
    ' the box says "in the DOM", proven by e2e/large-dataset.spec.ts)',
  () => {
    const large: Entry[] = seededEntryInputs({ count: 5000 }).map((input) => ({
      id: entryId(input.id),
      name: input.name,
      start: instant(input.start as Date),
      end: instant(input.end as Date),
    }));
    const largeScale = createTimeScale({ timeZone: 'UTC', range: large[0]!, pxPerMs: 1 / 100_000 });

    it('emits only windowed rows while contentHeight stays the full extent', () => {
      const frame = computeFrame({
        entries: large,
        scale: largeScale,
        preset,
        visible: { x: 0, y: 0, width: 800, height: 600 },
        overscan: { verticalRows: 2, horizontalPx: 128 },
        rowHeight: 32,
        revision: 0,
      });
      expect(frame.rows.length).toBeLessThan(large.length);
      expect(frame.rowCount).toBe(large.length);
      expect(frame.contentHeight).toBe(large.length * 32);
    });
  },
);
