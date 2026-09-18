import { describe, expect, it, vi } from 'vitest';
import { computeFrame, placeFrame, resolveLayoutRows, barSpan, DEFAULT_MIN_BAR_WIDTH_PX } from './frame.js';
import { mergeBarLabels } from './renderer.js';
import { FrameMemory } from './frame-memory.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import { createVariantRegistry } from './bars/variants.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { seededEntryInputs } from '../../fixtures/seeded-dataset.js';
import {
  createTimeScale,
  dayAndWeekPreset,
  dayPreset,
  hourPreset,
  instant,
  formatDate,
  formatEndInclusive,
  weekAndMonthPreset,
  weekPreset,
  yearPreset,
} from '../time/index.js';
import type { ViewPresetHeader } from '../time/index.js';
import type { DecorationContext } from './decoration.js';
import { entryId } from '../model/index.js';
import type { Entry, Instant, TimeSpan } from '../model/index.js';
import { entryDouble, entryDoubleLike, entryDoubles, entryValuesOf } from './entry-double.js';
import { entryBar, wholeEntryBar } from './bars/bar.js';
import type { FixedBarBox, Bar } from './bars/bar.js';

/** Every fixture entry this file reads is authored with both dates — this asserts what the
 *  fixture already guarantees, the same load-bearing-cast idiom `src/` itself uses (ADR 0012). */
function spanOf(entry: Entry): TimeSpan {
  return { start: entry.start as Instant, end: entry.end as Instant };
}

/** A full `Bar` for `barSpan`, built the same way `computeFrame` builds one (`wholeEntryBar`) —
 *  `barSpan` takes the whole `Bar`, box included (#295), so a test hands it a real one instead of
 *  a literal missing `box`. Pass `box` to build the fixed-box case `diamond()` ships. */
function barOf(entry: Entry, box?: FixedBarBox): Bar {
  const bar = wholeEntryBar(entry, 'bar');
  return box === undefined ? bar : { ...bar, box };
}

const scale = createTimeScale({ timeZone: 'UTC', range: spanOf(sampleEntries[0]!), pxPerMs: 1 / 1000 });
const preset = dayPreset;
const visible = { x: 0, y: 0, width: 0, height: 0 };
const TIGHT = { verticalRows: 0, horizontalPx: 0 };
const variantRegistry = createVariantRegistry({ fieldFor: () => undefined });

describe('computeFrame', () => {
  it('emits one row and one bar per entry, positioned by time (S0 scope)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(frame.rows).toHaveLength(sampleEntries.length);
    expect(frame.bars).toHaveLength(sampleEntries.length);
    expect(frame.rows[0]?.top).toBe(0);
    expect(frame.rows[1]?.top).toBe(32);
  });

  it('carries every Entry a custom row owns, not only the first (#185)', () => {
    const owned = sampleEntries.slice(0, 3);
    const frame = computeFrame({
      entries: owned,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      rows: {
        source: 'custom',
        resolve: () => [{ id: 'packed', entryIds: owned.map((entry) => String(entry.id)) }],
      },
    });

    expect(frame.rows).toHaveLength(1);
    expect(frame.rows[0]?.entryIds).toEqual(owned.map((entry) => entry.id));
  });

  it('a header row owns no Entry, so it is never selectable (D-S4-23, #185)', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 4),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      rows: { source: 'group', groupBy: () => 'all' },
    });

    const header = frame.rows.find((row) => row.kind === 'header');
    expect(header?.entryIds).toEqual([]);
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
      // No producer sets `Bar.label`; this stands in for `view/`'s default `barLabels` (#421 C5).
      barLabelFor: (entry) => entry.name,
    });
    const entry = sampleEntries[1]!; // Stakeholder interviews
    const bar = frame.bars.find((b) => b.entryId === entry.id);
    expect(bar?.a11yLabel).toBe(
      `${entry.name}, ${formatDate(scale.timeZone, entry.start as Instant)} – ${formatEndInclusive(scale.timeZone, spanOf(entry))}`,
    );
  });

  it('produces deterministic Bar.id across repeated passes (I8)', () => {
    const first = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    const second = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 1,
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
      barLabelFor: (entry) => entry.name,
    });
    expect(frame.bars[0]?.label).toBe(sampleEntries[0]?.name);
    expect(frame.rows[0]?.gridCells).toEqual([]);
    expect(frame.columns).toEqual([]);
  });

  it('lays out a bar with no label the same as a labelled one (#421 C5)', () => {
    // `barLabelFor: () => ''` is `view/`'s own answer once a merged policy names `'none'` or the
    // Entry has no name — layout never treats an empty label as a special case, so geometry alone
    // proves it: same x/y/width/height as the labelled frame just built above, label empty.
    const named = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      barLabelFor: (entry) => entry.name,
    });
    const unlabelled = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      barLabelFor: () => '',
    });
    expect(unlabelled.bars[0]?.label).toBe('');
    expect(unlabelled.bars.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }))).toEqual(
      named.bars.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height })),
    );
    // No leading ", " when the label is empty (`barA11yLabel`, #421 C5) — dates announce alone.
    expect(unlabelled.bars[0]?.a11yLabel.startsWith(',')).toBe(false);
    expect(unlabelled.bars[0]?.a11yLabel).not.toContain('undefined');
  });

  it('labels bars the same way across zoom levels — day, week, year (#421 C5)', () => {
    for (const preset of [dayPreset, weekPreset, yearPreset]) {
      const frame = computeFrame({
        entries: sampleEntries,
        scale,
        preset,
        visible,
        rowHeight: 32,
        revision: 0,
        datasetRevision: 0,
        variants: variantRegistry,
        barLabelFor: (entry) => entry.name,
      });
      expect(frame.bars[0]?.label).toBe(sampleEntries[0]?.name);
      expect(frame.bars[0]?.a11yLabel).not.toContain('undefined');
    }
  });

  it('fills each cell from the Field formatValue bound on the column (S4.3 §3)', () => {
    const nameField = {
      formatValue: (value: unknown) => `name:${String(value)}`,
    };
    const idField = {
      formatValue: (value: unknown) => `id:${String(value)}`,
    };
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      columns: [
        {
          field: 'name',
          header: 'Name',
          align: 'start',
          format: (entry) => nameField.formatValue(entry.name),
        },
        {
          field: 'id',
          header: 'Id',
          align: 'start',
          format: (entry) => idField.formatValue(entry.id),
        },
      ],
    });
    expect(frame.rows[0]?.gridCells).toEqual([
      nameField.formatValue(sampleEntries[0]!.name),
      idField.formatValue(sampleEntries[0]!.id),
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
      datasetRevision: 0,
      variants: variantRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (entry) => entry.name },
        { field: 'id', header: 'Id', align: 'start', format: (entry) => entry.id },
      ],
    });
    expect(frame.rows[0]?.gridCells).toEqual([sampleEntries[0]?.name, sampleEntries[0]?.id]);
    expect(frame.columns.map((c) => c.field)).toEqual(['name', 'id']);
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(windowed.rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('honours verticalRows through the index, not through pixels, when row heights vary', () => {
    const rowHeights = [100, 10, 10, 10, 10, 10];
    const entries = sampleEntries.slice(0, rowHeights.length);
    const input = {
      entries,
      scale,
      preset,
      visible: { x: 0, y: 110, width: 0, height: 10 },
      overscan: { verticalRows: 1, horizontalPx: 0 },
      rowHeight: 10,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    };
    const plan = resolveLayoutRows(input);
    const memory = new FrameMemory();
    memory.sync({
      plan,
      rowHeight: 10,
      entries,
      registry: variantRegistry,
      datasetRevision: 0,
      heightAt: (i) => rowHeights[i]!,
    });
    const windowed = placeFrame(input, plan, memory);
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
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(windowed.rows).toHaveLength(sampleEntries.length);
  });

  it('contentHeight/contentWidth stay the full extent regardless of the window', () => {
    const full = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 10, height: 32 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(frame.header.bands).toHaveLength(2);
    expect(frame.header.bands[0]?.unit).toBe('week');
    expect(frame.header.bands[1]?.unit).toBe('day');
    expect(frame.header.bands[0]?.ticks.length).toBeGreaterThan(0);
    expect(frame.header.bands[1]?.ticks.length).toBeGreaterThan(0);
  });

  it('windows through the live height index (#47)', () => {
    const spy = vi.spyOn(PrefixSumHeightIndex.prototype, 'indexAtY');

    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 0, height: 32 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });

    expect(windowed.rows.map((r) => r.index)).toEqual([1]);
    expect(spy).toHaveBeenCalledWith(32);
    spy.mockRestore();
  });

  it('matches the golden snapshot for the fixture dataset', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 3),
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      barLabelFor: (entry) => entry.name,
    });
    expect(frame.bars).toMatchSnapshot();
  });

  it('matches the golden snapshot for a segmented row — the child draws no row of its own (#421 F4, plans/segment-is-a-bar/README.md)', () => {
    const [parent, child] = entryDoubles([
      entryValuesOf(sampleEntries[0]!),
      entryValuesOf(sampleEntries[1]!, { parentId: String(sampleEntries[0]!.id) }),
    ]) as readonly [Entry, Entry];
    const frame = computeFrame({
      entries: [parent, child],
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      barLabelFor: (entry) => entry.name,
      rows: { source: 'entries', childrenAsSegments: true },
    });
    // One row for both — the segment child's id rides `entryIds[1]`, not a row of its own.
    expect(frame.rows).toHaveLength(1);
    expect(frame.rows[0]?.entryIds).toEqual([parent.id, child.id]);
    expect(
      frame.rows.map((row) => ({ id: row.id, depth: row.depth, entryIds: row.entryIds })),
    ).toMatchSnapshot();
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
      datasetRevision: 0,
      variants: variantRegistry,
    });
    const after = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 32, width: 0, height: 64 },
      overscan: TIGHT,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    // The overlap of [0, 64) and [32, 96) is [32, 64) — row index 1 only.
    const idsInOverlap = (frame: ReturnType<typeof computeFrame>): string[] =>
      frame.rows
        .filter((row) => row.top >= 32 && row.top < 64)
        .map((row) => frame.bars.find((bar) => bar.rowId === row.id)!.id);
    expect(idsInOverlap(before)).toEqual(idsInOverlap(after));
    expect(idsInOverlap(before)).toHaveLength(1);
  });

  it('I8: bar ids stay stable across a row-source switch', () => {
    const [parent, child] = entryDoubles([
      entryValuesOf(sampleEntries[0]!),
      entryValuesOf(sampleEntries[1]!, { parentId: String(sampleEntries[0]!.id) }),
    ]) as readonly [Entry, Entry];
    const entries = [parent, child, ...sampleEntries.slice(2, 5)];
    const base = {
      entries,
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    };
    const tree = computeFrame({ ...base, rows: { source: 'entries', tree: true } });
    const grouped = computeFrame({
      ...base,
      revision: 1,
      datasetRevision: 0,
      rows: { source: 'group', groupBy: () => 'all' },
    });
    const idsFor = (frame: ReturnType<typeof computeFrame>, id: typeof child.id) =>
      frame.bars.filter((bar) => String(bar.entryId) === String(id)).map((bar) => bar.id);
    expect(idsFor(tree, child.id)).toEqual(idsFor(grouped, child.id));
    expect(idsFor(tree, child.id)).toEqual([`${child.id}:0`]);
    expect(new Set(tree.bars.map((bar) => bar.id)).size).toBe(tree.bars.length);
    expect(new Set(grouped.bars.map((bar) => bar.id)).size).toBe(grouped.bars.length);
  });

  it("names a bar with several parts as 'part N of M' — only a plugin variant draws several now (#421, ADR 0026)", () => {
    const entry = entryDoubleLike(sampleEntries[0]!, {});
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addPluginVariant({
      name: 'phased',
      when: () => true,
      bars: (e, variant) => [
        entryBar(e, 0, sampleEntries[0]!.start!, sampleEntries[1]!.end!, variant),
        entryBar(e, 1, sampleEntries[1]!.end!, sampleEntries[2]!.end!, variant),
      ],
    });
    const frame = computeFrame({
      entries: [entry],
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: own,
      barLabelFor: (e) => e.name,
    });
    expect(frame.bars).toHaveLength(2);
    expect(frame.bars[0]?.a11yLabel).toMatch(/, part 1 of 2, /);
    expect(frame.bars[1]?.a11yLabel).toMatch(/, part 2 of 2, /);
  });

  it('a variant naming only policy never drops the Gantt field, through a real registry and a real merge (#421 C5)', () => {
    const entry = entryDouble({
      id: 'crew-day',
      start: sampleEntries[0]!.start!,
      end: sampleEntries[0]!.end!,
      props: { hours: 6 },
    });
    const own = createVariantRegistry({ fieldFor: () => undefined });
    own.addConsumerVariant({ name: 'outside-only', when: () => true, barLabels: { policy: 'outside' } });

    // `view/bar-labels.ts` runs this same call — `registry.resolveFor(entry).barLabels` merged over
    // the Gantt's own `barLabels` — before it ever reaches `formatValue`; asserting it here proves
    // the merge a real variant produces, not a literal `BarLabels` object.
    const merged = mergeBarLabels({ field: 'hours' }, own.resolveFor(entry).barLabels);
    expect(merged).toEqual({ field: 'hours', policy: 'outside' });

    const frame = computeFrame({
      entries: [entry],
      scale,
      preset,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: own,
      barLabelFor: (e) => String(e.read(merged.field)),
    });
    expect(frame.bars[0]?.label).toBe('6');
  });

  // Retired (ADR 0026, #421): 'carries the segmentId its Bar had, for a Segment bar, and none for a
  // whole-Entry bar' pinned `FrameBar.segmentId`, which no longer exists — a Bar's own id
  // (`${entryId}:${partIndex}`, `partIndexOfBar`) already answers which part it draws, so there is
  // no second id left to carry alongside it.
});

describe('computeFrame — horizontal culling', () => {
  // A trivial scale (range starts at instant 0, 1px/ms) so entry start/end can double as x pixels.
  const smallScale = createTimeScale({
    timeZone: 'UTC',
    range: { start: instant(0), end: instant(1000) },
    pxPerMs: 1,
  });

  function entryAt(id: string, x: number, width: number): Entry {
    return entryDouble({ id, start: x, end: x + width });
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
      todayLine: outside,
    });
    expect(frame.decorations).toEqual([]);
  });
});

describe('computeFrame — timeline grid lines (J2)', () => {
  // 2026-08-24 is a Monday; the window runs three ISO weeks to 2026-09-14 (also a Monday), so it
  // carries three week starts to check `major` against.
  const gridScale = createTimeScale({
    timeZone: 'UTC',
    range: { start: instant('2026-08-24T00:00:00Z'), end: instant('2026-09-14T00:00:00Z') },
    pxPerMs: 1 / (60 * 60 * 1000),
  });
  const gridEntries: readonly Entry[] = [
    entryDoubleLike(sampleEntries[0]!, {
      id: 'grid-1',
      start: instant('2026-08-24T00:00:00Z'),
      end: instant('2026-08-25T00:00:00Z'),
    }),
  ];
  const dayAndWeekHeaders = {
    ...preset,
    headers: [
      { unit: 'week' as const, increment: 1, format: () => 'w' },
      { unit: 'day' as const, increment: 1, format: () => 'd' },
    ],
  };

  it('marks the day tick a week also starts at, and nothing else, major', () => {
    const frame = computeFrame({
      entries: gridEntries,
      scale: gridScale,
      preset: dayAndWeekHeaders,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    const weekStartXs = new Set(frame.header.bands[0]!.ticks.map((tick) => tick.x));
    expect(frame.tickLines.length).toBe(frame.header.bands[1]!.ticks.length);
    for (const line of frame.tickLines) {
      expect(line.major).toBe(weekStartXs.has(line.x));
    }
    expect(frame.tickLines.some((line) => line.major)).toBe(true);
    expect(frame.tickLines.some((line) => !line.major)).toBe(true);
  });

  it('marks the week that holds the 1st major, when the month starts mid-week', () => {
    // 2026-09-01 is a Tuesday, so no week starts on it: an equality test between a week tick and a
    // month tick finds nothing here, and the grid stays flat (#265). The week of 2026-08-31 holds
    // the 1st, so that week's line carries September.
    const weekAndMonthHeaders = {
      ...preset,
      headers: [
        { unit: 'month' as const, increment: 1, format: () => 'M' },
        { unit: 'week' as const, increment: 1, format: () => 'w' },
      ],
    };
    const frame = computeFrame({
      entries: gridEntries,
      scale: gridScale,
      preset: weekAndMonthHeaders,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    const majors = frame.tickLines.filter((line) => line.major);
    expect(majors.length).toBe(1);
    expect(majors[0]!.x).toBe(gridScale.xForInstant(instant('2026-08-31T00:00:00Z')));
  });

  it('marks no line major when the range stays inside one coarser cell', () => {
    // monthAndYear over months of one calendar year: the coarser band is the year, and no year
    // starts inside this range. Zero strong lines is the honest answer at the coarsest preset.
    const monthAndYearHeaders = {
      ...preset,
      headers: [
        { unit: 'year' as const, increment: 1, format: () => 'y' },
        { unit: 'month' as const, increment: 1, format: () => 'M' },
      ],
    };
    const frame = computeFrame({
      entries: gridEntries,
      scale: gridScale,
      preset: monthAndYearHeaders,
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(frame.tickLines.length).toBeGreaterThan(0);
    expect(frame.tickLines.every((line) => !line.major)).toBe(true);
  });

  it('emits no line outside the content, so the overscan buffer cannot widen the pane', () => {
    const frame = computeFrame({
      entries: gridEntries,
      scale: gridScale,
      preset: dayAndWeekHeaders,
      // Parked at the right edge, where the overscan buffer reaches past the content extent.
      visible: { x: gridScale.contentWidth - 200, y: 0, width: 200, height: 400 },
      overscan: { verticalRows: 0, horizontalPx: 300 },
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(frame.tickLines.length).toBeGreaterThan(0);
    for (const line of frame.tickLines) {
      expect(line.x).toBeGreaterThanOrEqual(0);
      expect(line.x).toBeLessThan(gridScale.contentWidth);
    }
  });

  it('marks no line major on a single-band preset — no coarser band to align to', () => {
    const frame = computeFrame({
      entries: gridEntries,
      scale: gridScale,
      preset: { ...preset, headers: [{ unit: 'day', increment: 1, format: () => 'd' }] },
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
    });
    expect(frame.tickLines.length).toBeGreaterThan(0);
    expect(frame.tickLines.every((line) => !line.major)).toBe(true);
  });
});

describe('computeFrame — the tick step a decoration provider reads', () => {
  function tickStepSeenBy(headers: ViewPresetHeader[]): { unit: string; increment: number } {
    let seen: DecorationContext | undefined;
    computeFrame({
      entries: sampleEntries,
      scale,
      preset: { ...preset, headers },
      visible,
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: variantRegistry,
      decorationProviders: [
        {
          layer: 'underBars',
          provider: (ctx) => {
            seen = ctx;
            return [];
          },
        },
      ],
    });
    return { unit: seen!.tickUnit, increment: seen!.tickIncrement };
  }

  it('states the finest (last) header band, not the coarsest', () => {
    expect(tickStepSeenBy([...weekAndMonthPreset.headers])).toEqual({ unit: 'week', increment: 1 });
    expect(tickStepSeenBy([...dayAndWeekPreset.headers])).toEqual({ unit: 'day', increment: 1 });
  });

  it("falls back to the preset's own tick step when it carries no header band", () => {
    expect(tickStepSeenBy([])).toEqual({ unit: preset.tickUnit, increment: preset.tickIncrement });
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
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
    const large: readonly Entry[] = entryDoubles(
      seededEntryInputs({ count: 5000 }).map((input) => ({
        id: input.id,
        ...(input.name !== undefined ? { name: input.name } : {}),
        start: instant(input.start as Date),
        end: instant(input.end as Date),
      })),
    );
    const largeScale = createTimeScale({ timeZone: 'UTC', range: spanOf(large[0]!), pxPerMs: 1 / 100_000 });

    it('emits only windowed rows while contentHeight stays the full extent', () => {
      const frame = computeFrame({
        entries: large,
        scale: largeScale,
        preset,
        visible: { x: 0, y: 0, width: 800, height: 600 },
        overscan: { verticalRows: 2, horizontalPx: 128 },
        rowHeight: 32,
        revision: 0,
        datasetRevision: 0,
        variants: variantRegistry,
      });
      expect(frame.rows.length).toBeLessThan(large.length);
      expect(frame.rowCount).toBe(large.length);
      expect(frame.contentHeight).toBe(large.length * 32);
    });
  },
);

describe('computeFrame row sources (S4.6)', () => {
  it('rowCount counts resolved rows, not entries, and collapse shrinks the plan', () => {
    const [parent, child] = entryDoubles([
      entryValuesOf(sampleEntries[0]!),
      entryValuesOf(sampleEntries[1]!, { parentId: String(sampleEntries[0]!.id) }),
    ]) as readonly [Entry, Entry];
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
      datasetRevision: 0,
      variants: variantRegistry,
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
      datasetRevision: 0,
      variants: variantRegistry,
      rows: { source: 'entries', tree: true },
      collapsed: [parent.id],
    });
    expect(collapsed.rowCount).toBe(entries.length - 1);
    expect(collapsed.rows.some((r) => String(r.id) === String(child.id))).toBe(false);
  });
});

describe('barSpan — a minimum painted bar width (#212 follow-up: a zero-width bar is unclickable)', () => {
  it('floors a zero-width span at minBarWidthPx and stamps span: minimum', () => {
    const zeroWidthSpan = entryDoubleLike(sampleEntries[0]!, { end: sampleEntries[0]!.start! });
    const { x, width, span } = barSpan(barOf(zeroWidthSpan), scale);
    expect(width).toBe(DEFAULT_MIN_BAR_WIDTH_PX);
    expect(span).toBe('minimum');
    expect(x + width / 2).toBe(scale.xForInstant(zeroWidthSpan.start as Instant));
  });

  it('honours a custom minBarWidthPx', () => {
    const zeroWidthSpan = entryDoubleLike(sampleEntries[0]!, { end: sampleEntries[0]!.start! });
    const { width } = barSpan(barOf(zeroWidthSpan), scale, 40);
    expect(width).toBe(40);
  });

  it('centres a floored, non-zero-width bar on its own midpoint, not on its start', () => {
    // 5px wide at this scale: narrow enough to floor, wide enough that a start-centred box would
    // slide the bar 2.5px left of where it belongs.
    const startX = scale.xForInstant(sampleEntries[0]!.start as Instant);
    const narrowSpan = entryDoubleLike(sampleEntries[0]!, { end: scale.instantForX(startX + 5) });
    const { x, width, span } = barSpan(barOf(narrowSpan), scale);
    expect(width).toBe(DEFAULT_MIN_BAR_WIDTH_PX);
    expect(span).toBe('minimum');
    expect(x + width / 2).toBe(startX + 2.5);
  });

  it('leaves an ordinary bar wide enough already unfloored, with span: exact', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x, width, span } = barSpan(barOf(wideSpan), scale);
    expect(width).toBe(
      scale.xForInstant(wideSpan.end as Instant) - scale.xForInstant(wideSpan.start as Instant),
    );
    expect(width).toBeGreaterThan(DEFAULT_MIN_BAR_WIDTH_PX);
    expect(x).toBe(scale.xForInstant(wideSpan.start as Instant));
    expect(span).toBe('exact');
  });
});

describe('barSpan — a fixed painted box the time scale does not size (ADR 0022)', () => {
  it('keeps its own width regardless of the entry span, and stamps span: fixed', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { width, span } = barSpan(barOf(wideSpan, { widthPx: 13, anchor: 'center' }), scale);
    expect(width).toBe(13);
    expect(span).toBe('fixed');
  });

  it('keeps its width when the scale changes zoom', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const zoomedOut = createTimeScale({
      timeZone: 'UTC',
      range: spanOf(sampleEntries[0]!),
      pxPerMs: 1 / 5000,
    });
    const atDefaultZoom = barSpan(barOf(wideSpan, { widthPx: 13, anchor: 'center' }), scale);
    const atOtherZoom = barSpan(barOf(wideSpan, { widthPx: 13, anchor: 'center' }), zoomedOut);
    expect(atDefaultZoom.width).toBe(13);
    expect(atOtherZoom.width).toBe(13);
  });

  it('centres on the span’s own midpoint for anchor: center — the same midpoint a floored bar centres on', () => {
    const zeroWidthSpan = entryDoubleLike(sampleEntries[0]!, { end: sampleEntries[0]!.start! });
    const { x, width } = barSpan(barOf(zeroWidthSpan, { widthPx: 13, anchor: 'center' }), scale);
    expect(x + width / 2).toBe(scale.xForInstant(zeroWidthSpan.start as Instant));
  });

  it('aligns its left edge to the span’s start for anchor: start', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x } = barSpan(barOf(wideSpan, { widthPx: 13, anchor: 'start' }), scale);
    expect(x).toBe(scale.xForInstant(wideSpan.start as Instant));
  });

  it('aligns its right edge to the span’s end for anchor: end', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x, width } = barSpan(barOf(wideSpan, { widthPx: 13, anchor: 'end' }), scale);
    expect(x + width).toBe(scale.xForInstant(wideSpan.end as Instant));
  });

  it('clamps a negative widthPx to 0, so a fixed box never paints a negative width (#212 follow-up, F6)', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x, width, span } = barSpan(barOf(wideSpan, { widthPx: -4, anchor: 'center' }), scale);
    expect(width).toBe(0);
    expect(span).toBe('fixed');
    // The clamped width, not the raw -4, positions the box — a collapsed box sits where a 0px box
    // would, not displaced by half the negative width it never paints (#296).
    const end = scale.xForInstant(wideSpan.end as Instant);
    const startX = scale.xForInstant(wideSpan.start as Instant);
    expect(x).toBe((startX + end) / 2);
  });

  it('clamps a negative widthPx before positioning for anchor: end, not after (#296)', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x, width } = barSpan(barOf(wideSpan, { widthPx: -4, anchor: 'end' }), scale);
    expect(width).toBe(0);
    expect(x).toBe(scale.xForInstant(wideSpan.end as Instant));
  });

  it('clamps a negative widthPx before positioning for anchor: start, not after (#296)', () => {
    const wideSpan: Entry = sampleEntries[0]!;
    const { x, width } = barSpan(barOf(wideSpan, { widthPx: -4, anchor: 'start' }), scale);
    expect(width).toBe(0);
    expect(x).toBe(scale.xForInstant(wideSpan.start as Instant));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'clamps a non-finite widthPx (%s) to 0 rather than propagating it (#297)',
    (widthPx) => {
      const wideSpan: Entry = sampleEntries[0]!;
      const { x, width, span } = barSpan(barOf(wideSpan, { widthPx, anchor: 'center' }), scale);
      expect(width).toBe(0);
      expect(span).toBe('fixed');
      const end = scale.xForInstant(wideSpan.end as Instant);
      const startX = scale.xForInstant(wideSpan.start as Instant);
      expect(x).toBe((startX + end) / 2);
    },
  );
});
