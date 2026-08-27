import { describe, expect, it, vi } from 'vitest';
import { GanttShell } from './gantt-shell.js';
import type { GanttShellOptions } from './gantt-shell.js';
import { ScrollModel, TimeScaleModel } from '../layout/index.js';
import { entryId, EntryNotFoundError, ContainerNotFoundError } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';
import { EntryStore } from '../data/index.js';

// D-S2-2: `GanttShellOptions.dataset` is a store view now, not a plain array — the real `EntryStore`
// backs these fixtures the same way a `Dataset` would, with no test-only fake to keep in sync.
function fakeDataset(entries: readonly Entry[]): GanttShellOptions['dataset'] {
  return { entries: new EntryStore(entries), timeZone };
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
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const timeZone = 'UTC';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-06T00:00:00Z'); // 5 days

const entries: Entry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
  },
];

function tallEntries(count: number): Entry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: entryId(`e${i}`),
    name: `Entry ${i}`,
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
  }));
}

describe('GanttShell header band', () => {
  it('renders one tick per day for the day preset', () => {
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = new GanttShell({ container, dataset: fakeDataset(entries), scale });

    const ticks = container.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.textContent).toBe('2026-09-01');

    shell.destroy();
    expect(container.children.length).toBe(0);
  });

  it('re-renders when a second Gantt binds to the same shared scale (#6, D9)', () => {
    // No pinned range: the scale fits every bound dataset, so binding B widens the span A reads from.
    const scale = new TimeScaleModel();
    const containerA = document.createElement('div');
    const shellA = new GanttShell({ container: containerA, dataset: fakeDataset(entries), scale });

    const initialTickCount = containerA.querySelectorAll('.fg-header .fg-tick').length;

    const containerB = document.createElement('div');
    const widerEntries: Entry[] = [
      {
        id: entryId('w1'),
        name: 'W1',
        start: rangeStart,
        end: instant('2026-09-20T00:00:00Z'),
      },
    ];
    const shellB = new GanttShell({
      container: containerB,
      dataset: fakeDataset(widerEntries),
      scale,
    });

    // A never called render() itself after B bound — the notify from B's bind is what pushed this.
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

    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('48px');

    shell.destroy();
    container.remove();
  });

  it('falls back to a default when --fg-row-height is unset', () => {
    const container = document.createElement('div');
    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.style.height).toBe('32px');
    shell.destroy();
  });
});

describe('GanttShell.destroy()', () => {
  it('is idempotent — a second call does not throw or double-unbind (#34)', () => {
    const container = document.createElement('div');
    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });

    expect(() => {
      shell.destroy();
      shell.destroy();
    }).not.toThrow();
  });
});

describe('scroll (D9, #9)', () => {
  it('constructs a private default ScrollModel when scroll is omitted', () => {
    const container = document.createElement('div');
    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });
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

  it('two shells sharing one ScrollModel both contribute to the shared max (U1/U2)', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scroll = new ScrollModel();
      const containerA = document.createElement('div');
      const containerB = document.createElement('div');

      const shellA = new GanttShell({
        container: containerA,
        dataset: fakeDataset(tallEntries(50)),
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });
      const shellB = new GanttShell({
        container: containerB,
        dataset: fakeDataset(tallEntries(50)),
        scroll,
      });
      FakeResizeObserver.instances[1]!.fire({ width: 500, height: 100 });

      // 50 rows * 32px default row height = 1600, in a 100px pane -> max.y 1500 for either chart.
      expect(scroll.state.max.y).toBe(1500);

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
      const scroll = new ScrollModel();
      const container = document.createElement('div');

      const shell = new GanttShell({ container, dataset: fakeDataset(tallEntries(50)), scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 320 }); // 10 rows @ 32px

      const labelsAt = (): string[] =>
        Array.from(container.querySelectorAll('.fg-row'), (row) => row.textContent ?? '');

      expect(labelsAt()).toContain('Entry 0');
      expect(labelsAt()).not.toContain('Entry 40');

      scroll.panTo({ y: 40 * 32 }); // scroll 40 rows down

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
      const scroll = new ScrollModel();
      const shortContainer = document.createElement('div');
      const tallContainer = document.createElement('div');

      const shortShell = new GanttShell({
        container: shortContainer,
        dataset: fakeDataset(tallEntries(5)),
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });
      const tallShell = new GanttShell({
        container: tallContainer,
        dataset: fakeDataset(tallEntries(500)),
        scroll,
      });
      FakeResizeObserver.instances[1]!.fire({ width: 500, height: 100 });

      // Loosest bound across both bindings: the tall chart's 500*32-100=15900 dwarfs the short
      // chart's 5*32-100=60 (D-S1.5-1) — proving both extents actually reached the shared model.
      expect(scroll.state.max.y).toBe(500 * 32 - 100);

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

    const shell = new GanttShell({ container: '#target', dataset: fakeDataset(entries) });
    expect(container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);

    shell.destroy();
    container.remove();
  });

  it('throws naming the selector when nothing matches', () => {
    expect(() => new GanttShell({ container: '#does-not-exist', dataset: fakeDataset(entries) })).toThrow(
      /does-not-exist/,
    );
  });

  it('throws a typed ContainerNotFoundError with code "container-not-found" (D-S1.8-9)', () => {
    let caught: unknown;
    try {
      new GanttShell({ container: '#does-not-exist', dataset: fakeDataset(entries) });
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
    const shell = new GanttShell({ container, dataset: fakeDataset(rowEntries) });

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

    for (let i = 0; i < rows.length; i++) {
      expect(translateY(rows[i]!)).toBe(translateBarY(bars[i]!));
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
      const shell = new GanttShell({ container, dataset: fakeDataset(entries), scale, gridWidth: 300 });
      FakeResizeObserver.instances[0]!.fire({ width: 653, height: 400 });

      const sizer = container.querySelector<HTMLElement>('.fg-timeline-pane [aria-hidden="true"]')!;
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
  it('a live resize reaches both TimeScaleModel and ScrollModel, re-renders, and destroy() detaches', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scale = new TimeScaleModel(); // range: 'fitDataset' — pxPerMs depends on paneWidth
      const scroll = new ScrollModel();
      const container = document.createElement('div');
      const tall = Array.from({ length: 50 }, (_, i) => ({
        id: entryId(`e${i}`),
        name: `Entry ${i}`,
        start: rangeStart,
        end: instant('2026-09-03T00:00:00Z'),
      }));
      const shell = new GanttShell({ container, dataset: fakeDataset(tall), scale, scroll });

      // Exactly one observer for this one Gantt.
      expect(FakeResizeObserver.instances).toHaveLength(1);
      expect(FakeResizeObserver.instances[0]!.observedCount).toBe(1);

      // A stand-in for pxPerMs (not on the public TimeScale interface, plans/01 §1): the pixel
      // distance the scale assigns to one fixed instant span. It moves iff pxPerMs moved.
      const oneDayWidth = (): number => scale.scale.xForInstant(instant('2026-09-02T00:00:00Z'));
      const widthBefore = oneDayWidth();
      const maxYBefore = scroll.state.max.y;

      FakeResizeObserver.instances[0]!.fire({ width: 900, height: 400 });

      // TimeScaleModel: a new paneWidth re-fits pxPerMs.
      expect(oneDayWidth()).not.toBe(widthBefore);
      // ScrollModel: a new pane height moves max.y (50 * 32 - 400 = 1200).
      expect(scroll.state.max.y).toBe(1200);
      expect(scroll.state.max.y).not.toBe(maxYBefore);
      // Re-rendered with the new geometry — no remount, the container keeps its band wrapper.
      expect(container.querySelector('.fg-band')).not.toBeNull();

      shell.destroy(); // unbind() also drops this shell's own contribution to the shared max.
      const widthAfterDestroy = oneDayWidth();
      const maxYAfterDestroy = scroll.state.max.y;
      FakeResizeObserver.instances[0]!.fire({ width: 100, height: 50 });
      // detach() unhooked the observer: a later fire reaches neither model.
      expect(oneDayWidth()).toBe(widthAfterDestroy);
      expect(scroll.state.max.y).toBe(maxYAfterDestroy);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('preset/range/zoom/overscan/zoomTo/zoomBy/reveal (S1.9, D-S1.9-9)', () => {
  it('preset/range/zoom/overscan accessors delegate straight to the bound Viewport', () => {
    const container = document.createElement('div');
    const shell = new GanttShell({ container, dataset: fakeDataset(entries) });

    expect(shell.zoom).toBe('fitViewport');
    shell.zoom = { pxPerMs: 2 };
    expect(shell.zoom).toEqual({ pxPerMs: 2 });

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
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd }, zoom: { pxPerMs: 1 } });
    const shell = new GanttShell({ container, dataset: fakeDataset(entries), scale });

    shell.zoomBy(2);
    expect(scale.scale.pxPerMs).toBe(2);

    shell.zoomTo(0.5);
    expect(scale.scale.pxPerMs).toBe(0.5);

    shell.destroy();
  });

  it('reveal(entryId) pans the bound ScrollModel to bring an off-screen row into view; unknown id throws', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const rowEntries = tallEntries(50);
      const shell = new GanttShell({ container, dataset: fakeDataset(rowEntries), scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 500, height: 100 });

      expect(scroll.state.position.y).toBe(0);
      shell.reveal(entryId('e40'));
      expect(scroll.state.position.y).toBeGreaterThan(0);

      expect(() => shell.reveal(entryId('does-not-exist'))).toThrow(EntryNotFoundError);

      shell.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a11y roles and the one honest tab stop (S1.10, D-S1.10-5)', () => {
  it('gives the container role="group", a live aria-label, and the only tabindex="0" in the whole render tree', () => {
    const container = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = new GanttShell({
      container,
      dataset: fakeDataset(entries),
      scale,
      a11yLabel: 'Room bookings',
    });

    expect(container.getAttribute('role')).toBe('group');
    expect(container.getAttribute('aria-label')).toBe('Room bookings');
    expect(container.getAttribute('tabindex')).toBe('0');

    // querySelectorAll only matches descendants, not container itself — container's own tabindex is asserted
    // above; this proves nothing *inside* it claims a second tab stop.
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);

    shell.a11yLabel = 'Renamed plan';
    expect(container.getAttribute('aria-label')).toBe('Renamed plan');

    shell.destroy();
  });
});
