import { describe, expect, it, vi } from 'vitest';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import {
  DEFAULT_MIN_BAR_WIDTH_PX,
  FrameLayout,
  ScrollAxis,
  TimeScaleModel,
  fixedWidthBar,
} from '../layout/index.js';
import { entryId, rowId, barId, RevealTargetNotFoundError, ContainerNotFoundError } from '../model/index.js';
import type { EntryId, Field, Instant, BarId, StoredEntry } from '../model/index.js';
import { DatasetState, EntryStore } from '../data/index.js';
import { editableOf, FieldRegistry } from '../data/fields/field-registry.js';
import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { EntryGestureContext } from './entry-gesture-context.js';
import { DEFAULT_ROW_HEIGHT } from './frame-settings.js';

// [S2-A3]: counts `RenderBackend.sync` calls, one test's own instance (§9-I's `GanttShellOptions.backend`
// injection point) rather than a module-wide mock every other test in this file would otherwise pay for.
function countingDomBackend(calls: { count: number }): RenderBackend<HTMLElement> {
  // This backend only counts `sync` calls, so it paints nothing that needs an Entry. It still states
  // every option, because the factory refuses to guess one (#212).
  const backend = createDomBackend({
    entryById: () => undefined,
    resolveBarRenderer: () => undefined,
    resolveGridCellRenderer: () => undefined,
    resolveHeaderRenderer: () => undefined,
  });
  return {
    ...backend,
    sync: (frame) => {
      calls.count++;
      backend.sync(frame);
    },
  };
}

// D-S2-2: `GanttShellOptions.dataset` is a store view now, not a plain array — the real `EntryStore`
// backs these fixtures the same way a `Dataset` would, with no test-only fake to keep in sync.
// `referenceDate` is a bare epoch-ms cast, not `time/`'s `instant()` — view/ may not import time/ (I1).
function fakeDataset(
  entries: readonly StoredEntry[],
  fields: readonly Field[] = [],
): GanttShellOptions['dataset'] {
  // `entry.read` is the one value door, and it refuses a key no Field declares (ADR 0017). So a test
  // that reads a passenger key declares it, exactly as a consumer does.
  const registry = new FieldRegistry({ fields });
  const context = {
    timeZone,
    dateOnlyEnd: 'inclusive' as const,
  };
  // No changes ever land on this store, so on/off are stubs — none of these tests mutate the
  // dataset, so no handler this file registers is ever called.
  return {
    entries: new EntryStore(entries, context, registry),
    timeZone,
    datasetRevision: 0,
    fields: { all: registry.all },
    field: (key) => registry.get(key),
    editableOf: (_id, key) => {
      const declared = registry.get(key);
      return declared === undefined ? 'never' : editableOf(declared);
    },
    on: () => () => {},
    off: () => {},
  };
}

// One call site for every ordinary construction in this file, so the step that moves the first
// paint out of the constructor (ADR 0032) touches this file once, not at every call site.
function paintedShell(options: GanttShellOptions): GanttShell {
  const shell = new GanttShell(options);
  shell.paintFirstFrame();
  return shell;
}

// happy-dom does no layout, so a real ResizeObserver never fires (verified against pane-size-
// attachment.test.ts's own fake) — this is the same test seam, stubbed globally because GanttShell
// constructs `attachPaneSize` itself and takes no `ResizeObserverCtor` option of its own (#8: the
// shell wires the attachment, it does not grow a second test seam to do it).
type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observedCount = 0;
  #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {
    this.observedCount++;
  }

  unobserve(): void {}

  disconnect(): void {}

  fire(size: { width: number; height: number }): void {
    this.#callback(
      [
        {
          contentBoxSize: [{ inlineSize: size.width, blockSize: size.height }],
        } as unknown as ResizeObserverEntry,
      ],
      this,
    );
  }
}

// view/ has no import edge to time/ (plans/01 §1) — instant() lives there. Date.parse on a
// Z-offset string is deterministic regardless of the container machine's zone, unlike `new Date(str)`
// on a zoneless string (#27), so this is not the thing I10 exists to ban.
/** The x of a node's `translate(...)` — the only geometry a paint writes as a transform (#200). */
function translateX(node: HTMLElement): number {
  return Number(/translate\((-?[\d.]+)px/u.exec(node.style.transform)?.[1] ?? NaN);
}

function pxWidth(node: HTMLElement): number {
  return Number(node.style.width.replace('px', ''));
}

function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const timeZone = 'UTC';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-06T00:00:00Z'); // 5 days

const entries: StoredEntry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
    props: {},
    siblingIndex: 0,
  },
];

function tallEntries(count: number): StoredEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const start = rangeStart;
    const end = instant('2026-09-03T00:00:00Z');
    return {
      id: entryId(`e${i}`),
      name: `Entry ${i}`,
      start,
      end,
      props: {},
      siblingIndex: i,
    };
  });
}

describe('paintFirstFrame (ADR 0032)', () => {
  it('paints no bar and emits nothing until paintFirstFrame() runs', () => {
    const container = document.createElement('div');
    const events: string[] = [];
    const shell = new GanttShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    shell.on('navigationChange', () => {
      events.push('navigationChange');
    });

    expect(container.querySelectorAll('.fg-bar')).toHaveLength(0);
    expect(events).toEqual([]);

    shell.paintFirstFrame();

    expect(container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);
    expect(events).toEqual([]);

    shell.destroy();
  });
});

describe('GanttShell header band', () => {
  it('renders one tick per day for the day preset', () => {
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries), scale });

    const ticks = container.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(5);
    // S1.12 moved header formatting onto Intl.DateTimeFormatOptions (D-S1.12-11), locale-formatted.
    expect(ticks[0]?.textContent).toBe('Sep 1, 2026');

    shell.destroy();
    expect(container.children.length).toBe(0);
  });

  it('re-renders when a second Gantt binds to the same shared scale (#6, D9)', () => {
    // No pinned range: the scale fits every bound dataset, so binding B widens the span A reads from.
    const scale = new TimeScaleModel();
    const containerA = document.createElement('div');
    const shellA = paintedShell({
      wiring: {},
      container: containerA,
      dataset: fakeDataset(entries),
      scale,
    });

    const initialTickCount = containerA.querySelectorAll('.fg-header .fg-tick').length;

    const containerB = document.createElement('div');
    const widerEntries: StoredEntry[] = [
      {
        id: entryId('w1'),
        name: 'W1',
        start: rangeStart,
        end: instant('2026-09-20T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      },
    ];
    const shellB = paintedShell({
      wiring: {},
      container: containerB,
      dataset: fakeDataset(widerEntries),
      scale,
    });

    // A never called render() itself after B bound — the notify from B's bind is what requested
    // this frame (D-S2-15); render() forces it now instead of waiting on the next animation frame.
    shellA.render();
    expect(containerA.querySelectorAll('.fg-header .fg-tick').length).toBeGreaterThan(initialTickCount);

    shellA.destroy();
    shellB.destroy();
  });
});

describe('row height (#39)', () => {
  it('reads --fg-row-height from the container, not a constructor option', () => {
    const container = document.createElement('div');
    document.body.append(container);
    container.style.setProperty('--fg-row-height', '48px');

    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    const row = container.querySelector<HTMLElement>('.fg-row')!;
    expect(row.style.height).toBe('48px');

    shell.destroy();
    container.remove();
  });

  it('falls back to a default when --fg-row-height is unset', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    const row = container.querySelector<HTMLElement>('.fg-row')!;
    expect(row.style.height).toBe(`${DEFAULT_ROW_HEIGHT}px`);
    shell.destroy();
  });
});

// A bar paints at --fg-bar-height, not the row's own height (bar height is its own knob) — the
// twin of "row height (#39)" above, for the token that now governs the bar box instead.
describe('bar height', () => {
  it('reads --fg-bar-height from the container, independent of --fg-row-height', () => {
    const container = document.createElement('div');
    document.body.append(container);
    container.style.setProperty('--fg-row-height', '48px');
    container.style.setProperty('--fg-bar-height', '22px');

    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('22px');

    shell.destroy();
    container.remove();
  });

  it('falls back to the shipped default (18px) when --fg-bar-height is unset', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('18px');
    shell.destroy();
  });
});

describe('GanttShell.destroy()', () => {
  it('is idempotent — a second call does not throw or double-unbind (#34)', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });

    expect(() => {
      shell.destroy();
      shell.destroy();
    }).not.toThrow();
  });
});

describe('scroll (D9, #9)', () => {
  it('constructs a private default ScrollAxis pair when scroll is omitted', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
    // No shared model was passed; the shell still renders and destroys cleanly, proving a
    // default was constructed rather than left unset.
    expect(container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);
    shell.destroy();
  });

  // Whether a model-driven position write actually lands on the element (I12's own concern) is
  // covered by scroll-attachment.test.ts and, for the real-clamp case happy-dom cannot express,
  // e2e/scroll-sync.spec.ts (S1.5 README §7) — this level proves GanttShell pushes the *right
  // extents* into the shared model in the first place.

  // The measured box is now the timeline pane's, not the container's (S1.8: PaneLayout owns a child
  // element as the scroller). happy-dom does no layout, so these drive the same FakeResizeObserver
  // seam pane-size-attachment.test.ts uses, feeding the pane height GanttShell reads on construction.

  it('two shells sharing one y ScrollAxis both contribute to the shared max (U1/U2)', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scrollY = new ScrollAxis();
      const containerA = document.createElement('div');
      const containerB = document.createElement('div');

      const shellA = paintedShell({
        wiring: {},
        container: containerA,
        dataset: fakeDataset(tallEntries(50)),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });
      const shellB = paintedShell({
        wiring: {},
        container: containerB,
        dataset: fakeDataset(tallEntries(50)),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[1]!.fire({ width: 500, height: 100 });

      // 50 rows at the default row height, in a 100px pane -> the same max for either chart.
      expect(scrollY.state.max).toBe(50 * DEFAULT_ROW_HEIGHT - 100);

      shellA.destroy();
      shellB.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("culls rows against the current scroll position, not always (0,0) (regression: render() hardcoded the culling window's y to 0, so scrolling past the first screenful rendered nothing)", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scrollY = new ScrollAxis();
      const container = document.createElement('div');

      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset(tallEntries(50)),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 10 * DEFAULT_ROW_HEIGHT }); // 10 rows
      shell.render(); // D-S2-15: the resize's render request is coalesced onto the next frame

      // The default `gridColumns` now also paints `start`/`end` (ADR 0012), so the name cell alone
      // — not the whole row's textContent — is what still names one Entry unambiguously.
      const labelsAt = (): string[] =>
        Array.from(
          container.querySelectorAll('.fg-row'),
          (row) => row.querySelector('[data-field="name"]')?.textContent?.trim() ?? '',
        );

      expect(labelsAt()).toContain('Entry 0');
      expect(labelsAt()).not.toContain('Entry 40');

      scrollY.panTo(40 * DEFAULT_ROW_HEIGHT); // scroll 40 rows down
      shell.render();

      expect(labelsAt()).not.toContain('Entry 0');
      expect(labelsAt()).toContain('Entry 40');

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a shorter chart's own max is the loosest bound it needs, not the taller chart's (U3)", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scrollY = new ScrollAxis();
      const shortContainer = document.createElement('div');
      const tallContainer = document.createElement('div');

      const shortShell = paintedShell({
        wiring: {},
        container: shortContainer,
        dataset: fakeDataset(tallEntries(5)),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });
      const tallShell = paintedShell({
        wiring: {},
        container: tallContainer,
        dataset: fakeDataset(tallEntries(500)),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[1]!.fire({ width: 500, height: 100 });

      // Loosest bound across both bindings: the tall chart's 500 rows dwarf the short chart's 5
      // (D-S1.5-1) — proving both extents actually reached the shared axis.
      expect(scrollY.state.max).toBe(500 * DEFAULT_ROW_HEIGHT - 100);

      shortShell.destroy();
      tallShell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('GanttShell container resolution (#38)', () => {
  it('resolves a string container as a CSS selector', () => {
    const container = document.createElement('div');
    container.id = 'target';
    document.body.append(container);

    const shell = paintedShell({ wiring: {}, container: '#target', dataset: fakeDataset(entries) });
    expect(container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);

    shell.destroy();
    container.remove();
  });

  it('throws naming the selector when nothing matches', () => {
    expect(
      () => new GanttShell({ wiring: {}, container: '#does-not-exist', dataset: fakeDataset(entries) }),
    ).toThrow(/does-not-exist/);
  });

  it('throws a typed ContainerNotFoundError with code "container-not-found" (D-S1.8-9)', () => {
    let caught: unknown;
    try {
      new GanttShell({ wiring: {}, container: '#does-not-exist', dataset: fakeDataset(entries) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContainerNotFoundError);
    expect((caught as ContainerNotFoundError).code).toBe('container-not-found');
  });
});

describe('pane split pixel identity (S1.8, D-S1.8-1)', () => {
  it('[S1-A2] grid row tops and timeline bar tops agree to the pixel at a fractional zoom', () => {
    const container = document.createElement('div');
    document.body.append(container);
    // A non-integer --fg-row-height stands in for the "fractional zoom" acceptance box (D-S1.8-12):
    // it is what actually makes `row.top` land on a non-integer pixel for rows past the first, which
    // is the case that would expose the two panes reading their `top` from different places.
    container.style.setProperty('--fg-row-height', '31.5px');
    const rowEntries = tallEntries(3);
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(rowEntries) });

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'));
    const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-timeline-pane .fg-bar'));
    expect(rows).toHaveLength(3);
    expect(bars).toHaveLength(3);

    const translateY = (el: HTMLElement): number => {
      const match = /translateY\(([-\d.]+)px\)/.exec(el.style.transform);
      return match ? Number(match[1]) : NaN;
    };
    const translateBarY = (el: HTMLElement): number => {
      const match = /translate\([-\d.]+px,\s*([-\d.]+)px\)/.exec(el.style.transform);
      return match ? Number(match[1]) : NaN;
    };

    // A bar no longer fills its row (bar height): it centres inside the row's band, so its own top
    // sits the row's top plus half the leftover between the row and the shorter bar.
    const rowHeight = 31.5;
    const barHeightPx = 18; // DEFAULT_BAR_HEIGHT_PX — no --fg-bar-height set on this container.
    const centringOffset = (rowHeight - barHeightPx) / 2;
    for (let i = 0; i < rows.length; i++) {
      expect(translateBarY(bars[i]!)).toBe(translateY(rows[i]!) + centringOffset);
    }
    // Confirms the case is not vacuous: at least one row sits at a non-integer top.
    expect(rows.some((row) => !Number.isInteger(translateY(row)))).toBe(true);

    shell.destroy();
    container.remove();
  });

  it('(D1) the content sizer carries no row-label gutter — its far edge is contentWidth - 1, not gridWidth + contentWidth - 1', () => {
    // happy-dom does no layout (`scrollWidth` is always 0 here), so this reads the same number the
    // real DOM's `scrollWidth` would be driven by: the content sizer's own transform (render/dom's
    // `sync()`), rather than the literal `timelinePane.scrollWidth` the spec names (that assertion
    // belongs to e2e — plans/s1.8-pane-layout/README.md D-S1.8-10 — where a real layout engine runs).
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
      const container = document.createElement('div');
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset(entries),
        scale,
        gridWidth: 300,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 653, height: 400 });
      shell.render(); // D-S2-15: the resize's render request is coalesced onto the next frame

      const sizer = container.querySelector<HTMLElement>('.fg-timeline-pane .fg-content-sizer')!;
      const match = /translate\(([-\d.]+)px,/.exec(sizer.style.transform);
      const sizerX = match ? Number(match[1]) : NaN;

      const expectedX = Math.max(0, scale.scale.contentWidth - 1);
      expect(sizerX).toBe(expectedX);
      // The old defect: the sizer's far edge included the grid pane's own width. Proves it is gone.
      expect(sizerX).toBeLessThan(300 + expectedX);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('pane-size attachment (S1.7b, #8)', () => {
  it('a live resize reaches both TimeScaleModel and the y ScrollAxis, re-renders, and destroy() detaches', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scale = new TimeScaleModel(); // range: 'fitDataset' — pxPerMs depends on paneWidth
      const scrollY = new ScrollAxis();
      const container = document.createElement('div');
      const tall = Array.from({ length: 50 }, (_, i) => {
        const start = rangeStart;
        const end = instant('2026-09-03T00:00:00Z');
        return {
          id: entryId(`e${i}`),
          name: `Entry ${i}`,
          start,
          end,
          props: {},
          siblingIndex: i,
        };
      });
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset(tall),
        scale,
        scroll: { y: scrollY },
      });

      // Exactly one observer for this one Gantt.
      expect(FakeResizeObserver.instances).toHaveLength(1);
      expect(FakeResizeObserver.instances[0]!.observedCount).toBe(1);

      // A stand-in for pxPerMs (not on the public TimeScale interface, plans/01 §1): the pixel
      // distance the scale assigns to one fixed instant span. It moves iff pxPerMs moved.
      const oneDayWidth = (): number => scale.scale.xForInstant(instant('2026-09-02T00:00:00Z'));
      const widthBefore = oneDayWidth();
      const maxYBefore = scrollY.state.max;

      FakeResizeObserver.instances[0]!.fire({ width: 900, height: 400 });

      // TimeScaleModel: a new paneWidth re-fits pxPerMs.
      expect(oneDayWidth()).not.toBe(widthBefore);
      // ScrollAxis: a new pane height moves max (50 rows at the default height, less 400).
      expect(scrollY.state.max).toBe(50 * DEFAULT_ROW_HEIGHT - 400);
      expect(scrollY.state.max).not.toBe(maxYBefore);
      // Re-rendered with the new geometry — no remount, the container keeps its band wrapper.
      expect(container.querySelector('.fg-band')).not.toBeNull();

      shell.destroy(); // unbind() also drops this shell's own contribution to the shared max.
      const widthAfterDestroy = oneDayWidth();
      const maxYAfterDestroy = scrollY.state.max;
      FakeResizeObserver.instances[0]!.fire({ width: 100, height: 50 });
      // detach() unhooked the observer: a later fire reaches neither model.
      expect(oneDayWidth()).toBe(widthAfterDestroy);
      expect(scrollY.state.max).toBe(maxYAfterDestroy);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('preset/range/fit/overscan/zoomTo/zoomBy/reveal (S1.9, D-S1.9-9)', () => {
  it('preset/range/fit/overscan accessors delegate straight to the bound Viewport', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });

    expect(shell.fit).toBe('pane');
    shell.fit = 2;
    expect(shell.fit).toBe(2);

    expect(shell.range).toBe('fitDataset');
    shell.range = { start: rangeStart, end: rangeEnd };
    expect(shell.range).toEqual({ start: rangeStart, end: rangeEnd });

    shell.preset = 'week';
    expect(shell.preset.id).toBe('week');

    expect(shell.overscan).toEqual({});
    // 256, not 128: DEFAULT_OVERSCAN.horizontalPx is already 128 (frame.ts), so 128 would resolve
    // to the same value and the live setter's "notify iff changed" (D-S1.5-4) would treat it as a
    // no-op — not a bug, but not what this assertion means to prove.
    shell.overscan = { horizontalPx: 256 };
    expect(shell.overscan).toEqual({ horizontalPx: 256 });

    shell.destroy();
  });

  it('zoomTo/zoomBy delegate to the bound Viewport and move pxPerMs', () => {
    const container = document.createElement('div');
    // Small enough that 2x still clears the S1.12 density floor and stays under MAX_CONTENT_PX
    // for this fixture's 5-day span — a range that only exercises zoomTo/zoomBy delegation.
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: 0.00001 });
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries), scale });

    shell.zoomBy(2);
    expect(scale.scale.pxPerMs).toBe(0.00002);

    shell.zoomTo(0.00001);
    expect(scale.scale.pxPerMs).toBe(0.00001);

    shell.destroy();
  });

  it('a caller passing both scale and preset gets the shared scale, ignoring the constructor preset (D-S1.9-9)', () => {
    // The public `Gantt`/`GanttOptions` makes this combination a compile-time error (issue #84,
    // finding #3); `GanttShellOptions` stays a plain interface, so the warning is still reachable for
    // a caller constructing `GanttShell` directly. S5.12: nothing is subscribed to `error` here, so
    // the report falls back to the same `console.warn` this test already read.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scale = new TimeScaleModel({ preset: 'week' });
    const container = document.createElement('div');
    const shell = paintedShell({
      wiring: {},
      container,
      dataset: fakeDataset(entries),
      scale,
      preset: 'month',
    });

    expect(shell.preset.id).toBe('week');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    shell.destroy();
  });

  it('reveal(entryId) pans the bound y ScrollAxis to bring an off-screen row into view; unknown id throws', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollY = new ScrollAxis();
      const rowEntries = tallEntries(50);
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset(rowEntries),
        scroll: { y: scrollY },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });

      expect(scrollY.state.position).toBe(0);
      shell.reveal(entryId('e40'));
      expect(scrollY.state.position).toBeGreaterThan(0);

      expect(() => shell.reveal(entryId('does-not-exist'))).toThrow(RevealTargetNotFoundError);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal expands a collapsed ancestor instead of scrolling to y 0', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollY = new ScrollAxis();
      const parent: StoredEntry = {
        id: entryId('p'),
        name: 'p',
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const child: StoredEntry = {
        id: entryId('c'),
        name: 'c',
        parentId: entryId('p'),
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([parent, child]),
        scroll: { y: scrollY },
        rowSource: { source: 'entries', tree: true },
        collapsed: [rowId('p')],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });

      expect(shell.collapsed.map(String)).toContain('p');
      shell.reveal(entryId('c'));
      expect(shell.collapsed.map(String)).not.toContain('p');

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal expands a collapsed group header (D4)', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollY = new ScrollAxis();
      const alpha: StoredEntry = {
        id: entryId('a'),
        name: 'a',
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: { team: 'red' },
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([alpha], [{ key: 'team' }]),
        scroll: { y: scrollY },
        rowSource: {
          source: 'group',
          groupBy: (row) => String(row.read('team')),
        },
        collapsed: [rowId('group:red')],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });

      expect(shell.collapsed.map(String)).toContain('group:red');
      shell.reveal(entryId('a'));
      expect(shell.collapsed.map(String)).not.toContain('group:red');

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reveal(entryId) targets a diamond's own fixed box width, not the span-and-floor width (#295)", () => {
    // The bug this closes: `#revealSpan` built a boxless literal, so a `diamond()` row's reveal
    // used the 12px span floor instead of the 13px box `computeFrame` actually paints.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const pxPerMs = 0.01;
      const at = instant('2026-09-01T00:10:00Z'); // 600,000ms after rangeStart, at pxPerMs above
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: pxPerMs });
      const boxWidthPx = 13;
      const marker: StoredEntry = {
        id: entryId('marker'),
        name: 'marker',
        start: at,
        end: at,
        props: {},
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([marker]),
        scroll: { x: scrollX },
        scale,
        variants: [{ name: 'diamond', when: () => true, bars: fixedWidthBar(boxWidthPx) }],
      });
      const viewportWidth = 50;
      FakeResizeObserver.instances[0]!.fire({ width: viewportWidth, height: 100 });

      shell.reveal(entryId('marker'));

      const centerX = scale.scale.xForInstant(at);
      const expectedX = centerX + boxWidthPx / 2 - viewportWidth;
      const floorFallbackX = centerX + DEFAULT_MIN_BAR_WIDTH_PX / 2 - viewportWidth;
      expect(scrollX.state.position).toBe(expectedX);
      expect(scrollX.state.position).not.toBe(floorFallbackX);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Retired (ADR 0026, #421): `reveal(entryId)` used to union the painted boxes of every Segment
  // Bar one Entry drew — a core Entry could draw several Bars from its own Segment array. A core
  // Entry now always draws exactly one Bar over its own span, so there is no union left to read; a
  // custom variant that still draws several Bars from one Entry (`barsForEntry`'s own doc) is a
  // plugin-author scenario this shell-level test never covered.

  it('reveal(entryId) expands a collapsed ancestor before reading its Bars, so it targets the real box (#295)', () => {
    // `FrameLayout.barsForEntry` answers from the post-collapse plan — a row collapse hid answers
    // empty until the ancestor chain opens and the frame catches up. Computing the span before that
    // expand-and-flush would silently fall back to the entry's raw span instead of its diamond box.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const pxPerMs = 0.01;
      const at = instant('2026-09-01T00:10:00Z');
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: pxPerMs });
      const boxWidthPx = 13;
      const parent: StoredEntry = {
        id: entryId('p'),
        name: 'p',
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const child: StoredEntry = {
        id: entryId('c'),
        name: 'c',
        parentId: entryId('p'),
        start: at,
        end: at,
        props: {},
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([parent, child]),
        scroll: { x: scrollX },
        scale,
        rowSource: { source: 'entries', tree: true },
        collapsed: [rowId('p')],
        variants: [{ name: 'diamond', when: () => true, bars: fixedWidthBar(boxWidthPx) }],
      });
      const viewportWidth = 50;
      FakeResizeObserver.instances[0]!.fire({ width: viewportWidth, height: 100 });

      shell.reveal(entryId('c'));

      expect(shell.collapsed.map(String)).not.toContain('p');
      const centerX = scale.scale.xForInstant(at);
      const expectedX = centerX + boxWidthPx / 2 - viewportWidth;
      expect(scrollX.state.position).toBe(expectedX);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal(entryId) aligns to the rectangle computeFrame painted, box width included (#295)', () => {
    // `barSpan` is the one formula both sides read. This test reads the painted node's own x and
    // width off the DOM, then asserts the scroll `reveal` chose aligns that exact rectangle's right
    // edge. A second formula on either side shows up here as a bar reveal did not land on.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const at = instant('2026-09-01T00:10:00Z');
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: 0.01 });
      const boxWidthPx = 13;
      const marker: StoredEntry = {
        id: entryId('marker'),
        name: 'marker',
        start: at,
        end: at,
        props: {},
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([marker]),
        scroll: { x: scrollX },
        scale,
        variants: [{ name: 'diamond', when: () => true, bars: fixedWidthBar(boxWidthPx) }],
      });
      const viewportWidth = 50;
      FakeResizeObserver.instances[0]!.fire({ width: viewportWidth, height: 100 });

      shell.reveal(entryId('marker'));
      shell.render(); // paints the frame the reveal's own scroll asked for

      const bar = container.querySelector<HTMLElement>(`[data-bar-id="${barId(entryId('marker'))}"]`)!;
      expect(pxWidth(bar)).toBe(boxWidthPx);
      expect(scrollX.state.position).toBe(translateX(bar) + pxWidth(bar) - viewportWidth);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal(entryId) on an entry entirely past range.end scrolls toward it, not to the far left (#436 branch review F3)', () => {
    // `barSpan` drops a bar entirely outside `[0, contentWidth)` and reports a fabricated
    // `{x: 0, width: 0}` (#436). Folding that into `unionSpan` used to send `reveal` to the far
    // left — the same direction a real reveal target at `x: 0` would ask for, so the bug reads as
    // "reveal did nothing" from a rest position, and only shows up moving away from one. This test
    // starts mid-scroll and asserts `reveal` moves further right, toward the entry's own dates
    // (`fallbackSpanBar`), not back to the left edge.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: 0.01 });
      const farPast: StoredEntry = {
        id: entryId('far-past'),
        name: 'far past',
        start: instant('2026-09-20T00:00:00Z'),
        end: instant('2026-09-21T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([farPast]),
        scroll: { x: scrollX },
        scale,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 50, height: 100 });

      scrollX.panTo(200);
      const beforeReveal = scrollX.state.position;
      expect(beforeReveal).toBeGreaterThan(0);

      shell.reveal(entryId('far-past'));
      expect(scrollX.state.position).toBeGreaterThan(beforeReveal);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal(entryId) unions only the painted bars, skipping one a variant produced but barSpan dropped (#436 branch review F3)', () => {
    // Two Bars for one Entry: one lands entirely outside the content and is dropped
    // (`{x: 0, width: 0}`), the other paints in range. The union must read the painted one only —
    // folding the dropped bar's fabricated origin in would widen the union toward `0` and pull
    // `reveal` further left than the real bar needs.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: 0.01 });
      const entry: StoredEntry = {
        id: entryId('two-bars'),
        name: 'two bars',
        start: instant('2026-09-02T00:00:00Z'),
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const inRangeStart = entry.start as Instant;
      const inRangeEnd = entry.end as Instant;
      const outOfRangeStart = instant('2026-09-20T00:00:00Z');
      const outOfRangeEnd = instant('2026-09-21T00:00:00Z');
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([entry]),
        scroll: { x: scrollX },
        scale,
        variants: [
          {
            name: 'two-bars',
            when: () => true,
            bars: (e) => [
              {
                id: barId(e.id, 0),
                entryId: e.id,
                variant: 'two-bars',
                label: '',
                start: inRangeStart,
                end: inRangeEnd,
              },
              {
                id: barId(e.id, 1),
                entryId: e.id,
                variant: 'two-bars',
                label: '',
                start: outOfRangeStart,
                end: outOfRangeEnd,
              },
            ],
          },
        ],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 50, height: 100 });

      const inRangeX = scale.scale.xForInstant(inRangeStart);
      const inRangeWidth = Math.max(
        DEFAULT_MIN_BAR_WIDTH_PX,
        scale.scale.xForInstant(inRangeEnd) - scale.scale.xForInstant(inRangeStart),
      );

      shell.reveal(entryId('two-bars'));
      // The dropped second bar contributes nothing: the target is exactly the in-range bar's own
      // rectangle, not widened by a fabricated `{x: 0, ...}` at the union's low end.
      expect(scrollX.state.position).toBe(inRangeX + inRangeWidth - 50);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Retired (ADR 0026, #421): `reveal(segmentId)` used to target one Segment's own painted box, and
  // fall back to that Segment's own dates when no bar drew it. `reveal()` only ever takes an Entry id
  // now, and `Bar` carries no per-Segment identity to target, so neither scenario exists to test.

  it('[R6-F13] selectedEntryIds keeps Dataset order for two Entries a collapsed ancestor hides, instead of NaN-sorting them', () => {
    // Finding 13: `#rowRankByEntryId` gives an unplanned Entry no rank, and the old comparator read
    // that as `Infinity`. Two unplanned Entries then subtracted `Infinity - Infinity`, which is `NaN`
    // — a comparator result `Array.prototype.sort` does not define an order for. This fixture puts
    // two Entries behind one collapsed ancestor so both land in the Selection with no row rank at all.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const parent: StoredEntry = {
        id: entryId('p'),
        name: 'p',
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const first: StoredEntry = {
        id: entryId('c1'),
        name: 'c1',
        parentId: entryId('p'),
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 0,
      };
      const second: StoredEntry = {
        id: entryId('c2'),
        name: 'c2',
        parentId: entryId('p'),
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
        props: {},
        siblingIndex: 1,
      };
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset([parent, first, second]),
        rowSource: { source: 'entries', tree: true },
        collapsed: [rowId('p')],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });

      // Neither Entry has a row rank, so the comparator calls them equal and the stable sort leaves
      // them in the order the caller named them — the Selection's own order, `c2` then `c1` —
      // rather than throwing or silently reordering them, which a `NaN` comparator result invites.
      shell.selection = [second.id, first.id];

      expect(shell.selectedEntryIds).toEqual([second.id, first.id]);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a11y roles and the two panes (S1.10 D-S1.10-4, S5.11 D-S5-25)', () => {
  it('names the whole Gantt on the container and the timeline region, live, and claims no tab stop of its own', () => {
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = paintedShell({
      wiring: {},
      container,
      dataset: fakeDataset(entries),
      scale,
      a11yLabel: 'Room bookings',
    });

    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBe('Room bookings');
    // D-S5-26 retires the container's own tab stop: each pane carries one now.
    expect(container.hasAttribute('tabindex')).toBe(false);

    const timelinePane = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    expect(timelinePane.getAttribute('role')).toBe('region');
    expect(timelinePane.getAttribute('aria-label')).toBe('Room bookings');

    shell.a11yLabel = 'Renamed plan';
    expect(container.getAttribute('aria-label')).toBe('Renamed plan');
    expect(timelinePane.getAttribute('aria-label')).toBe('Renamed plan');

    shell.destroy();
  });

  it('makes the grid pane a grid for a flat row source and a treegrid for a tree one, sized by the whole row set', () => {
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = paintedShell({
      wiring: {},
      container,
      dataset: fakeDataset(entries),
      scale,
      rowSource: { source: 'entries', tree: false },
    });
    shell.render();

    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane.getAttribute('role')).toBe('grid');
    expect(gridPane.getAttribute('aria-rowcount')).toBe(String(entries.length));
    expect(gridPane.querySelector('.fg-grid-spacer')!.getAttribute('role')).toBe('rowgroup');
    expect(gridPane.querySelector('.fg-grid-header')!.getAttribute('role')).toBe('row');
    expect(gridPane.querySelector('.fg-rows')!.getAttribute('role')).toBe('rowgroup');

    shell.rowSource = { source: 'entries', tree: true };
    shell.render();
    expect(gridPane.getAttribute('role')).toBe('treegrid');

    shell.destroy();
  });
});

/** A fake `MediaQueryList` for `'(prefers-color-scheme: dark)'` — `fire()` is the OS flipping. */
function fakeDarkSchemeQuery(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  return {
    query,
    fire: (next: boolean) => {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('resolvedTheme / themeChange (#330)', () => {
  it("resolves 'auto' against the OS when constructed, with no event for that initial read", () => {
    const { query } = fakeDarkSchemeQuery(true);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const container = document.createElement('div');
      const events: string[] = [];
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      shell.on('themeChange', () => {
        events.push('fired');
      });

      expect(shell.resolvedTheme).toBe('dark');
      expect(events).toEqual([]);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('assigning theme fires themeChange when the resolved answer moves, and not when it does not', () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const container = document.createElement('div');
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: Array<{ from: string; to: string }> = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      expect(shell.resolvedTheme).toBe('light');

      shell.theme = 'light';
      expect(events).toEqual([]);

      shell.theme = 'dark';
      expect(shell.resolvedTheme).toBe('dark');
      expect(events).toEqual([{ from: 'light', to: 'dark' }]);

      shell.theme = 'dark';
      expect(events).toHaveLength(1);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the OS flipping under 'auto' fires themeChange with no assignment at all", () => {
    const { query, fire } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const container = document.createElement('div');
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: Array<{ from: string; to: string }> = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      fire(true);
      expect(shell.resolvedTheme).toBe('dark');
      expect(events).toEqual([{ from: 'light', to: 'dark' }]);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an ancestor's own pin shadows the OS, so a flip under it fires nothing (#271)", () => {
    const { query, fire } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const ancestor = document.createElement('div');
      ancestor.setAttribute('data-fg-theme', 'light');
      const container = document.createElement('div');
      ancestor.append(container);
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: unknown[] = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      expect(shell.resolvedTheme).toBe('light');
      fire(true);
      expect(shell.resolvedTheme).toBe('light');
      expect(events).toEqual([]);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('destroy detaches the OS listener — a later flip touches nothing', () => {
    const { query, fire } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const container = document.createElement('div');
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: unknown[] = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      shell.destroy();
      fire(true);
      expect(events).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // #375: an ancestor's own `data-fg-theme` pin (#271) is a documented, supported way to resolve
  // this Gantt's theme, and it can flip with no write of this Gantt's own — a wrapping app's own
  // dark-mode switch, say. `resolvedTheme` must answer the new value the instant it is read, with no
  // cache lag, and `themeChange` must fire once for the move. happy-dom delivers `MutationObserver`
  // records on a macrotask, not a microtask — `await Promise.resolve()` alone does not flush it.
  const flushMutationObserver = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("an ancestor's own pin flipping answers resolvedTheme synchronously, with no cache lag", () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const ancestor = document.createElement('div');
      const container = document.createElement('div');
      ancestor.append(container);
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });

      expect(shell.resolvedTheme).toBe('light');

      ancestor.setAttribute('data-fg-theme', 'dark');
      // The read itself needs no flush: `resolvedTheme` re-resolves on every read, uncached.
      expect(shell.resolvedTheme).toBe('dark');

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an ancestor's own pin flipping fires exactly one themeChange, with the right from/to", async () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const ancestor = document.createElement('div');
      const container = document.createElement('div');
      ancestor.append(container);
      // A `MutationObserver` needs an attached tree in happy-dom to deliver records — attach and
      // detach around the assertion, same as a real container always sits inside `document`.
      document.body.append(ancestor);
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: Array<{ from: string; to: string }> = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      ancestor.setAttribute('data-fg-theme', 'dark');
      await flushMutationObserver();

      expect(events).toEqual([{ from: 'light', to: 'dark' }]);

      shell.destroy();
      ancestor.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a pinned Gantt's own theme wins over a dark ancestor, and answers/emits nothing on the flip", async () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const ancestor = document.createElement('div');
      const container = document.createElement('div');
      ancestor.append(container);
      document.body.append(ancestor);
      const shell = paintedShell({
        wiring: {},
        container,
        dataset: fakeDataset(entries),
        theme: 'light',
      });
      const events: unknown[] = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      ancestor.setAttribute('data-fg-theme', 'dark');
      await flushMutationObserver();

      expect(shell.resolvedTheme).toBe('light');
      expect(events).toEqual([]);

      shell.destroy();
      ancestor.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // #375 follow-up: `getRootNode()` reads the container's root once, at construction. A container
  // built inside a detached tree and mounted afterwards — an ordinary mount pattern — must still see
  // an ancestor pin gained on mount, because `resolvedTheme` itself already answers it correctly; only
  // the event lagged before this fix (the observer stayed bound to the detached root forever).
  it('a Gantt built detached and mounted afterwards still fires themeChange for an ancestor pin', async () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const wrapper = document.createElement('div');
      const ancestor = document.createElement('div');
      const container = document.createElement('div');
      ancestor.append(container);
      wrapper.append(ancestor);
      // container/ancestor/wrapper built fully detached — no document.body.append yet.
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      // Mounted only now, after construction.
      document.body.append(wrapper);
      const events: Array<{ from: string; to: string }> = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      ancestor.setAttribute('data-fg-theme', 'dark');
      await flushMutationObserver();

      expect(events).toEqual([{ from: 'light', to: 'dark' }]);

      shell.destroy();
      wrapper.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('destroy disconnects the ancestor-pin observer — a flip after destroy fires nothing', async () => {
    const { query } = fakeDarkSchemeQuery(false);
    vi.stubGlobal('matchMedia', () => query);
    try {
      const ancestor = document.createElement('div');
      const container = document.createElement('div');
      ancestor.append(container);
      document.body.append(ancestor);
      const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });
      const events: unknown[] = [];
      shell.on('themeChange', (change) => {
        events.push(change);
      });

      shell.destroy();
      ancestor.setAttribute('data-fg-theme', 'dark');
      await flushMutationObserver();

      expect(events).toEqual([]);
      ancestor.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('[S2-A3] one changeset, one layout pass, one frame (D-S2-15/16)', () => {
  it('a 500-entry transaction updating every entry yields one change, one computeFrame, one sync, and an unchanged height index', () => {
    // Installed before construction so the shell's own first render (#22) is call #0 — the only way
    // to reach the `FrameLayout` instance this shell owns and read its pre-transaction revision.
    const computeFrameSpy = vi.spyOn(FrameLayout.prototype, 'computeFrame');
    const dataset = new DatasetState({ entries: tallEntries(500), timeZone });
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const backendSyncCalls = { count: 0 };
    const shell = paintedShell({
      wiring: {},
      container,
      dataset,
      scale,
      backend: countingDomBackend(backendSyncCalls),
    });

    const layout = computeFrameSpy.mock.instances[0] as unknown as FrameLayout;
    const revisionBefore = layout.heightIndexRevision;
    let changeCalls = 0;
    dataset.on('change', () => {
      changeCalls++;
    });
    computeFrameSpy.mockClear();
    backendSyncCalls.count = 0;

    dataset.transaction(() => {
      for (const entry of dataset.entries.all) {
        dataset.entries.update(entry.id, { name: `${entry.name} (updated)` });
      }
    });
    shell.render(); // flushes the one frame the transaction's `change` requested (D-S2-15)

    expect(changeCalls).toBe(1);
    expect(computeFrameSpy).toHaveBeenCalledTimes(1);
    expect(backendSyncCalls.count).toBe(1);
    // Only `updated` rows: the row-height index's cache key (rowCount, rowHeight) is untouched, so
    // no fresh index is built (D-S2-16).
    expect(layout.heightIndexRevision).toBe(revisionBefore);

    computeFrameSpy.mockRestore();
    shell.destroy();
  });
});

// S3.2 (D-S3-6/D-S3-9): view/ may not import interaction/ (view-boundary), so these tests drive the
// injected `EntrySelectionContext.setHovered` directly rather than a real `attachEntryGestures` —
// `interaction/entry-gestures.test.ts` already covers that the real attachment reports hover
// correctly; this file's job is what the shell does with the report.
describe('GanttShell hot path (S3.2, D-S3-6/D-S3-9, [S3-A3])', () => {
  it('[S3-A3] hovering every mounted bar of a 1,000-entry fixture calls no computeFrame, creates/removes no nodes, and writes O(changed bars) data-state', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      let hover: ((barId: BarId | undefined) => void) | undefined;
      const shell = paintedShell({
        container,
        dataset: fakeDataset(tallEntries(1000)),
        overscan: { verticalRows: 200 },
        wiring: {
          entryGestures: (_pane, _rowLayer, _container, ctx) => {
            hover = (barId) => ctx.setHovered(barId);
            return { detach() {} };
          },
        },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 320 }); // 10 visible rows @ 32px
      shell.render();

      const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
      expect(bars.length).toBeGreaterThanOrEqual(200);

      const computeFrameSpy = vi.spyOn(FrameLayout.prototype, 'computeFrame');
      let mutations = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) mutations += record.addedNodes.length + record.removedNodes.length;
      });
      observer.observe(container, { childList: true, subtree: true });

      // D-S3-20: each hover step touches only the bar(s) whose token set actually changed — never
      // every mounted bar. `setAttribute('data-state', ...)` is the one write `paintDataState` makes,
      // so counting it directly (rather than inferring it from mutations, which also covers
      // `data-movable`/handle moves) is what tells O(changed bars) apart from O(mounted bars).
      const setAttributeSpy = vi.spyOn(HTMLElement.prototype, 'setAttribute');

      for (const bar of bars) hover?.(bar.dataset['barId'] as BarId);
      hover?.(undefined);

      observer.disconnect();
      expect(computeFrameSpy).not.toHaveBeenCalled();
      expect(mutations).toBe(0);
      const dataStateWrites = setAttributeSpy.mock.calls.filter(([name]) => name === 'data-state').length;
      // Each of the `bars.length` steps writes `data-state` six times at most: two bars (the newly
      // hovered one and the previously hovered one) and two rows (same pair), each row painting its
      // grid node and its timeline band. The final clear costs the same six. A per-mounted-bar write
      // pattern would instead scale with `bars.length * bars.length`, which is the shape this ceiling
      // exists to catch — the constant is not the point.
      expect(dataStateWrites).toBeLessThanOrEqual(bars.length * 6 + 6);

      setAttributeSpy.mockRestore();
      computeFrameSpy.mockRestore();
      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[R5-F7] hovering with a sole selection over a 1,000-entry fixture never re-ranks the row plan', () => {
    // Review finding 7: `#refreshAffordances` used to read the public `selectedEntryIds` getter,
    // which ranks and sorts every planned row to answer a question `projectAffordances` never asked
    // beyond "is there exactly one, and which?" — the sole-selection fallback below is exactly the
    // case that used to pay for it. `FrameLayout.plannedRows` is `#rowRankByEntryId`'s only caller.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      let hover: ((barId: BarId | undefined) => void) | undefined;
      const shell = paintedShell({
        container,
        dataset: fakeDataset(tallEntries(1000)),
        overscan: { verticalRows: 200 },
        wiring: {
          entryGestures: (_pane, _rowLayer, _container, ctx) => {
            hover = (barId) => ctx.setHovered(barId);
            return { detach() {} };
          },
        },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 320 }); // 10 visible rows @ 32px
      shell.render();
      shell.selection = [entryId('e0')];

      const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
      expect(bars.length).toBeGreaterThanOrEqual(200);

      const plannedRowsSpy = vi.spyOn(FrameLayout.prototype, 'plannedRows');

      for (const bar of bars) hover?.(bar.dataset['barId'] as BarId);
      hover?.(undefined);

      expect(plannedRowsSpy).not.toHaveBeenCalled();

      plannedRowsSpy.mockRestore();
      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // Retired (ADR 0026, #421): `#forgetSegmentsTheDatasetDropped` and its `entries.entryIdOfSegment`
  // pruning index are both gone. Selection holds Entry ids now, so a commit needs no Segment→Entry
  // lookup to prune a stale id — there is no such index left to spy on.

  it('movableBarId/resizableEntryId follow the hovered entry, gated by capability (D-S3-6/D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = fakeDataset(entries);
    let hover: ((barId: BarId | undefined) => void) | undefined;
    const shell = paintedShell({
      container,
      dataset,
      capabilities: { resize: false },
      wiring: {
        entryGestures: (_pane, _rowLayer, _container, ctx) => {
          hover = (barId) => ctx.setHovered(barId);
          return { detach() {} };
        },
      },
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    hover?.(bar.dataset['barId'] as BarId);

    expect(bar.hasAttribute('data-movable')).toBe(true);
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true); // resize: false — no handle even though it is hovered

    hover?.(undefined);
    expect(bar.hasAttribute('data-movable')).toBe(false);

    shell.destroy();
  });

  it('resizableEntryId falls back to the sole selected entry when nothing is hovered (D-S3-6)', () => {
    const container = document.createElement('div');
    const shell = paintedShell({ wiring: {}, container, dataset: fakeDataset(entries) });

    shell.selection = [entryId('t1')];
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(false);

    shell.destroy();
  });

  it('selectableEntriesOf answers every selectable Entry a packed row owns (#185)', () => {
    const owned: StoredEntry[] = [
      {
        id: entryId('one'),
        name: 'one',
        start: rangeStart,
        end: rangeEnd,
        props: {},
        siblingIndex: 0,
      },
      {
        id: entryId('two'),
        name: 'two',
        start: rangeStart,
        end: rangeEnd,
        props: {},
        siblingIndex: 1,
      },
      {
        id: entryId('three'),
        name: 'three',
        start: rangeStart,
        end: rangeEnd,
        props: {},
        siblingIndex: 2,
      },
    ];
    const container = document.createElement('div');
    let ctx: EntryGestureContext | undefined;
    const shell = paintedShell({
      container,
      dataset: fakeDataset(owned),
      rowSource: {
        source: 'custom',
        resolve: () => [{ id: 'packed', entryIds: owned.map((entry) => String(entry.id)) }],
      },
      // The middle Entry refuses `select`, so the row keeps the other two (I14: one resolution).
      capabilities: { select: (entry) => entry.id !== owned[1]!.id },
      wiring: {
        entryGestures: (_pane, _rowLayer, _host, gestureCtx) => {
          ctx = gestureCtx;
          return { detach() {} };
        },
      },
    });

    const row = container.querySelector<HTMLElement>('.fg-row')!;
    expect(ctx!.selection.selectableEntriesOf({ kind: 'row', rowId: rowId(row.dataset['rowId']!) })).toEqual([
      owned[0]!.id,
      owned[2]!.id,
    ]);
    // A row id no frame carries answers nothing, rather than throwing.
    expect(ctx!.selection.selectableEntriesOf({ kind: 'row', rowId: rowId('absent') })).toEqual([]);

    shell.destroy();
  });
});

// T1-6 (#246 S2-3): the map a drag preview reads through `committedEntriesById()` (I5) must not be
// rebuilt on every rAF frame. `entries.storedValues` is the store's own index, so there is no copy
// and nothing to rebuild — the shell's hand-rolled memo is gone (ADR 0017, `J20`). Request-building
// moved to `api/dataset.ts`'s `extraEditsFor` (#466), so `extraEditsFor` itself now sees only the
// draft; this samples the same public `entries.storedValues` index `#measuredFrom` reads internally,
// once per frame, wiring an `extraEditsFor` hook only to get one call per preview frame to sample at.
describe("GanttShell's committed stored rows (I5, #246 S2-3)", () => {
  it('hands one Map identity to every preview frame, across a commit, with no copy (J20)', async () => {
    const dataset = new DatasetState({
      entries: [
        { id: 't1', name: 't1', start: '2026-09-01', end: '2026-09-03' },
        { id: 't2', name: 't2', start: '2026-09-01', end: '2026-09-03' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    let ctx: EntryGestureContext | undefined;
    const seenMaps: ReadonlyMap<EntryId, StoredEntry>[] = [];
    const shell = paintedShell({
      container,
      dataset,
      extraEditsFor: () => {
        seenMaps.push(dataset.entries.storedValues);
        return new Map();
      },
      wiring: {
        entryGestures: (_pane, _rowLayer, _host, gestureCtx) => {
          ctx = gestureCtx;
          return { detach() {} };
        },
      },
    });

    const session = ctx!.session(entryId('t1'), { kind: 'move' })!;

    session.preview(10);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    session.preview(20);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(seenMaps).toHaveLength(2);
    expect(seenMaps[1]).toBe(seenMaps[0]); // same revision, same Map identity — no rebuild (I5)

    // A commit elsewhere changes what the index holds, and not which index it is: the store hands
    // out `#byId` read-only, and nothing keys a memo on its identity (`J20`).
    dataset.entries.update('t2', { name: 't2 renamed' });

    session.preview(30);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(seenMaps).toHaveLength(3);
    expect(seenMaps[2]).toBe(seenMaps[1]);
    expect(seenMaps[2]!.get(entryId('t2'))?.name).toBe('t2 renamed');

    session.cancel();
    shell.destroy();
  });
});

describe('a load resets the view (#496 L2)', () => {
  function loadFixture(): { dataset: DatasetState; shell: GanttShell } {
    const dataset = new DatasetState({
      entries: [
        { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    const shell = paintedShell({
      wiring: {},
      container,
      dataset,
      selectedEntryIds: ['c'],
      collapsed: [rowId('p')],
    });
    return { dataset, shell };
  }

  it("clears the selection — every previously-live id sits in the load ChangeSet's own `removed`", () => {
    const { dataset, shell } = loadFixture();
    expect(shell.selectedEntryIds).toEqual([entryId('c')]);

    dataset.entries.load([{ id: 'x', name: 'Fresh', start: '2026-02-01', end: '2026-02-05' }]);

    expect(shell.selectedEntryIds).toEqual([]);
    shell.destroy();
  });

  it('resets collapse state to what the Gantt started with, dropping a collapse made since', () => {
    const { dataset, shell } = loadFixture();
    shell.collapse('c'); // c has no children, but this only tests the id lands in the set
    expect(shell.collapsed.map(String)).toEqual(expect.arrayContaining(['p', 'c']));

    dataset.entries.load([{ id: 'x', name: 'Fresh', start: '2026-02-01', end: '2026-02-05' }]);

    expect(shell.collapsed).toEqual([rowId('p')]);
    shell.destroy();
  });

  it('keeps scroll position and zoom — view settings, not data (L2)', () => {
    const dataset = new DatasetState({
      entries: [
        { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, fit: 0.00001 });
    const scrollX = new ScrollAxis();
    const shell = paintedShell({ wiring: {}, container, dataset, scale, scroll: { x: scrollX } });
    shell.zoomBy(2);
    scrollX.panTo(scrollX.state.max);
    const pxPerMsBefore = scale.scale.pxPerMs;
    const positionBefore = scrollX.state.position;

    dataset.entries.load([{ id: 'x', name: 'Fresh', start: '2026-02-01', end: '2026-02-05' }]);

    expect(scale.scale.pxPerMs).toBe(pxPerMsBefore);
    expect(scrollX.state.position).toBe(positionBefore);
    shell.destroy();
  });

  it('an id both the old data and the load name keeps no old selection or collapse state (L1)', () => {
    const dataset = new DatasetState({
      entries: [
        { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    // No `collapsed` option: this Gantt starts with nothing collapsed.
    const shell = paintedShell({ wiring: {}, container, dataset, selectedEntryIds: ['p'] });
    shell.collapse('p');
    expect(shell.selectedEntryIds).toEqual([entryId('p')]);
    expect(shell.collapsed).toEqual([rowId('p')]);

    // 'p' names an entry both the old data and the load below name — L1 says a kept id keeps no
    // per-entry view state, so it must come back neither selected nor collapsed.
    dataset.entries.load([{ id: 'p', name: 'Reloaded parent', start: '2026-02-01', end: '2026-02-05' }]);

    expect(shell.selectedEntryIds).toEqual([]);
    expect(shell.collapsed).toEqual([]); // back to this Gantt's own starting state, not kept
    shell.destroy();
  });
});

describe('a sync leaves the view alone (#517)', () => {
  function syncFixture(): { dataset: DatasetState; shell: GanttShell } {
    const dataset = new DatasetState({
      entries: [
        { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
        { id: 'gone', name: 'Gone', start: '2026-01-01', end: '2026-01-05' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    const shell = paintedShell({
      wiring: {},
      container,
      dataset,
      selectedEntryIds: ['c', 'gone'],
      collapsed: [rowId('p')],
    });
    return { dataset, shell };
  }

  it('a selected kept id stays selected, and a selected removed id drops', () => {
    const { dataset, shell } = syncFixture();
    expect(shell.selectedEntryIds).toEqual([entryId('c'), entryId('gone')]);

    dataset.entries.sync([
      { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
      { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
    ]);

    expect(shell.selectedEntryIds).toEqual([entryId('c')]);
    shell.destroy();
  });

  it('a collapsed kept parent stays collapsed', () => {
    const { dataset, shell } = syncFixture();
    expect(shell.collapsed).toEqual([rowId('p')]);

    dataset.entries.sync([
      { id: 'p', name: 'Parent renamed', start: '2026-01-01', end: '2026-01-10' },
      { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
    ]);

    expect(shell.collapsed).toEqual([rowId('p')]);
    shell.destroy();
  });

  it('does not move scrollTop — a sync is not a new baseline', () => {
    const dataset = new DatasetState({
      entries: [
        { id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
      ],
      timeZone: 'UTC',
    });
    const container = document.createElement('div');
    const scrollY = new ScrollAxis();
    const shell = paintedShell({ wiring: {}, container, dataset, scroll: { y: scrollY } });
    scrollY.panTo(scrollY.state.max);
    const positionBefore = scrollY.state.position;
    expect(positionBefore).toBeGreaterThan(0);

    dataset.entries.sync([
      { id: 'p', name: 'Parent renamed', start: '2026-01-01', end: '2026-01-10' },
      { id: 'c', name: 'Child', parentId: 'p', start: '2026-01-01', end: '2026-01-05' },
    ]);

    expect(scrollY.state.position).toBe(positionBefore);
    shell.destroy();
  });

  it('a sync with no changes requests no frame', async () => {
    const dataset = new DatasetState({
      entries: [{ id: 'p', name: 'Parent', start: '2026-01-01', end: '2026-01-10' }],
      timeZone: 'UTC',
    });
    const calls = { count: 0 };
    const shell = paintedShell({
      wiring: {},
      container: document.createElement('div'),
      dataset,
      backend: countingDomBackend(calls),
    });
    // The first paint's own layout settles one frame after construction (its header/viewport
    // geometry request, unrelated to any dataset write) — wait it out before the count below,
    // so it does not read as a frame the no-op sync requested.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    calls.count = 0;

    dataset.entries.sync(dataset.entries.all.map((entry) => entry.toInput()));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(calls.count).toBe(0);
    shell.destroy();
  });
});
