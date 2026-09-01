import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { seededEntryInputs } from '../../fixtures/seeded-dataset.js';
import {
  createTimeScale,
  dayPreset,
  hourPreset,
  instant,
  formatDate,
  formatEndInclusive,
} from '../time/index.js';
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

  it('labels bars with the entry name, not its id (#26)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars[0]?.label).toBe(sampleEntries[0]?.name);
    expect(frame.rows[0]?.cells).toEqual([]);
    expect(frame.columns).toEqual([]);
  });

  it('fills each cell from the Field formatValue bound on the column (S4.3 §3)', () => {
    const nameField = {
      formatValue: (value: unknown) => `name:${String(value)}`,
    };
    const kindField = {
      formatValue: (value: unknown) => `kind:${String(value)}`,
    };
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      columns: [
        {
          key: 'name',
          header: 'Name',
          align: 'start',
          format: (entry) => nameField.formatValue(entry.name),
        },
        {
          key: 'kind',
          header: 'Kind',
          align: 'start',
          format: (entry) => kindField.formatValue(entry.kind),
        },
      ],
    });
    expect(frame.rows[0]?.cells).toEqual([
      nameField.formatValue(sampleEntries[0]!.name),
      kindField.formatValue(sampleEntries[0]!.kind),
    ]);
  });

  it('fills cells from LayoutInput.columns in column order (D-S4-13)', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      columns: [
        { key: 'name', header: 'Name', align: 'start', format: (entry) => entry.name },
        { key: 'kind', header: 'Kind', align: 'start', format: (entry) => entry.kind },
      ],
    });
    expect(frame.rows[0]?.cells).toEqual([sampleEntries[0]?.name, sampleEntries[0]?.kind]);
    expect(frame.columns.map((c) => c.key)).toEqual(['name', 'kind']);
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
        { unit: 'week' as const, increment: 1, format: () => 'w' },
        { unit: 'day' as const, increment: 1, format: () => 'd' },
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
    expect(frame.header.bands[0]?.unit).toBe('week');
    expect(frame.header.bands[1]?.unit).toBe('day');
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

  it('I8: item ids stay stable across a row-source switch', () => {
    const parent = sampleEntries[0]!;
    const child = { ...sampleEntries[1]!, parentId: parent.id };
    const entries = [parent, child, ...sampleEntries.slice(2, 5)];
    const base = {
      entries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    };
    const tree = computeFrame({ ...base, rows: { source: 'entries', tree: true } });
    const grouped = computeFrame({
      ...base,
      revision: 1,
      rows: { source: 'group', groupBy: (entry) => entry.kind },
    });
    const idsFor = (frame: ReturnType<typeof computeFrame>, id: typeof child.id) =>
      frame.bars.filter((bar) => String(bar.entryId) === String(id)).map((bar) => bar.id);
    expect(idsFor(tree, child.id)).toEqual(idsFor(grouped, child.id));
    expect(idsFor(tree, child.id)).toEqual([`${child.id}:0`]);
    expect(new Set(tree.bars.map((bar) => bar.id)).size).toBe(tree.bars.length);
    expect(new Set(grouped.bars.map((bar) => bar.id)).size).toBe(grouped.bars.length);
  });

  it("names a segmented bar as 'part N of M'", () => {
    const entry = {
      ...sampleEntries[0]!,
      segments: [
        { start: sampleEntries[0]!.start, end: sampleEntries[1]!.end },
        { start: sampleEntries[1]!.end, end: sampleEntries[2]!.end },
      ],
    };
    const frame = computeFrame({
      entries: [entry],
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars).toHaveLength(2);
    expect(frame.bars[0]?.a11yLabel).toMatch(/, part 1 of 2, /);
    expect(frame.bars[1]?.a11yLabel).toMatch(/, part 2 of 2, /);
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
    return { id: entryId(id), name: id, start: instant(x), end: instant(x + width), kind: 'span' };
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

describe('computeFrame — Date lines (S1.13)', () => {
  it('carries a DateLine decoration with className when dateLines supplies one', () => {
    const placeAt = instant('2026-09-02T00:00:00Z'); // inside sampleEntries[0]'s range
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      todayLine: false,
      dateLines: [{ placeAt, label: 'Ship', className: 'fg-deadline-line' }],
    });
    expect(frame.decorations).toEqual([
      { kind: 'dateLine', x: scale.xForInstant(placeAt), label: 'Ship', className: 'fg-deadline-line' },
    ]);
  });

  it('emits nothing for a pinned todayLine Instant outside scale.range, same as the boolean form', () => {
    const outside = instant('2020-01-01T00:00:00Z'); // well before sampleEntries[0]'s range
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      todayLine: outside,
    });
    expect(frame.decorations).toEqual([]);
  });
});

describe('computeFrame — sticky label clamp (finding 3, header readability follow-up)', () => {
  // range.start is instant(0) (the UTC epoch, itself an hour boundary) with pxPerMs = 1/60000 (one
  // px per minute), so every hour tick is exactly 60px wide and a tick's x is just its instant in
  // minutes-since-epoch — easy to hand-verify against the clamp math in frame.ts.
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const hourScale = createTimeScale({
    timeZone: 'UTC',
    range: { start: instant(0), end: instant(24 * hourMs) },
    pxPerMs: 1 / minuteMs,
  });
  // visible.x = 130 puts the clamp line (labelLeftClamp = max(visible.x, 0)) at x=130. With
  // horizontalPx: 200 buffering the tick scan, the ticks at x=-120,-60,0,60 are pulled in by
  // overscan but sit fully left of 130 (fully behind); the tick at x=120 (width 60) straddles
  // 130 — its cell spans the clamp line, so it alone gets stuck to the visible edge.
  const visible = { x: 130, y: 0, width: 200, height: 0 };
  const overscan = { verticalRows: 0, horizontalPx: 200 };

  it('sticks only the straddling tick to the visible edge, leaving ticks fully behind it unclamped', () => {
    const frame = computeFrame({
      entries: [],
      scale: hourScale,
      preset: hourPreset,
      visible,
      overscan,
      rowHeight: 32,
      revision: 0,
    });
    const ticks = frame.header.bands[0]!.ticks;

    // Fully behind the clamp line (tick.x + tick.width <= 130): true x untouched.
    const farBehind = ticks.find((t) => t.x === -120);
    const behind = ticks.find((t) => t.x === 60);
    expect(farBehind).toMatchObject({ x: -120, width: 60 });
    expect(behind).toMatchObject({ x: 60, width: 60 });

    // Straddles the clamp line (tick.x=120 < 130 < tick.x+width=180): x clamped to 130, width
    // reduced by the same 10px shift — never the original tick.x=120.
    const straddling = ticks.find((t) => t.width === 50);
    expect(straddling).toMatchObject({ x: 130, width: 50 });
    expect(ticks.some((t) => t.x === 120)).toBe(false);

    // width never goes negative even where a tick's cell is clamped away almost entirely.
    for (const tick of ticks) expect(tick.width).toBeGreaterThanOrEqual(0);
  });

  it('does not stick a straddle thinner than the Tick box floor', () => {
    const frame = computeFrame({
      entries: [],
      scale: hourScale,
      preset: hourPreset,
      visible: { x: 172, y: 0, width: 200, height: 0 },
      overscan,
      rowHeight: 32,
      revision: 0,
    });
    const ticks = frame.header.bands[0]!.ticks;
    // Tick at 120 has remainder 8 (< shipped floor 9) — keeps true x.
    expect(ticks.find((t) => t.x === 120)).toMatchObject({ x: 120, width: 60 });
    expect(ticks.some((t) => t.x === 172)).toBe(false);
  });

  it('sticks a straddle that meets the Tick box floor', () => {
    const frame = computeFrame({
      entries: [],
      scale: hourScale,
      preset: hourPreset,
      visible: { x: 171, y: 0, width: 200, height: 0 },
      overscan,
      rowHeight: 32,
      revision: 0,
    });
    const ticks = frame.header.bands[0]!.ticks;
    expect(ticks.find((t) => t.width === 9)).toMatchObject({ x: 171, width: 9 });
    expect(ticks.some((t) => t.x === 120)).toBe(false);
  });

  it('takes tickBoxFloorPx from the caller instead of restating the stylesheet', () => {
    const input = {
      entries: [],
      scale: hourScale,
      preset: hourPreset,
      visible,
      overscan,
      rowHeight: 32,
      revision: 0,
    };
    const atDefault = computeFrame(input);
    expect(atDefault.header.bands[0]!.ticks.find((t) => t.width === 50)).toMatchObject({ x: 130, width: 50 });

    const aboveRemainder = computeFrame({ ...input, tickBoxFloorPx: 51 });
    expect(aboveRemainder.header.bands[0]!.ticks.find((t) => t.x === 120)).toMatchObject({
      x: 120,
      width: 60,
    });
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
      kind: 'span',
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

describe('computeFrame row sources (S4.6)', () => {
  it('rowCount counts resolved rows, not entries, and collapse shrinks the plan', () => {
    const parent = sampleEntries[0]!;
    const child = { ...sampleEntries[1]!, parentId: parent.id };
    const rest = sampleEntries.slice(2);
    const entries = [parent, child, ...rest];
    const tree = computeFrame({
      entries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 64 },
      overscan: { verticalRows: 0, horizontalPx: 0 },
      rowHeight: 32,
      revision: 0,
      rows: { source: 'entries', tree: true },
    });
    expect(tree.rowCount).toBe(entries.length);
    expect(tree.rows.length).toBeLessThan(tree.rowCount);
    expect(tree.rows[0]?.depth).toBe(0);
    expect(tree.rows[0]?.expandable).toBe(true);

    const collapsed = computeFrame({
      entries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      rows: { source: 'entries', tree: true },
      collapsed: [parent.id],
    });
    expect(collapsed.rowCount).toBe(entries.length - 1);
    expect(collapsed.rows.some((r) => String(r.id) === String(child.id))).toBe(false);
  });
});
