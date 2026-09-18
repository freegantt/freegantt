import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { FrameLayout } from './frame-layout.js';
import { createVariantRegistry } from './items/variants.js';
import { fixedWidthBar } from './items/item.js';
import { sampleEntries, sampleStoredEntries } from '../../fixtures/sample-dataset.js';
import { createTimeScale, dayPreset } from '../time/index.js';
import * as resolveRowsMod from './rows/resolve-rows.js';
import * as produceBars from './items/produce-items.js';
import type { Entry, EntryId } from '../model/index.js';
import type { EntryDoubleValues } from './entry-double.js';
import { entryDouble, entryDoubles } from './entry-double.js';
import { changeSetId, entryId, barId, rowId, segmentId } from '../model/index.js';
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

// Load-bearing non-null assertion (ADR 0012): every fixture entry this file reads is authored
// with both dates.
const scale = createTimeScale({
  timeZone: 'UTC',
  range: { start: sampleEntries[0]!.start!, end: sampleEntries[0]!.end! },
  pxPerMs: 1 / 1000,
});
const preset = dayPreset;
const visible = { x: 0, y: 0, width: 0, height: 0 };
const variantRegistry = createVariantRegistry({ fieldFor: () => undefined });

function input(overrides: Partial<LayoutInput> = {}): LayoutInput {
  return {
    entries: sampleEntries,
    scale,
    preset,
    visible,
    rowHeight: 32,
    revision: 0,
    // A stable value, so repeated calls with the same `input()` object cache instead of
    // rebuilding every read (#243) — an omitted `datasetRevision` now invalidates every call.
    datasetRevision: 0,
    todayLine: false as const,
    variants: variantRegistry,
    ...overrides,
  };
}

function overlappingValues(base: Entry, copies: number, parentId?: EntryId): EntryDoubleValues {
  // Load-bearing non-null assertion (ADR 0012): every fixture entry this file feeds it is
  // authored with both dates.
  const start = base.start!;
  const end = base.end!;
  return {
    id: String(base.id),
    ...(base.name !== undefined ? { name: base.name } : {}),
    start,
    end,
    ...(parentId !== undefined ? { parentId: String(parentId) } : {}),
    segments: Array.from({ length: copies }, (_, index) => ({
      id: segmentId(`${base.id}-${index}`),
      start,
      end,
    })),
  };
}

/** A row this file states by hand — the live `Entry` a layout call takes, never a spread of one
 *  (ADR 0017, finding P2: a spread drops every getter and every method). */
function overlappingEntry(base: Entry, copies: number): Entry {
  return entryDouble(overlappingValues(base, copies));
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

  it('resolves the row plan once per pass', () => {
    const spy = vi.spyOn(resolveRowsMod, 'resolveOpenRows');
    const layout = new FrameLayout();
    spy.mockClear();
    layout.computeFrame(input());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('rowTop(index) matches the row top computeFrame reports for the same index', () => {
    const layout = new FrameLayout();
    const frame = layout.computeFrame(input());

    for (const [index, row] of frame.rows.entries()) {
      expect(layout.rowTop(index)).toBe(row.top);
    }
  });

  it('barIdsForEntry answers every bar a segmented entry draws (#185)', () => {
    const layout = new FrameLayout();
    const segmented = overlappingEntry(sampleEntries[0]!, 3);
    const frame = layout.computeFrame(input({ entries: [segmented] }));

    expect(layout.barIdsForEntry(segmented.id)).toEqual(frame.bars.map((bar) => bar.id));
    expect(layout.barIdsForEntry(segmented.id)).toHaveLength(3);
  });

  it('barIdsForEntry answers a plugin variant that draws its own Bars (#185)', () => {
    // A producer is free to name its Bars — nothing here parses `${entryId}:${segmentIndex}`.
    const variant = 'twin';
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addPluginVariant({
      name: variant,
      when: () => true,
      bars: (entry) => [
        {
          id: barId(entry.id, 7),
          entryId: entry.id,
          variant,
          label: entry.name ?? '',
          start: entry.start!,
          end: entry.end!,
        },
        {
          id: barId(entry.id, 9),
          entryId: entry.id,
          variant,
          label: entry.name ?? '',
          start: entry.start!,
          end: entry.end!,
        },
      ],
    });
    const entry: Entry = sampleEntries[0]!;
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [entry], variants: registry }));

    expect(layout.barIdsForEntry(entry.id)).toEqual([barId(entry.id, 7), barId(entry.id, 9)]);
  });

  it('barIdsForEntry answers empty for an entry no row carries (#185)', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [sampleEntries[0]!] }));

    expect(layout.barIdsForEntry(sampleEntries[1]!.id)).toEqual([]);
  });

  it('barsForEntry answers the full Bar, box included, not just its id (#295)', () => {
    const px = 13;
    const variant = 'diamond';
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addPluginVariant({
      name: variant,
      when: () => true,
      bars: fixedWidthBar(px),
    });
    const entry: Entry = sampleEntries[0]!;
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [entry], variants: registry }));

    const items = layout.barsForEntry(entry.id);
    expect(items).toHaveLength(1);
    expect(items[0]?.box).toEqual({ widthPx: px, anchor: 'center' });
  });

  it('segmentIdsForBar names the one Segment a Segment bar drew (#212)', () => {
    const layout = new FrameLayout();
    const segmented = overlappingEntry(sampleEntries[0]!, 3);
    const frame = layout.computeFrame(input({ entries: [segmented] }));

    expect(frame.bars.map((bar) => layout.segmentIdsForBar(bar.id))).toEqual(
      segmented.segments.map((segment) => [segment.id]),
    );
  });

  it('segmentIdsForBar names every Segment of the Entry for a whole-entry variant (#212)', () => {
    // A whole-entry variant (a parent, a milestone) draws one bar over the whole Entry, so it drew
    // no single Segment. It still stands for all of them: a click on it selects the Entry's work.
    const registry = createVariantRegistry({ fieldFor: () => undefined });
    registry.addPluginVariant({
      name: 'milestone',
      when: () => true,
      bars: (entry) => [
        {
          id: barId(entry.id, 0),
          entryId: entry.id,
          variant: 'milestone',
          label: entry.name ?? '',
          start: entry.start!,
          end: entry.end!,
        },
      ],
    });
    const layout = new FrameLayout();
    const wholeSpan = overlappingEntry(sampleEntries[0]!, 2);
    const frame = layout.computeFrame(input({ entries: [wholeSpan], variants: registry }));

    expect(frame.bars).toHaveLength(1);
    expect(frame.bars[0]!.segmentId).toBeUndefined();
    expect(layout.segmentIdsForBar(frame.bars[0]!.id)).toEqual(
      wholeSpan.segments.map((segment) => segment.id),
    );
  });

  it('segmentIdsForBar answers empty for a Bar no current frame planned (#212)', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [sampleEntries[0]!] }));

    expect(layout.segmentIdsForBar(barId(sampleEntries[1]!.id, 0))).toEqual([]);
    expect(layout.segmentIdsForBar(barId(sampleEntries[0]!.id, 4))).toEqual([]);
  });

  it('segmentIdsForRow names every Segment of every Entry the row owns, in row order (#199, #212)', () => {
    // Only a custom row source can put several Entries on one Row, which is the shape this answers.
    const owned = sampleEntries.slice(0, 3).map((entry) => overlappingEntry(entry, 2));
    const oneRowForAll: LayoutInput['rows'] = {
      source: 'custom',
      resolve: ({ entries }) => [{ id: 'lane-1', entryIds: entries.map((entry) => entry.id) }],
    };
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: owned, rows: oneRowForAll }));

    expect(layout.segmentIdsForRow(rowId('lane-1'))).toEqual(
      owned.flatMap((entry) => entry.segments.map((segment) => segment.id)),
    );
    expect(layout.segmentIdsForRow(rowId('no-such-row'))).toEqual([]);
  });

  it('a row collapse hid still names its Segments, exactly as it still names its Entries (#230 R1)', () => {
    // `segmentIdsForRow` reads the frame's Entry map, not its planned rows, for one reason: it must
    // agree with `entryIdsForRow`, which answers for a hidden row. Reading the planned rows instead
    // would silently narrow one of the pair and not the other.
    const [parent, child] = entryDoubles([
      overlappingValues(sampleEntries[0]!, 2),
      overlappingValues(sampleEntries[1]!, 2, sampleEntries[0]!.id),
    ]) as readonly [Entry, Entry];
    const tree: LayoutInput['rows'] = { source: 'entries', tree: true };
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [parent, child], rows: tree }));
    const childRow = layout.rowIdForEntry(child.id)!;

    layout.computeFrame(input({ entries: [parent, child], rows: tree, collapsed: [parent.id] }));

    expect(layout.entryIdsForRow(childRow)).toEqual([child.id]);
    expect(layout.segmentIdsForRow(childRow)).toEqual(child.segments.map((segment) => segment.id));
  });

  it('a grouping header row stands for no Segment, on both paths (#230 R0)', () => {
    const layout = new FrameLayout();
    const frame = layout.computeFrame(
      input({
        entries: sampleEntries.slice(0, 4),
        rows: { source: 'group', groupBy: () => 'all' },
      }),
    );

    const header = frame.rows.find((row) => row.kind === 'header');
    expect(header).toBeDefined();
    expect(header!.entryIds).toEqual([]);
    expect(layout.segmentIdsForRow(header!.id)).toEqual([]);
  });
});

describe('FrameLayout row production (S4.8, [S4-A5])', () => {
  it('produces a row once per revision, not once per read', () => {
    const spy = vi.spyOn(produceBars, 'produceBarsForRow');
    const layout = new FrameLayout();
    const entries = [overlappingEntry(sampleEntries[0]!, 2), sampleEntries[1]!];
    const rowsInput = input({ entries });

    layout.computeFrame(rowsInput);
    const firstCalls = spy.mock.calls.length;
    expect(firstCalls).toBe(entries.length);

    layout.computeFrame(rowsInput);
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
    const rowsInput = input({ entries });
    const first = layout.computeFrame(rowsInput);
    expect(first.rows[0]?.height).toBe(layout.rowTop(1) - layout.rowTop(0));
    expect(heightAt).toHaveBeenCalled();

    const produceSpy = vi.spyOn(produceBars, 'produceBarsForRow');
    produceSpy.mockClear();
    layout.invalidateFrom(1);
    layout.computeFrame(rowsInput);
    const producedFor = produceSpy.mock.calls.map((call) => call[0].entryIds.map((id) => String(id)));
    expect(producedFor.some((ids) => ids.includes(String(sampleEntries[0]!.id)))).toBe(false);
    expect(producedFor.some((ids) => ids.includes(String(sampleEntries[1]!.id)))).toBe(true);
    heightAt.mockRestore();
    produceSpy.mockRestore();
  });

  it('invalidateForChange walks from the lowest updated row, and from 0 on add/remove', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const produceSpy = vi.spyOn(produceBars, 'produceBarsForRow');

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
    produceSpy.mockClear();
    layout.computeFrame(input());
    const afterUpdate = produceSpy.mock.calls.length;
    expect(afterUpdate).toBeLessThan(sampleEntries.length);

    produceSpy.mockClear();
    layout.invalidateForChange({
      id: changeSetId(2),
      origin: 'user',
      added: [{ store: 'entries', entity: sampleStoredEntries[0]! }],
      removed: [],
      updated: [],
    });
    layout.computeFrame(input());
    expect(produceSpy.mock.calls.length).toBe(sampleEntries.length);
    produceSpy.mockRestore();
  });
});
