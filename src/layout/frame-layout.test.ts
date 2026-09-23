import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { FrameLayout } from './frame-layout.js';
import type { RowPlanInput, RowPlanMemoryInput } from './frame-layout.js';
import { createVariantRegistry } from './bars/variants.js';
import { fixedWidthBar } from './bars/bar.js';
import { sampleEntries, sampleStoredEntries } from '../../fixtures/sample-dataset.js';
import { createTimeScale, dayPreset } from '../time/index.js';
import * as resolveRowsMod from './rows/resolve-rows.js';
import * as produceBars from './bars/produce-bars.js';
import type { Entry } from '../model/index.js';
import { entryDoubles } from './entry-double.js';
import { changeSetId, entryId, barId, rowId } from '../model/index.js';
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

  it('barIdsForEntry answers the one bar an ordinary entry draws (#185)', () => {
    const layout = new FrameLayout();
    const entry = sampleEntries[0]!;
    const frame = layout.computeFrame(input({ entries: [entry] }));

    expect(layout.barIdsForEntry(entry.id)).toEqual(frame.bars.map((bar) => bar.id));
    expect(layout.barIdsForEntry(entry.id)).toHaveLength(1);
  });

  it('barIdsForEntry answers a plugin variant that draws its own Bars (#185)', () => {
    // A producer is free to name its Bars — nothing here parses `${entryId}:${partIndex}`.
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
          label: entry.name,
          start: entry.start!,
          end: entry.end!,
        },
        {
          id: barId(entry.id, 9),
          entryId: entry.id,
          variant,
          label: entry.name,
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

    const bars = layout.barsForEntry(entry.id);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.box).toEqual({ widthPx: px, anchor: 'center' });
  });

  // Retired (ADR 0026, #421): `segmentIdsForBar`/`segmentIdsForRow` named which Segment(s) a Bar
  // or a row stood for. A core Entry now always draws exactly one Bar over its own span, so there
  // is no Segment set left to name — `entryIdsForRow` (kept and rewritten below) is the surviving
  // per-row answer, and a Bar already names its one Entry directly via `Bar.entryId`.

  it('entryIdsForRow names every Entry the row owns, in row order (#199)', () => {
    // Only a custom row source can put several Entries on one Row, which is the shape this answers.
    const owned = sampleEntries.slice(0, 3);
    const oneRowForAll: LayoutInput['rows'] = {
      source: 'custom',
      resolve: ({ entries }) => [{ id: 'lane-1', entryIds: entries.map((entry) => entry.id) }],
    };
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: owned, rows: oneRowForAll }));

    expect(layout.entryIdsForRow(rowId('lane-1'))).toEqual(owned.map((entry) => entry.id));
    expect(layout.entryIdsForRow(rowId('no-such-row'))).toEqual([]);
  });

  it('a row collapse hid still names its Entries, from the frame Entry map not its planned rows (#230 R1)', () => {
    // `entryIdsForRow` reads the frame's Entry map, not its planned rows, so it still answers for a
    // row a collapsed ancestor hides.
    const [parent, child] = entryDoubles([
      { id: String(sampleEntries[0]!.id), start: sampleEntries[0]!.start!, end: sampleEntries[0]!.end! },
      {
        id: String(sampleEntries[1]!.id),
        start: sampleEntries[1]!.start!,
        end: sampleEntries[1]!.end!,
        parentId: String(sampleEntries[0]!.id),
      },
    ]) as readonly [Entry, Entry];
    const tree: LayoutInput['rows'] = { source: 'entries', tree: true };
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: [parent, child], rows: tree }));
    const childRow = layout.rowIdForEntry(child.id)!;

    layout.computeFrame(input({ entries: [parent, child], rows: tree, collapsed: [parent.id] }));

    expect(layout.entryIdsForRow(childRow)).toEqual([child.id]);
  });

  it('a grouping header row stands for no Entry, on both paths (#230 R0)', () => {
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
    expect(layout.entryIdsForRow(header!.id)).toEqual([]);
  });
});

describe('FrameLayout row production (S4.8, [S4-A5])', () => {
  it('produces a row once per revision, not once per read', () => {
    const spy = vi.spyOn(produceBars, 'produceBarsForRow');
    const layout = new FrameLayout();
    const entries = sampleEntries.slice(0, 2);
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
    const entries = sampleEntries.slice(0, 3);
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

describe('FrameLayout row-plan cache (#495, #414)', () => {
  it('reuses the same planned rows across a viewport-only change (scroll, pan)', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.plannedRows();

    // Neither `visible` nor `revision` is part of `RowPlanInput` — a scroll or a pan touches
    // only these two, so the plan must come back as the very same array, not an equal one.
    layout.computeFrame(input({ visible: { x: 0, y: 500, width: 800, height: 600 }, revision: 1 }));

    expect(layout.plannedRows()).toBe(before);
  });

  it('does not re-resolve the row plan on a viewport-only change', () => {
    const spy = vi.spyOn(resolveRowsMod, 'resolveOpenRows');
    const layout = new FrameLayout();
    layout.computeFrame(input());
    spy.mockClear();

    layout.computeFrame(input({ visible: { x: 0, y: 500, width: 800, height: 600 }, revision: 1 }));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('re-resolves when the entries array identity changes', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.plannedRows();

    layout.computeFrame(input({ entries: [...sampleEntries] }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when datasetRevision changes', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.plannedRows();

    layout.computeFrame(input({ datasetRevision: 1 }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when rows (the RowSource) changes', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.plannedRows();

    layout.computeFrame(input({ rows: { source: 'entries', tree: true } }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when fieldCompares changes', () => {
    const layout = new FrameLayout();
    const compares: LayoutInput['fieldCompares'] = [];
    layout.computeFrame(input({ fieldCompares: compares }));
    const before = layout.plannedRows();

    layout.computeFrame(input({ fieldCompares: [...compares] }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when fieldContext changes', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ fieldContext: { timeZone: 'UTC' } }));
    const before = layout.plannedRows();

    layout.computeFrame(input({ fieldContext: { timeZone: 'UTC' } }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when entryRulePorts changes', () => {
    const ports: LayoutInput['entryRulePorts'] = { fieldFor: () => undefined, reportUnknownKey: () => {} };
    const layout = new FrameLayout();
    layout.computeFrame(input({ entryRulePorts: ports }));
    const before = layout.plannedRows();

    layout.computeFrame(input({ entryRulePorts: { ...ports } }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when collapsed changes', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ collapsed: [] }));
    const before = layout.plannedRows();

    layout.computeFrame(input({ collapsed: [String(sampleEntries[0]!.id)] }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('re-resolves when fieldRegistryRevision changes, so a post-mount ctx.fields.register() invalidates the cache', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ fieldRegistryRevision: 0 }));
    const before = layout.plannedRows();

    layout.computeFrame(input({ fieldRegistryRevision: 1 }));

    expect(layout.plannedRows()).not.toBe(before);
  });

  it('still runs placeFrame on a cached plan, so geometry keeps following the viewport', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());

    const scrolled = layout.computeFrame(input({ visible: { x: 0, y: 500, width: 800, height: 600 } }));

    expect(scrolled.rows.length).toBeGreaterThan(0);
  });

  // #504: `resolve()` is a `RowPlanInput` read like any other row source's own fields —
  // it runs again only when `rows` (the authored object) changes identity, never on every frame. A
  // `resolve()` that reads page state stays stale until the caller reassigns `gantt.rowSource`
  // (`docs/07-row-source-updates.md`'s own refresh path).
  it('a custom source’s resolve() is cached — it does not run again while `rows` keeps its identity', () => {
    const resolve = vi.fn((planInput: { entries: readonly Entry[] }) =>
      planInput.entries.map((entry) => ({ id: String(entry.id) })),
    );
    const rows: LayoutInput['rows'] = { source: 'custom', resolve };
    const layout = new FrameLayout();

    layout.computeFrame(input({ rows }));
    expect(resolve).toHaveBeenCalledTimes(1);

    layout.computeFrame(input({ rows }));
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('reassigning `rows` to a new object is the refresh path — resolve() runs again', () => {
    const resolve = vi.fn((planInput: { entries: readonly Entry[] }) =>
      planInput.entries.map((entry) => ({ id: String(entry.id) })),
    );
    const layout = new FrameLayout();

    layout.computeFrame(input({ rows: { source: 'custom', resolve } }));
    expect(resolve).toHaveBeenCalledTimes(1);

    layout.computeFrame(input({ rows: { source: 'custom', resolve } }));
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});

// #424 review, point 1: an earlier cut of `ensureRowPlan` replanned `#plan` and the row-id maps but
// left `#memory` — the height index, `rowById` — behind. A read between two `computeFrame` calls
// then answered from two different row trees at once: `rowIndexForEntry` saw the replanned rows,
// `rowTop`/`barsForEntry` still saw the last painted frame's. Chosen fix: `ensureRowPlan` syncs
// `#memory` on every call, replan or not, so no caller can ever observe the two apart.
describe('FrameLayout.ensureRowPlan keeps #memory in step with #plan (#424 review, point 1)', () => {
  /** `ensureRowPlan` takes `RowPlanInput` + `RowPlanMemoryInput`, not `LayoutInput` — this mirrors
   *  `frame-layout.ts`'s own (private) `planInputFrom`, so a test can build the same call a real
   *  `collapseStateOf` read makes, from the same `input()` fixture every other test in this file
   *  uses. */
  function planFrom(li: LayoutInput): { plan: RowPlanInput; memory: RowPlanMemoryInput } {
    return {
      plan: {
        entries: li.entries,
        datasetRevision: li.datasetRevision,
        rows: li.rows,
        fieldCompares: li.fieldCompares,
        fieldContext: li.fieldContext,
        entryRulePorts: li.entryRulePorts,
        collapsed: li.collapsed,
        fieldRegistryRevision: li.fieldRegistryRevision ?? 0,
      },
      memory: { rowHeight: li.rowHeight, registry: li.variants },
    };
  }

  it('barsForEntry answers a row ensureRowPlan alone just planned, with no computeFrame call in between', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: sampleEntries.slice(0, 2) }));

    // A write grows the entries — the same shape `entries.add()` leaves behind, between two frames.
    const grown = sampleEntries.slice(0, 3);
    const added = grown[2]!;
    const { plan, memory } = planFrom(input({ entries: grown }));
    layout.ensureRowPlan(plan, memory);

    // `rowIndexForEntry` reads `#plan`/`#rowOfEntry` — both maps `ensureRowPlan` always kept current.
    expect(layout.rowIndexForEntry(added.id)).toBe(2);
    // `barsForEntry` reads `#memory.rowMemory`, keyed by `#rowById` — the map the bug left behind at
    // two rows. Answering `[]` here is exactly the review's traced symptom.
    expect(layout.barsForEntry(added.id).length).toBeGreaterThan(0);
  });

  it("rowTop answers the row height ensureRowPlan alone just synced, not the last painted frame's", () => {
    const layout = new FrameLayout();
    // `rowHeight` sits in `RowPlanMemoryInput`, not `RowPlanInput` (#424 review, point 1): it never
    // decides whether to replan, so a row-height change alone reaches `#memory` only through the
    // `sync` call `ensureRowPlan` makes on every call — with a uniform row height, a stale height
    // index still answers `topAt` from row *count* alone, so this is the one property a stale
    // `#memory` cannot pass through by accident.
    layout.computeFrame(input({ entries: sampleEntries.slice(0, 3), rowHeight: 20 }));
    const { plan, memory } = planFrom(input({ entries: sampleEntries.slice(0, 3), rowHeight: 40 }));
    layout.ensureRowPlan(plan, memory);

    expect(layout.rowTop(2)).toBe(80);
  });
});

// #424 review, point 2: `ensureRowPlan` could replace `#plan` between frames without advancing
// `rowPlanRevision` — the stamp `view/gantt-dom.ts` keys its one-slot pointer memo on (#212). A write
// then a between-frames `collapseStateOf` read replanned the rows while the stamp stayed equal, so
// a memoized `DomTarget`'s `entryIds` could answer from a row tree the layout had already left.
describe('FrameLayout.rowPlanRevision advances with the row tree, not the frame (#424 review, point 2)', () => {
  it('does not advance on a viewport-only computeFrame call (scroll, pan)', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.rowPlanRevision;

    layout.computeFrame(input({ visible: { x: 0, y: 500, width: 800, height: 600 }, revision: 1 }));

    expect(layout.rowPlanRevision).toBe(before);
  });

  it('advances when a between-frames ensureRowPlan call actually replans', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input({ entries: sampleEntries.slice(0, 2) }));
    const before = layout.rowPlanRevision;

    // Same shape `entries.add()` leaves behind between two frames — no `computeFrame` call between.
    const grown = sampleEntries.slice(0, 3);
    layout.ensureRowPlan(
      {
        entries: grown,
        datasetRevision: 0,
        rows: undefined,
        fieldCompares: undefined,
        fieldContext: undefined,
        entryRulePorts: undefined,
        collapsed: undefined,
        fieldRegistryRevision: 0,
      },
      { rowHeight: 32, registry: variantRegistry },
    );

    expect(layout.rowPlanRevision).toBe(before + 1);
  });

  it('does not advance when a between-frames ensureRowPlan call finds the same row plan', () => {
    const layout = new FrameLayout();
    layout.computeFrame(input());
    const before = layout.rowPlanRevision;

    layout.ensureRowPlan(
      {
        entries: sampleEntries,
        datasetRevision: 0,
        rows: undefined,
        fieldCompares: undefined,
        fieldContext: undefined,
        entryRulePorts: undefined,
        collapsed: undefined,
        fieldRegistryRevision: 0,
      },
      { rowHeight: 32, registry: variantRegistry },
    );

    expect(layout.rowPlanRevision).toBe(before);
  });
});
