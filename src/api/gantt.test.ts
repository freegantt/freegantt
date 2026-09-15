import { describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import {
  DuplicatePluginIdError,
  RevealTargetNotFoundError,
  PluginNotInstalledError,
  RegistrationClosedError,
  RendererAlreadyRegisteredError,
  ScrollModel,
  UnknownCommandError,
  UnknownGridColumnError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  TimeScaleModel,
  MS,
  entryId,
  itemId,
  contextMenu,
  diamond,
} from './index.js';
import type {
  ChangeSet,
  DataPlugin,
  EditExtender,
  Entry,
  ErrorReport,
  GanttDom,
  ChromePlugin,
  GridColumnInput,
  PluginContext,
  SegmentId,
  TimeUnit,
} from './index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { instant } from '../time/index.js';

/** What a row's dates read now. A "before" reading is a value, never a row: one `Entry` per id, and
 *  every read is live, so a held row always agrees with itself (ADR 0017 rule 2). */
function datesOf(entry: Entry): { start: Entry['start']; end: Entry['end'] } {
  return { start: entry.start, end: entry.end };
}

// [S5-A3]: the acceptance object is the harness plugin itself, not a re-implementation of its four
// seams — a regression in bufferKind() must fail this test (issue #153).
import { bufferKind } from '../../harness/plugins/buffer-kind.js';
import { riskKind } from '../../harness/plugins/risk-kind.js';

// happy-dom does no layout, so a real ResizeObserver never fires (same seam gantt-shell.test.ts
// stubs globally — Gantt/GanttShell wire attachPaneSize themselves and take no ResizeObserverCtor
// option, #8).
type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {}
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

describe('Gantt', () => {
  it('mounts fixture entries as bars in the container element', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
    const bars = container.querySelectorAll('.fg-bar');
    expect(bars.length).toBe(sampleEntries.length);
    gantt.destroy();
  });

  it('two Gantt instances on one page have fully independent state (I2)', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    const ganttA = new Gantt({
      container: containerA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 5), timeZone: 'UTC' }),
    });
    const ganttB = new Gantt({
      container: containerB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' }),
    });

    expect(containerA.querySelectorAll('.fg-bar').length).toBe(5);
    expect(containerB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttA.destroy();
    expect(containerA.children.length).toBe(0);
    expect(containerB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttB.destroy();
  });

  it('two Gantt instances sharing one TimeScaleModel compute identical bar positions (D9 seam)', () => {
    const scale = new TimeScaleModel({
      range: { start: sampleEntries[0]!.start!, end: sampleEntries[0]!.end! },
    });
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    const ganttA = new Gantt({
      container: containerA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });
    const ganttB = new Gantt({
      container: containerB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });

    const xOf = (container: HTMLElement): string[] =>
      Array.from(container.querySelectorAll<HTMLElement>('.fg-bar')).map((el) => el.style.transform);

    expect(xOf(containerA)).toEqual(xOf(containerB));

    ganttA.destroy();
    ganttB.destroy();
  });
});

describe('Gantt.dataset (#226)', () => {
  it('hands back the very Dataset it was constructed with', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.dataset).toBe(dataset);

    gantt.destroy();
  });

  it('two Gantts on one page each hand back their own Dataset (I2)', () => {
    const datasetA = new Dataset({ entries: sampleEntries.slice(0, 5), timeZone: 'UTC' });
    const datasetB = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const ganttA = new Gantt({ container: document.createElement('div'), dataset: datasetA });
    const ganttB = new Gantt({ container: document.createElement('div'), dataset: datasetB });

    expect(ganttA.dataset).toBe(datasetA);
    expect(ganttB.dataset).toBe(datasetB);

    ganttA.destroy();
    ganttB.destroy();
  });

  it("keeps the consumer's declared Field types, so a helper needs no cast", () => {
    // The point of the getter: `gantt.dataset` is the caller's own `Dataset<TProps>`, not a
    // widened one. A widened return would push every consumer helper back to the cast the getter
    // exists to retire. This reads `cost` as a `number` with no annotation of its own.
    const container = document.createElement('div');
    const dataset = new Dataset<{ cost?: number }>({
      entries: [{ id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03', props: { cost: 42 } }],
      timeZone: 'UTC',
      fields: [{ key: 'cost' }],
    });
    const gantt = new Gantt({ container, dataset });

    const cost: number | undefined = gantt.dataset.entries.get('a')?.read('cost');
    expect(cost).toBe(42);
    // And the write half: `cost` is a declared key on this Dataset, so it is legal here.
    gantt.dataset.entries.update('a', { cost: 43 });
    expect(gantt.dataset.entries.get('a')?.read('cost')).toBe(43);

    gantt.destroy();
  });

  it('reads live undo state, the pair the toolbar drives its buttons from', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.dataset.canUndo).toBe(false);
    dataset.entries.update(sampleEntries[0]!.id, { name: 'renamed' });
    expect(gantt.dataset.canUndo).toBe(true);

    gantt.destroy();
  });
});

describe('Gantt preset/range/fit/zoomTo/zoomBy/reveal (S1.9)', () => {
  it('[S1-A3] a preset switch redraws the axis but keeps bar DOM identity (I8)', async () => {
    // Regression coverage for a measured pane under the default 'pane' fit: pxPerMs there
    // does not depend on the preset, so this must exercise a real ResizeObserver measurement
    // (not an unmeasured 0-width pane, where pxPerMs happens to depend on the preset anyway and
    // would pass even if the notify path were broken).
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const before = container.querySelector<HTMLElement>('.fg-bar');
      expect(container.querySelectorAll('.fg-header .fg-band')).toHaveLength(1);

      gantt.preset = 'weekAndMonth';
      // D-S2-15: the preset change's render request is coalesced onto the next animation frame.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const after = container.querySelector<HTMLElement>('.fg-bar');
      expect(after).toBe(before);
      expect(gantt.preset.id).toBe('weekAndMonth');
      expect(container.querySelectorAll('.fg-header .fg-band')).toHaveLength(2);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('U4: reveal(id) moves the bound ScrollModel to bring an off-screen entry into view', () => {
    // Reads the ScrollModel a caller shared, not the element's scrollLeft/scrollTop — I12 confines
    // that read to view/scroll-attachment.ts; scroll-attachment.test.ts and e2e/scroll-sync.spec.ts
    // already prove the model's position lands on the live element.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(scroll.state.position.x).toBe(0);

      // 'entry-50' starts weeks after the dataset's start — off-screen at a 300px pane, day preset.
      gantt.reveal(entryId('entry-50'));

      expect(scroll.state.position.x).toBeGreaterThan(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('U6: reveal throws RevealTargetNotFoundError for an id the dataset reads as neither an Entry nor a Segment (#227)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    let caught: unknown;
    try {
      gantt.reveal(entryId('does-not-exist'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RevealTargetNotFoundError);
    expect((caught as RevealTargetNotFoundError).code).toBe('reveal-target-not-found');

    gantt.destroy();
  });

  it('reveal(segmentId) reveals that one Segment, not the Entry envelope (ADR 0010, #212)', () => {
    // Three Segments on one Entry: `split-a` sits on-screen, `split-b` sits off-screen at a
    // moderate distance, and `split-c` sits far off-screen and sets the envelope's own end. Each
    // reveal target below reads a different geometry, so each expects a different scroll.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const dataset = new Dataset({
        entries: [
          {
            id: 'split',
            name: 'Split',
            start: '2026-09-01',
            end: '2026-11-05',
            segments: [
              { id: 'split-a', start: '2026-09-01', end: '2026-09-03' },
              { id: 'split-b', start: '2026-09-20', end: '2026-09-23' },
              { id: 'split-c', start: '2026-11-01', end: '2026-11-05' },
            ],
          },
        ],
        timeZone: 'UTC',
        // Exact instants, not "through that day" — keeps the geometry in this test arithmetic
        // (`dateOnlyEnd`'s default `'inclusive'` would add a day to every bare end date).
        dateOnlyEnd: 'exclusive',
      });
      const gantt = new Gantt({ container, dataset, fit: 'preset', preset: 'day', scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const split = dataset.entries.get('split')!;
      const segmentId = (id: string): SegmentId => split.segments.find((s) => s.id === id)!.id;

      gantt.reveal(segmentId('split-a'));
      expect(scroll.state.position.x).toBe(0);

      // Each of the next two reveals starts over from x 0, so "nearest edge" never has an already
      // off-screen far edge to snap back to — the two results are independently comparable.
      gantt.reveal(segmentId('split-b'));
      const afterB = scroll.state.position.x;
      expect(afterB).toBeGreaterThan(0);

      scroll.panTo({ x: 0 });
      gantt.reveal(entryId('split'));
      expect(scroll.state.position.x).toBeGreaterThan(afterB);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reveal resolves a colliding id as an Entry first — the stated precedence (ADR 0010, #212)', () => {
    // `EntryId` "x" is on-screen; a different Entry, "y", owns a Segment also named "x" and sitting
    // far off-screen. The two ids collide, and the doc comment states the Entry reading wins — this
    // pins that rule: revealing "x" must not scroll to "y"'s off-screen Segment.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const dataset = new Dataset({
        entries: [
          { id: 'x', name: 'EntryX', start: '2026-09-01', end: '2026-09-03' },
          {
            id: 'y',
            name: 'EntryY',
            start: '2026-11-01',
            end: '2026-11-05',
            segments: [{ id: 'x', start: '2026-11-01', end: '2026-11-05' }],
          },
        ],
        timeZone: 'UTC',
        dateOnlyEnd: 'exclusive',
      });
      const gantt = new Gantt({ container, dataset, fit: 'preset', preset: 'day', scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const collidingId = dataset.entries.get('y')!.segments[0]!.id;
      gantt.reveal(collidingId);

      // Entry "x" sits at the dataset's own start and is already on-screen — a no-op. Reading the
      // id as "y"'s Segment instead would scroll far to the right.
      expect(scroll.state.position.x).toBe(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('U7: shared scale+scroll, zoomBy on one Gantt is observed on the other live DOM', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scale = new TimeScaleModel({ fit: 'preset', preset: 'day' });
      const scroll = new ScrollModel();
      const containerA = document.createElement('div');
      const containerB = document.createElement('div');
      const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });

      const ganttA = new Gantt({ container: containerA, dataset, scale, scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      const ganttB = new Gantt({ container: containerB, dataset, scale, scroll });
      FakeResizeObserver.instances[1]!.fire({ width: 300, height: 100 });

      // The last bar, not the first: entry-1 starts at the dataset's own range start, so its x stays
      // 0 at any zoom — a vacuous check. A later entry's x scales with pxPerMs.
      const lastBarXOf = (container: HTMLElement): string => {
        const bars = container.querySelectorAll<HTMLElement>('.fg-bar');
        return bars[bars.length - 1]!.style.transform;
      };
      const before = lastBarXOf(containerA);
      expect(lastBarXOf(containerB)).toBe(before);

      ganttA.zoomBy(2);
      // D-S2-15: zoomBy's render request is coalesced onto the next animation frame, for both Gantts.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(lastBarXOf(containerA)).not.toBe(before);
      expect(lastBarXOf(containerB)).toBe(lastBarXOf(containerA));

      ganttA.destroy();
      ganttB.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // `scale` and `preset`/`range`/`fit` together are now a compile-time error on the public
  // `GanttOptions` (issue #84, finding #3) — see `gantt-shell.test.ts` for the runtime warning
  // GanttShell itself still carries for a caller who bypasses that type (there is none through
  // the public `Gantt` constructor).
});

// #195, D-S3-24: before `gantt.snap` existed, changing the snap alone meant
// `gantt.preset = { ...gantt.preset, snap }` — a one-off copy of a shipped preset, thrown away by
// the next zoom. The harness wrote that, which is how this was found.
describe('Gantt.snap (D-S3-24, #195)', () => {
  it('reads the showing preset when this Gantt states nothing, and no shipped preset states one', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.snap).toBe('tick');

    gantt.destroy();
  });

  it('takes a constructor option and reads it back', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: 'none' });

    expect(gantt.snap).toBe('none');

    gantt.destroy();
  });

  it('survives a zoom, which the preset copy it replaces did not', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, preset: 'dayAndWeek' });

    gantt.snap = { unit: 'day', increment: 2 };
    gantt.zoomOut();

    expect(gantt.preset.id).not.toBe('dayAndWeek');
    expect(gantt.snap).toEqual({ unit: 'day', increment: 2 });

    gantt.destroy();
  });

  it('undefined hands the answer back to the preset', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: 'none' });

    gantt.snap = undefined;

    expect(gantt.snap).toBe('tick');

    gantt.destroy();
  });

  // #201: a bad unit or a non-advancing increment used to store raw and throw two gestures later,
  // inside the drag that first called snapInstant/stepsBetween. The setter now catches both at
  // assignment.
  it('rejects a unit outside the supported set, and leaves the prior snap in place', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: 'none' });

    expect(() => {
      gantt.snap = { unit: 'fortnight' as TimeUnit, increment: 1 };
    }).toThrow(UnsupportedUnitError);
    expect(gantt.snap).toBe('none');

    gantt.destroy();
  });

  it.each([0, -1, 1.5])('rejects a non-positive-integer increment (%s)', (increment) => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: 'none' });

    expect(() => {
      gantt.snap = { unit: 'day', increment };
    }).toThrow(InvalidSnapIncrementError);
    expect(gantt.snap).toBe('none');

    gantt.destroy();
  });

  it('accepts a positive-integer increment on a supported unit', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.snap = { unit: 'day', increment: 2 };

    expect(gantt.snap).toEqual({ unit: 'day', increment: 2 });

    gantt.destroy();
  });

  it('is per Gantt, even when two Gantts share one axis (D9)', () => {
    const scale = new TimeScaleModel({ preset: 'dayAndWeek' });
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const ganttA = new Gantt({ container: document.createElement('div'), dataset, scale });
    const ganttB = new Gantt({ container: document.createElement('div'), dataset, scale });

    ganttA.snap = 'none';

    expect(ganttA.snap).toBe('none');
    expect(ganttB.snap).toBe('tick');

    ganttA.destroy();
    ganttB.destroy();
  });

  it('a real drag commits on the boundary this Gantt snaps to', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: { unit: 'day', increment: 1 } });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.setPointerCapture = vi.fn();
    timeline.releasePointerCapture = vi.fn();
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    // The dataset's zone is UTC, so a whole-day boundary is a whole number of days from the epoch.
    const moved = dataset.entries.get(id)!;
    expect(Number(moved.start) % MS.DAY).toBe(0);

    document.elementFromPoint = original;
    gantt.destroy();
  });
});

describe('Gantt.panToDate / panToToday (S1.12, D-S1.12-8)', () => {
  it("panToDate (align 'start', the default) moves the scroll off the dataset's own start", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(scroll.state.position.x).toBe(0);
      gantt.panToDate('2026-10-15T00:00:00Z');
      expect(scroll.state.position.x).toBeGreaterThan(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("align 'center' lands exactly gridWidth-independent half-pane-width left of align 'start', for the same date", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate('2026-10-15T00:00:00Z', 'start');
      const start = scroll.state.position.x;

      gantt.panToDate('2026-10-15T00:00:00Z', 'center');
      const center = scroll.state.position.x;

      expect(center).toBe(start - 150); // half of the 300px measured pane
      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[S1-A10] panToToday is panToDate(now(), align) — same resulting scroll position for the same instant', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const fakeNow = instant('2026-09-20T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToToday('center');
      const fromToday = scroll.state.position.x;

      gantt.panToDate(fakeNow, 'center');
      const fromDate = scroll.state.position.x;

      expect(fromToday).toBe(fromDate);
      gantt.destroy();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("[S1.13 follow-up] panToToday('start') lands todayLineMarginTicks left of panToDate(now(), 'start')", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const fakeNow = instant('2026-09-20T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate(fakeNow, 'start');
      const flush = scroll.state.position.x;

      gantt.panToToday('start');
      const withMargin = scroll.state.position.x;

      // Default margin (2 ticks of the 'day' preset): strictly left of the flush landing.
      expect(withMargin).toBeLessThan(flush);

      // align 'center' is untouched by the margin (S1.13 follow-up doc: "no effect on 'center'").
      gantt.panToDate(fakeNow, 'center');
      const centerFlush = scroll.state.position.x;
      gantt.panToToday('center');
      expect(scroll.state.position.x).toBe(centerFlush);

      gantt.destroy();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('todayLineMarginTicks is configurable, live, and constructor-settable', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const fakeNow = instant('2026-09-20T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
        todayLineMarginTicks: 0,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      expect(gantt.todayLineMarginTicks).toBe(0);

      // 0 ticks of margin: panToToday('start') lands exactly where panToDate('start') does.
      gantt.panToDate(fakeNow, 'start');
      const flush = scroll.state.position.x;
      gantt.panToToday('start');
      expect(scroll.state.position.x).toBe(flush);

      // Raising it live moves the landing further left of the flush position.
      gantt.todayLineMarginTicks = 5;
      gantt.panToToday('start');
      expect(scroll.state.position.x).toBeLessThan(flush);

      gantt.destroy();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('a date outside the dataset range still pans — clamped to the scroll bound, not thrown', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(() => gantt.panToDate('1990-01-01T00:00:00Z')).not.toThrow();
      expect(scroll.state.position.x).toBe(0); // well before range.start, clamped down to 0

      expect(() => gantt.panToDate('2099-01-01T00:00:00Z')).not.toThrow();
      expect(scroll.state.position.x).toBe(scroll.state.max.x); // well past range.end, clamped up

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('panToDate accepts an epoch number and lands at the same x as the ISO string (U6)', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate('2026-10-15T00:00:00Z');
      const fromString = scroll.state.position.x;

      // A Date object is `toInstant`'s job (`time/input.test.ts`); I10 bans `new Date()` here.
      gantt.panToDate(Date.parse('2026-10-15T00:00:00Z'));
      expect(scroll.state.position.x).toBe(fromString);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Gantt locale / todayLine (S1.12, D-S1.12-12 / D-S1.12-14)', () => {
  it('[S1-A10] locale = ja-JP re-labels the header with no bar remount (I8)', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        locale: 'en-US',
        preset: 'monthAndYear',
        fit: 'preset',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const barBefore = container.querySelector<HTMLElement>('.fg-bar');
      const labelsOf = (): string => {
        const labels: string[] = [];
        for (const node of Array.from(container.querySelectorAll('.fg-tick'))) {
          if (node instanceof HTMLElement) labels.push(node.textContent ?? '');
        }
        return labels.join('|');
      };
      const labelBefore = labelsOf();
      expect(labelBefore).toBeTruthy();

      gantt.locale = 'ja-JP';
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(container.querySelector<HTMLElement>('.fg-bar')).toBe(barBefore);
      expect(labelsOf()).not.toBe(labelBefore);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[S1-A10] todayLine = false removes .fg-date-line', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        fit: 'preset',
        preset: 'year',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(container.querySelector('.fg-date-line')).not.toBeNull();
      expect(container.querySelector<HTMLElement>('.fg-date-line')!.hidden).toBe(false);

      gantt.todayLine = false;
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(container.querySelector('.fg-date-line')).toBeNull();

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Gantt dateLines (S1.13)', () => {
  it("[S1-A11] a dateLines entry with a label renders a .fg-date-line-label at the line's x; one without a label renders no Date line label", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        fit: 'preset',
        preset: 'year',
        todayLine: false,
        dateLines: [{ placeAt: '2026-06-01', label: 'Launch' }, { placeAt: '2027-06-01' }],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const labels = container.querySelectorAll<HTMLElement>('.fg-date-line-label');
      expect(labels).toHaveLength(1);
      expect(labels[0]!.textContent).toBe('Launch');
      const lines = container.querySelectorAll<HTMLElement>('.fg-date-line');
      expect(lines).toHaveLength(2);
      // The stroke's transform is x-only (translateX); the label's carries a second, always-zero
      // component under the default placement (#318, D-S1.10-6 — the px nudge a non-default
      // placement would carry travels the same property).
      const x = /^translateX\((.+)\)$/.exec(lines[0]!.style.transform)?.[1];
      expect(labels[0]!.style.transform).toBe(`translate(${x}, 0px)`);
      expect(labels[0]!.dataset['placement']).toBe('belowHeader');

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[S1-A12] .fg-today-line does not exist anywhere in the rendered DOM; .fg-date-line does, with --fg-date-line-color in the token table and --fg-today-line-color absent', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        fit: 'preset',
        preset: 'year',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(container.querySelector('.fg-today-line')).toBeNull();
      const todayStroke = container.querySelector<HTMLElement>('.fg-date-line');
      expect(todayStroke).not.toBeNull();
      expect(todayStroke!.dataset['flag']).toBe('today');

      const styleSheet = Array.from(document.head.querySelectorAll('style'))
        .map((s) => s.textContent ?? '')
        .join('\n');
      expect(styleSheet).toContain('--fg-date-line-color');
      expect(styleSheet).not.toContain('--fg-today-line-color');

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[S1-A13] todayLine pinned to an Instant renders one .fg-date-line there with no Date line label, and does not move when the clock advances', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.useFakeTimers();
    vi.setSystemTime(instant('2020-06-01T00:00:00Z'));

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        // Explicit range (not fit: 'preset'/'fitDataset') so the scale itself stays put across
        // renders — the assertion below is about the pinned Date line, not the axis.
        range: { start: '2020-01-01', end: '2030-01-01' },
        preset: 'year',
        todayLine: '2026-09-14',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      // The pane resize above only requests a frame (FrameScheduler, async); awaiting one here
      // settles it before "before" is captured, so both measurements below reflect the same
      // resolved pane width instead of comparing a pre-resize layout to a post-resize one.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const lines = container.querySelectorAll<HTMLElement>('.fg-date-line');
      expect(lines).toHaveLength(1);
      expect(lines[0]!.dataset['flag']).toBe('today');
      const before = lines[0]!.style.transform;
      expect(container.querySelector('.fg-date-line-label')).toBeNull();

      vi.setSystemTime(instant('2029-06-01T00:00:00Z'));
      // Forces a real re-render with no change to todayLine itself and nothing that touches the
      // scale (unlike locale, which can shift pxPerMs by re-measuring tick label widths) — proves
      // the pinned line held its position through a render pass, not just that no render happened.
      gantt.dateLines = [];
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const after = container.querySelectorAll<HTMLElement>('.fg-date-line');
      expect(after).toHaveLength(1);
      expect(after[0]!.style.transform).toBe(before);

      gantt.destroy();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("[S1-A14] a dateLines entry's className reaches the rendered node's classList alongside the base class", () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        fit: 'preset',
        preset: 'year',
        todayLine: false,
        dateLines: [{ placeAt: '2026-06-01', label: 'Ship', className: 'fg-deadline-line' }],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const line = container.querySelector<HTMLElement>('.fg-date-line')!;
      expect(line.classList.contains('fg-date-line')).toBe(true);
      expect(line.classList.contains('fg-deadline-line')).toBe(true);
      expect(line.dataset['flag']).toBeUndefined();
      const dateLineLabel = container.querySelector<HTMLElement>('.fg-date-line-label')!;
      expect(dateLineLabel.classList.contains('fg-deadline-line')).toBe(true);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[#318] dateLineLabelPlacement moves the rendered Date line label between the header and the body, live', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({
          entries: [{ id: 'span', name: 'span', start: '2020-01-01', end: '2030-01-01' }],
          timeZone: 'UTC',
        }),
        fit: 'preset',
        preset: 'year',
        todayLine: false,
        dateLines: [{ placeAt: '2026-06-01', label: 'Launch' }],
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const label = container.querySelector<HTMLElement>('.fg-date-line-label')!;
      expect(label.dataset['placement']).toBe('belowHeader');

      gantt.dateLineLabelPlacement = 'inHeader';
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(label.dataset['placement']).toBeUndefined();

      gantt.dateLineLabelPlacement = 30;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(label.dataset['placement']).toBeUndefined();
      expect(label.style.transform.endsWith(', 30px)')).toBe(true);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Gantt navigationChange (S1.12)', () => {
  it('zoomIn fires navigationChange once per Viewport Batch', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        preset: 'weekAndMonth',
        fit: 'preset',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const seen: string[] = [];
      gantt.on('navigationChange', (payload) => {
        seen.push(payload.presetId);
      });
      const before = gantt.preset.id;
      gantt.zoomIn();
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toBe(before);
      expect(seen[0]).toBe(gantt.preset.id);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a no-op zoomIn at the finest preset emits nothing', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        preset: 'hour',
        fit: 'preset',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      let calls = 0;
      gantt.on('navigationChange', () => {
        calls++;
      });
      expect(gantt.canZoomIn).toBe(false);
      gantt.zoomIn();
      expect(calls).toBe(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('programmatic preset assignment fires navigationChange so chrome can stay in sync', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        preset: 'weekAndMonth',
        fit: 'preset',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const seen: string[] = [];
      gantt.on('navigationChange', (payload) => {
        seen.push(payload.presetId);
      });
      gantt.preset = 'month';
      expect(seen).toEqual(['month']);

      gantt.preset = 'month';
      expect(seen).toEqual(['month']);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Gantt theme and a11yLabel (S1.10)', () => {
  it('theme setter flips data-fg-theme on the container live; auto removes it', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    expect(container.getAttribute('data-fg-theme')).toBeNull();

    gantt.theme = 'dark';
    expect(container.getAttribute('data-fg-theme')).toBe('dark');

    gantt.theme = 'light';
    expect(container.getAttribute('data-fg-theme')).toBe('light');

    gantt.theme = 'auto';
    expect(container.getAttribute('data-fg-theme')).toBeNull();

    gantt.destroy();
  });

  it("[#330] resolvedTheme answers 'light'/'dark' for every theme value, and fires themeChange when it moves", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    // happy-dom's own matchMedia always answers `matches: false` — the OS half of 'auto' resolves
    // 'light' here, same as it does for every other Gantt test in this file with no override.
    expect(gantt.resolvedTheme).toBe('light');

    const events: Array<{ from: string; to: string }> = [];
    gantt.on('themeChange', (change) => {
      events.push(change);
    });

    gantt.theme = 'dark';
    expect(gantt.resolvedTheme).toBe('dark');
    expect(events).toEqual([{ from: 'light', to: 'dark' }]);

    gantt.theme = 'auto';
    expect(gantt.resolvedTheme).toBe('light');
    expect(events).toEqual([
      { from: 'light', to: 'dark' },
      { from: 'dark', to: 'light' },
    ]);

    gantt.destroy();
  });

  it('a11yLabel setter updates aria-label on the container live', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    expect(container.getAttribute('aria-label')).toBe('Gantt');

    gantt.a11yLabel = 'Room bookings';
    expect(container.getAttribute('aria-label')).toBe('Room bookings');

    gantt.destroy();
  });
});

describe('Gantt gridWidth and events (S1.8, plans/02 §6)', () => {
  it('beforeGridWidthChange returning false vetoes the change: gridWidth stays put', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    gantt.on('beforeGridWidthChange', () => false);
    gantt.gridWidth = 220;

    expect(gantt.gridWidth).toBe(160);
    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane.style.width).toBe('160px');

    gantt.destroy();
  });

  it('a non-vetoed change fires gridWidthChange exactly once with {from, to}', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const seen: Array<{ from: number; to: number }> = [];
    gantt.on('gridWidthChange', (payload) => {
      seen.push(payload);
    });
    gantt.gridWidth = 220;

    expect(seen).toEqual([{ from: 160, to: 220 }]);
    expect(gantt.gridWidth).toBe(220);

    gantt.destroy();
  });

  it('off stops a handler from being called', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const seen: Array<{ from: number; to: number }> = [];
    const handler = (payload: { from: number; to: number }): void => {
      seen.push(payload);
    };
    gantt.on('gridWidthChange', handler);
    gantt.off('gridWidthChange', handler);
    gantt.gridWidth = 220;

    expect(seen).toEqual([]);

    gantt.destroy();
  });

  it('setting gantt.gridWidth directly fires the same before/after pair a drag would', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
      // Name + Start end at 360, so the 300 below stays clear of #139's ceiling — this test is
      // about the event pair, not about the cap.
      gridColumns: ['name', 'start'],
    });

    const before: Array<{ from: number; to: number }> = [];
    const after: Array<{ from: number; to: number }> = [];
    gantt.on('beforeGridWidthChange', (payload) => {
      before.push(payload);
    });
    gantt.on('gridWidthChange', (payload) => {
      after.push(payload);
    });
    gantt.gridWidth = 300;

    expect(before).toEqual([{ from: 160, to: 300 }]);
    expect(after).toEqual([{ from: 160, to: 300 }]);

    gantt.destroy();
  });
});

describe('Gantt minGridWidth (#127)', () => {
  /** Drags the real splitter from `fromX` to `toX` and releases. happy-dom does no layout, so
   *  pointer capture is stubbed the way every other pointer suite here stubs it. */
  function dragSplitter(container: HTMLElement, fromX: number, toX: number): void {
    const splitter = container.querySelector<HTMLElement>('.fg-splitter');
    if (splitter === null) throw new Error('no splitter');
    splitter.setPointerCapture = vi.fn();
    splitter.releasePointerCapture = vi.fn();
    splitter.dispatchEvent(new PointerEvent('pointerdown', { clientX: fromX, pointerId: 1 }));
    splitter.dispatchEvent(new PointerEvent('pointermove', { clientX: toX, pointerId: 1 }));
    splitter.dispatchEvent(new PointerEvent('pointerup', { clientX: toX, pointerId: 1 }));
  }

  it('the splitter cannot drag gridWidth below minGridWidth', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      minGridWidth: 120,
    });

    dragSplitter(container, 200, 0);

    expect(gantt.gridWidth).toBe(120);
    gantt.destroy();
  });

  it('the splitter cannot drag gridWidth past the last column (#139)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      // 240 + 120: the columns end at 360, so that is where the drag stops.
      gridColumns: ['name', 'start'],
    });

    dragSplitter(container, 200, 900);

    expect(gantt.gridWidth).toBe(360);
    gantt.destroy();
  });

  it('a flex column names no edge, so the splitter drag keeps going (#139)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridColumns: [{ field: 'name', flex: 1 }, 'start'],
    });

    dragSplitter(container, 200, 900);

    expect(gantt.gridWidth).toBe(900);
    gantt.destroy();
  });

  it('an explicit gridWidth past the last column is capped to it (#139)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridColumns: ['name', 'start'],
    });

    const changes: Array<{ from: number; to: number }> = [];
    gantt.on('gridWidthChange', (payload) => {
      changes.push(payload);
    });
    gantt.gridWidth = 900;

    // The change carries the width the pane can actually use, not the one that was asked for.
    expect(gantt.gridWidth).toBe(360);
    expect(changes).toEqual([{ from: 200, to: 360 }]);
    gantt.destroy();
  });

  it('a constructor gridWidth past the last column comes in before the first paint (#139)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 900,
      gridColumns: ['name', 'start'],
    });

    expect(gantt.gridWidth).toBe(360);
    expect(container.querySelector<HTMLElement>('.fg-grid-pane')!.style.width).toBe('360px');
    gantt.destroy();
  });

  it('hiding a column brings the pane in with it (#139)', async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 360,
      gridColumns: ['name', 'start'],
    });
    expect(gantt.gridWidth).toBe(360);

    gantt.gridColumns = ['name'];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(gantt.gridWidth).toBe(240);
    gantt.destroy();
  });

  it("gridWidth: 'fitColumns' opens the pane on the columns' own edge (#157)", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      // 240 + 120: the consumer never says 360 anywhere.
      gridColumns: ['name', 'start'],
    });

    expect(gantt.gridWidth).toBe(360);
    expect(container.querySelector<HTMLElement>('.fg-grid-pane')!.style.width).toBe('360px');
    gantt.destroy();
  });

  it("'fitColumns' widens with the columns, not only in (#157)", async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      gridColumns: ['name'],
    });
    expect(gantt.gridWidth).toBe(240);

    gantt.gridColumns = ['name', 'start'];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(gantt.gridWidth).toBe(360);

    gantt.gridColumns = ['name'];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(gantt.gridWidth).toBe(240);

    gantt.destroy();
  });

  it("assigning 'fitColumns' live fires the same change pair a px width fires (#157)", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridColumns: ['name', 'start'],
    });

    const changes: Array<{ from: number; to: number }> = [];
    gantt.on('gridWidthChange', (payload) => {
      changes.push(payload);
    });
    gantt.gridWidth = 'fitColumns';

    expect(changes).toEqual([{ from: 200, to: 360 }]);
    expect(gantt.gridWidth).toBe(360);
    gantt.destroy();
  });

  it("a splitter drag ends 'fitColumns' — the consumer changed their mind (#157)", async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      gridColumns: ['name', 'start'],
    });
    expect(gantt.gridWidth).toBe(360);

    dragSplitter(container, 360, 300);
    expect(gantt.gridWidth).toBe(300);

    // A wider column set no longer moves the pane: 300 is a width the consumer asked for.
    gantt.gridColumns = ['name', 'start', 'end'];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(gantt.gridWidth).toBe(300);

    gantt.destroy();
  });

  it("a vetoed splitter drag leaves 'fitColumns' standing (#157)", async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      gridColumns: ['name', 'start'],
    });

    const veto = (): false => false;
    gantt.on('beforeGridWidthChange', veto);
    dragSplitter(container, 360, 300);
    gantt.off('beforeGridWidthChange', veto);

    // The drag never committed, so the pane still answers to its columns.
    gantt.gridColumns = ['name', 'start', 'end'];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(gantt.gridWidth).toBe(480);

    gantt.destroy();
  });

  it("a flex column names no edge, so 'fitColumns' keeps the authored width (#157)", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      gridColumns: [{ field: 'name', flex: 1 }, 'start'],
    });

    // `--fg-grid-pane-width`'s own fallback: a flex column fills whatever room it is given, so
    // there is no column edge to sit on (#139).
    expect(gantt.gridWidth).toBe(160);
    gantt.destroy();
  });

  it('an explicit gridWidth = 0 still collapses the pane on purpose', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      minGridWidth: 120,
    });

    gantt.gridWidth = 0;

    expect(gantt.gridWidth).toBe(0);
    gantt.destroy();
  });

  it('minGridWidth defaults to 40 and is live-reconfigurable', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    expect(gantt.minGridWidth).toBe(40);
    gantt.minGridWidth = 200;
    expect(gantt.minGridWidth).toBe(200);

    gantt.destroy();
  });

  it('raising minGridWidth above the current gridWidth re-clamps it through the same before/after pair a drag would fire', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    const before: Array<{ from: number; to: number }> = [];
    const after: Array<{ from: number; to: number }> = [];
    gantt.on('beforeGridWidthChange', (payload) => {
      before.push(payload);
    });
    gantt.on('gridWidthChange', (payload) => {
      after.push(payload);
    });

    gantt.minGridWidth = 200;

    expect(before).toEqual([{ from: 160, to: 200 }]);
    expect(after).toEqual([{ from: 160, to: 200 }]);
    expect(gantt.gridWidth).toBe(200);

    gantt.destroy();
  });

  it('a vetoed re-clamp leaves gridWidth exactly where it was', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    gantt.on('beforeGridWidthChange', () => false);
    gantt.minGridWidth = 200;

    expect(gantt.gridWidth).toBe(160);
    gantt.destroy();
  });

  it('lowering minGridWidth below the current gridWidth fires no gridWidthChange', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
      minGridWidth: 100,
    });

    const after: Array<{ from: number; to: number }> = [];
    gantt.on('gridWidthChange', (payload) => {
      after.push(payload);
    });
    gantt.minGridWidth = 50;

    expect(after).toEqual([]);
    expect(gantt.gridWidth).toBe(160);

    gantt.destroy();
  });
});

describe('Gantt splitter keyboard resize and ARIA (S5.11, D-S5-25/D-S5-26)', () => {
  function splitterOf(container: HTMLElement): HTMLElement {
    const splitter = container.querySelector<HTMLElement>('.fg-splitter');
    if (splitter === null) throw new Error('no splitter');
    return splitter;
  }

  function arrow(key: string): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
  }

  it('the separator is a tab stop and carries an accessible name and the aria-value* trio', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      minGridWidth: 120,
      gridColumns: ['name', 'start'],
    });

    const splitter = splitterOf(container);
    expect(splitter.getAttribute('role')).toBe('separator');
    expect(splitter.tabIndex).toBe(0);
    expect(splitter.getAttribute('aria-label')).toBeTruthy();
    expect(splitter.getAttribute('aria-valuemin')).toBe('120');
    // 240 + 120: the columns end at 360, the #139 ceiling `aria-valuemax` reports.
    expect(splitter.getAttribute('aria-valuemax')).toBe('360');
    expect(splitter.getAttribute('aria-valuenow')).toBe('200');

    gantt.destroy();
  });

  it('ArrowRight/ArrowLeft resize gridWidth and keep aria-valuenow live', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });
    const splitter = splitterOf(container);

    splitter.dispatchEvent(arrow('ArrowRight'));
    expect(gantt.gridWidth).toBe(216);
    expect(splitter.getAttribute('aria-valuenow')).toBe('216');

    splitter.dispatchEvent(arrow('ArrowLeft'));
    splitter.dispatchEvent(arrow('ArrowLeft'));
    expect(gantt.gridWidth).toBe(184);
    expect(splitter.getAttribute('aria-valuenow')).toBe('184');

    gantt.destroy();
  });

  it('a keyboard resize raises the same beforeGridWidthChange/gridWidthChange pair a drag raises', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });
    const splitter = splitterOf(container);

    const before: Array<{ from: number; to: number }> = [];
    const after: Array<{ from: number; to: number }> = [];
    gantt.on('beforeGridWidthChange', (payload) => {
      before.push(payload);
    });
    gantt.on('gridWidthChange', (payload) => {
      after.push(payload);
    });

    splitter.dispatchEvent(arrow('ArrowRight'));

    expect(before).toEqual([{ from: 200, to: 216 }]);
    expect(after).toEqual([{ from: 200, to: 216 }]);

    gantt.destroy();
  });

  it('a beforeGridWidthChange veto refuses a keyboard resize exactly as it refuses a drag', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });
    const splitter = splitterOf(container);

    gantt.on('beforeGridWidthChange', () => false);
    splitter.dispatchEvent(arrow('ArrowRight'));

    expect(gantt.gridWidth).toBe(200);
    expect(splitter.getAttribute('aria-valuenow')).toBe('200');

    gantt.destroy();
  });

  it('Home jumps gridWidth to minGridWidth and End jumps it to the columns’ own edge', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      minGridWidth: 120,
      gridColumns: ['name', 'start'],
    });
    const splitter = splitterOf(container);

    splitter.dispatchEvent(arrow('Home'));
    expect(gantt.gridWidth).toBe(120);

    splitter.dispatchEvent(arrow('End'));
    expect(gantt.gridWidth).toBe(360);

    gantt.destroy();
  });

  it('minGridWidth stays the floor after it changes, live', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });
    const splitter = splitterOf(container);
    expect(splitter.getAttribute('aria-valuemin')).toBe('40');

    gantt.minGridWidth = 100;

    expect(splitter.getAttribute('aria-valuemin')).toBe('100');
    gantt.destroy();
  });

  it('a flex column names no #139 edge, so aria-valuemax falls back to the container’s own bound', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridColumns: [{ field: 'name', flex: 1 }, 'start'],
    });
    const splitter = splitterOf(container);

    // happy-dom lays out nothing, so the container's own client rect is 0 here — the point is that
    // the fallback is a real, finite number rather than the #139 ceiling (`undefined`).
    expect(splitter.getAttribute('aria-valuemax')).not.toBeNull();
    expect(Number.isFinite(Number(splitter.getAttribute('aria-valuemax')))).toBe(true);

    gantt.destroy();
  });
});

describe('Gantt gridColumns (S4.3, D-S4-12, [S4-A1] column half)', () => {
  it('a declared cost shows beside start; assigning gridColumns re-renders with no remount', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        money: {
          rollUp: 'sum',
          formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
          column: { header: 'Cost', align: 'end' },
        },
      },
      fields: [{ key: 'cost', type: 'money' }],
      entries: sampleEntries.map((entry, i) =>
        i === 0 ? { ...entry.toInput(), props: { cost: 500 } } : entry,
      ),
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'start', 'cost'],
    });

    const firstRow = container.querySelector<HTMLElement>('.fg-row')!;
    const cells = Array.from(firstRow.querySelectorAll('.fg-row-label, .fg-row-cell'));
    expect(cells.map((c) => c.textContent)).toEqual([sampleEntries[0]?.name, expect.any(String), '$500']);
    expect(cells[1]?.getAttribute('data-field')).toBe('start');
    expect(cells[2]?.getAttribute('data-field')).toBe('cost');

    const barsBefore = Array.from(container.querySelectorAll('.fg-bar'));
    gantt.gridColumns = ['name', 'start'];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const barsAfter = Array.from(container.querySelectorAll('.fg-bar'));
    expect(barsAfter).toEqual(barsBefore);
    expect(firstRow.querySelector('[data-field="cost"]')).toBeNull();
    expect(firstRow.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(2);

    gantt.destroy();
  });

  it('a per-column cellRenderer beats a plugin-registered cell renderer (D-S5-11/D-S5-17 combined order, s5.4-renderers.md)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: [{ field: 'name', cellRenderer: () => ({ text: 'per-column' }) }],
      plugins: [
        {
          id: 'demo.cell-renderer',
          view(ctx) {
            ctx.view.registerRenderer('cell', () => ({ text: 'plugin' }));
            return () => {};
          },
        },
      ],
    });

    const cell = container.querySelector<HTMLElement>('.fg-row-label[data-field="name"]')!;
    expect(cell.textContent).toBe('per-column');

    gantt.destroy();
  });

  it('a cellRenderer reads the Field value beside the formatted string (review H3)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        money: {
          formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
          column: { header: 'Cost', align: 'end' },
        },
      },
      fields: [{ key: 'cost', type: 'money' }],
      entries: sampleEntries.slice(0, 1).map((entry) => ({ ...entry.toInput(), props: { cost: 1500 } })),
    });
    const seen: { value: string; fieldValue: unknown }[] = [];
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'cost'],
      cellRenderer: ({ column, value, fieldValue }) => {
        if (column.field === 'cost') seen.push({ value, fieldValue });
        return undefined;
      },
    });

    // The renderer branches on the number the Field registry produced; it never parses "$1500" back.
    expect(seen).toEqual([{ value: '$1500', fieldValue: 1500 }]);

    gantt.destroy();
  });

  it('a per-column cellRenderer reads the same Field value (review H3)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        money: { formatValue: (value) => (typeof value === 'number' ? `$${value}` : '') },
      },
      fields: [{ key: 'cost', type: 'money', column: { header: 'Cost' } }],
      entries: sampleEntries.slice(0, 1).map((entry) => ({ ...entry.toInput(), props: { cost: 1500 } })),
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: [
        'name',
        {
          field: 'cost',
          cellRenderer: ({ value, fieldValue }) =>
            typeof fieldValue === 'number' && fieldValue > 1000 ? { text: `over: ${value}` } : undefined,
        },
      ],
    });

    expect(container.querySelector('.fg-row [data-field="cost"]')?.textContent).toBe('over: $1500');

    gantt.destroy();
  });

  it('a Dataset change re-binds columns so a later cost edit paints the new cell text', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        money: {
          rollUp: 'sum',
          formatValue: (value) => (typeof value === 'number' ? `$${value}` : ''),
          column: { header: 'Cost', align: 'end' },
        },
      },
      fields: [{ key: 'cost', type: 'money' }],
      entries: sampleEntries.map((entry, i) =>
        i === 0 ? { ...entry.toInput(), props: { cost: 500 } } : entry,
      ),
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'cost'],
    });
    const id = dataset.entries.all[0]!.id;
    dataset.entries.update(id, { cost: 999 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const costCell = container.querySelector('.fg-row [data-field="cost"]');
    expect(costCell?.textContent).toBe('$999');
    gantt.destroy();
  });

  it("default gridColumns is ['name', 'start', 'end'] (ADR 0012: dates are no longer guaranteed)", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
    });
    expect(gantt.gridColumns).toEqual(['name', 'start', 'end']);
    const row = container.querySelector('.fg-row')!;
    expect(row.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(3);
    gantt.destroy();
  });
});

describe('Gantt grid columns are fixed-width by default (#139)', () => {
  it('a column nobody sized paints a pixel width and refuses to flex', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'start', 'end'] });

    const headers = Array.from(container.querySelectorAll<HTMLElement>('.fg-col-header'));
    expect(headers.map((cell) => cell.style.width)).toEqual(['240px', '120px', '120px']);
    for (const cell of headers) expect(cell.hasAttribute('data-fixed')).toBe(true);

    // The row cells carry the same geometry, so a row never drifts from its own header.
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.fg-row-label, .fg-row-cell'));
    expect(cells.map((cell) => cell.style.width)).toEqual(['240px', '120px', '120px']);

    gantt.destroy();
  });

  it('the grid pane widens past gridWidth so the overflowing columns are reachable', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({
      container,
      dataset,
      gridWidth: 200,
      gridColumns: ['name', 'start', 'end'],
    });

    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    // 240 + 120 + 120, well past the 200px pane — #126's horizontal scroller now has something to
    // reach without the consumer sizing a single column by hand.
    expect(gridPane.style.getPropertyValue('--fg-grid-content-width')).toBe('480px');

    gantt.destroy();
  });

  it('a column that asks to flex still shares the leftover room', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({
      container,
      dataset,
      gridWidth: 400,
      gridColumns: [{ field: 'name', flex: 1 }, 'start'],
    });

    const [nameHeader, startHeader] = Array.from(container.querySelectorAll<HTMLElement>('.fg-col-header'));
    expect(nameHeader?.hasAttribute('data-fixed')).toBe(false);
    expect(nameHeader?.style.width).toBe('');
    expect(startHeader?.style.width).toBe('120px');

    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    // A flex column contributes nothing to the sum, so 120px alone never overflows a 400px pane.
    expect(gridPane.style.getPropertyValue('--fg-grid-content-width')).toBe('400px');

    gantt.destroy();
  });
});

describe('Gantt gridColumnsChange — one commit sequence (S5.7, D-S5-18)', () => {
  it('a plain gridColumns assignment fires beforeGridColumnsChange then gridColumnsChange, payload is resolved GridColumns', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridColumns: ['name'],
    });

    const before: { from: unknown; to: unknown }[] = [];
    const after: { from: unknown; to: unknown }[] = [];
    gantt.on('beforeGridColumnsChange', (payload) => {
      before.push(payload);
    });
    gantt.on('gridColumnsChange', (payload) => {
      after.push(payload);
    });

    gantt.gridColumns = ['name', 'start'];

    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    // Resolved columns arrive as the public `GridColumn` shape — a consumer keeps `to` and passes it
    // straight back as `gridColumns`. `format` is the one thing dropped (#194, D-S5-37).
    expect(before[0]!.from).toEqual([expect.objectContaining({ field: 'name' })]);
    expect(before[0]!.to).toEqual([
      expect.objectContaining({ field: 'name' }),
      expect.objectContaining({ field: 'start' }),
    ]);
    expect(after[0]).toEqual(before[0]);

    gantt.destroy();
  });

  // #194, D-S5-37: a renderer context used to hand a consumer `column.key` while every other
  // surface named the same column `field`, so one page spelled one column two ways.
  it('one column, one name: a renderer, the change payload and gridColumns all say `field` (#194)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const cellColumns: string[] = [];
    const headerColumns: string[] = [];
    const payloads: { field: string }[][] = [];
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', { field: 'start' }],
      cellRenderer: ({ column }) => {
        cellColumns.push(String(column.field));
        return undefined;
      },
      headerRenderer: ({ column }) => {
        headerColumns.push(String(column.field));
        return undefined;
      },
    });
    gantt.on('gridColumnsChange', ({ to }) => {
      payloads.push(to.map((column) => ({ field: String(column.field) })));
    });

    gantt.hideGridColumn('start');

    expect(cellColumns).toContain('start');
    expect(headerColumns).toContain('start');
    // D-S5-34: a hidden consumer column stays in the payload, so a saved list restores it hidden.
    expect(payloads[0]).toEqual([{ field: 'name' }, { field: 'start' }]);
    expect(gantt.gridColumns).toEqual(['name', { field: 'start', hidden: true }]);

    gantt.destroy();
  });

  it('beforeGridColumnsChange returning false vetoes the assignment: gridColumns stays put', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridColumns: ['name'],
    });
    gantt.on('beforeGridColumnsChange', () => false);

    gantt.gridColumns = ['name', 'start'];

    expect(gantt.gridColumns).toEqual(['name']);
    expect(container.querySelector('[data-field="start"]')).toBeNull();

    gantt.destroy();
  });

  it('a resize drag fires the same gridColumnsChange pair a plain assignment fires', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridColumns: ['name'],
    });

    const changes: { from: unknown; to: unknown }[] = [];
    gantt.on('gridColumnsChange', (payload) => {
      changes.push(payload);
    });

    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="name"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    headerPane.releasePointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]!.to).toEqual([expect.objectContaining({ field: 'name', width: 150 })]);
    // Same payload shape a plain `gantt.gridColumns = […]` assignment fires above — resolved
    // GridColumns, not the layout-only ResolvedColumn.
    expect(changes[0]!.from).toEqual([expect.objectContaining({ field: 'name' })]);

    gantt.destroy();
  });

  it('resizable: false on a column refuses the pointer drag — no gridColumnsChange', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridColumns: [{ field: 'name', resizable: false }],
    });

    const changes: unknown[] = [];
    gantt.on('gridColumnsChange', (payload) => {
      changes.push(payload);
    });

    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="name"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );

    expect(changes).toEqual([]);

    gantt.destroy();
  });

  it('movable: false on a column refuses the pointer reorder drag — no gridColumnsChange', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridColumns: [{ field: 'name', movable: false }, 'start'],
    });

    const changes: unknown[] = [];
    gantt.on('gridColumnsChange', (payload) => {
      changes.push(payload);
    });

    const nameHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="name"]')!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    nameHeader.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 300, clientY: 0, pointerId: 1, bubbles: true }),
    );
    nameHeader.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 300, clientY: 0, pointerId: 1, bubbles: true }),
    );

    expect(changes).toEqual([]);

    gantt.destroy();
  });
});

describe('Gantt renderer callbacks (S5.4, D-S5-10/11/12)', () => {
  it('barRenderer/cellRenderer/headerRenderer/tooltipRenderer are live properties', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.barRenderer).toBeUndefined();
    expect(gantt.cellRenderer).toBeUndefined();
    expect(gantt.headerRenderer).toBeUndefined();
    expect(gantt.tooltipRenderer).toBeUndefined();

    const barRenderer = () => ({ text: 'bar' });
    const cellRenderer = () => ({ text: 'cell' });
    const headerRenderer = () => ({ text: 'header' });
    const tooltipRenderer = () => ({ text: 'tooltip' });
    gantt.barRenderer = barRenderer;
    gantt.cellRenderer = cellRenderer;
    gantt.headerRenderer = headerRenderer;
    gantt.tooltipRenderer = tooltipRenderer;

    expect(gantt.barRenderer).toBe(barRenderer);
    expect(gantt.cellRenderer).toBe(cellRenderer);
    expect(gantt.headerRenderer).toBe(headerRenderer);
    expect(gantt.tooltipRenderer).toBe(tooltipRenderer);

    gantt.destroy();
  });

  it("a milestone variant's own paint draws a diamond, and dropping it repaints with no bar remount (I8)", async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      // ADR 0018: core ships no 'milestone' variant (ADR 0022's shipped look is named `diamond`).
      // The consumer says which rows wear one and how it looks, in one object, and needs no plugin
      // at all.
      variants: [
        {
          name: 'milestone',
          when: (entry) => entry.id === sampleEntries[0]!.id,
          paint: () => ({ class: { 'my-diamond': true }, text: '◆' }),
        },
      ],
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.classList.contains('my-diamond')).toBe(true);
    expect(bar.textContent).toBe('◆');
    expect(bar.dataset['variant']).toBe('milestone');

    gantt.variants = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-bar')).toBe(bar);
    expect(bar.classList.contains('my-diamond')).toBe(false);
    expect(bar.textContent).toBe(sampleEntries[0]!.name);
    expect(bar.dataset['variant']).toBe('leaf');

    gantt.destroy();
  });

  it('paints a summary row with core’s own `parent` rule, not the consumer’s catch-all barRenderer (J61)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'P', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'C', parentId: 'p', start: '2026-01-01', end: '2026-01-10' },
        { id: 'solo', name: 'Solo', start: '2026-01-01', end: '2026-01-10' },
      ],
    });
    const painted: string[] = [];
    // `J40`: a rule that names the rows it covers beats a catch-all that names none. Core's `parent`
    // is such a rule, so the summary rail stands and `barRenderer` paints every other bar.
    const gantt = new Gantt({
      container,
      dataset,
      barRenderer: ({ entry }) => {
        painted.push(String(entry.id));
        return { text: 'mine' };
      },
    });

    expect(painted.sort()).toEqual(['c', 'solo']);
    expect(container.querySelector('.fg-bar-summary')).not.toBeNull();

    gantt.destroy();
  });

  it('lets a consumer’s own rule claim the summary row, which is how they paint it (J61)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'P', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'C', parentId: 'p', start: '2026-01-01', end: '2026-01-10' },
      ],
    });
    const painted: string[] = [];
    // The door D-S5-11 asks for: the consumer's own rule outranks core's, so their paint answers.
    const gantt = new Gantt({
      container,
      dataset,
      variants: [
        {
          name: 'summary',
          when: (entry) => entry.hasChildren,
          paint: ({ entry }) => {
            painted.push(String(entry.id));
            return { class: { mine: true } };
          },
        },
      ],
    });

    expect(painted).toEqual(['p']);
    expect(container.querySelector('.fg-bar-summary')).toBeNull();

    gantt.destroy();
  });

  describe('gantt.variantFor(entry) (ADR 0022 §3, Q4)', () => {
    function pointDataset(): Dataset {
      const zero = instant(Date.UTC(2026, 0, 1));
      return new Dataset({
        timeZone: 'UTC',
        entries: [{ id: 'm', name: 'M', start: zero, end: zero }],
      });
    }

    it('answers the whole variant, not a name a caller looks up again', () => {
      const container = document.createElement('div');
      const dataset = pointDataset();
      const gantt = new Gantt({ container, dataset, variants: [diamond()] });
      const entry = dataset.entries.get('m')!;

      const variant = gantt.variantFor(entry);

      expect(variant.name).toBe('diamond');
      expect(variant.items).toEqual(expect.any(Function));

      gantt.destroy();
    });

    it('is per Gantt, not per Entry: two Gantts on one Dataset, with different variants, answer differently for one row (I2)', () => {
      const dataset = pointDataset();
      const entry = dataset.entries.get('m')!;

      const ganttA = new Gantt({
        container: document.createElement('div'),
        dataset,
        variants: [diamond()],
      });
      const ganttB = new Gantt({
        container: document.createElement('div'),
        dataset,
        variants: [{ name: 'checkpoint', when: (candidate) => candidate.id === entry.id }],
      });

      expect(ganttA.variantFor(entry).name).toBe('diamond');
      expect(ganttB.variantFor(entry).name).toBe('checkpoint');

      ganttA.destroy();
      ganttB.destroy();
    });
  });

  describe('a variant’s own css (ADR 0022 §5, Q6)', () => {
    // Date-only strings, not an Instant pair: under this Dataset's default `dateOnlyEnd:
    // 'inclusive'`, `start === end` here ingests as one calendar day, not a zero-duration point
    // (`diamond()`'s own default `when` does not claim it — F20). Named for what it delivers,
    // because this `describe` only ever asserts stylesheet text and never which row `diamond()`
    // claims — the neighbouring `pointDataset()` above, built from `instant(Date.UTC(...))`, is
    // the one that actually claims a row.
    function oneDayDataset(): Dataset {
      return new Dataset({
        timeZone: 'UTC',
        entries: [{ id: 'm', name: 'M', start: '2026-01-01', end: '2026-01-01' }],
      });
    }

    // The node a Gantt just built is always the last one in `head` — construction appends, and
    // nothing removes one until `destroy()`. Capturing it by reference, right after construction,
    // is what keeps each test honest about which Gantt's own node it reads.
    function variantStyleNodeOf(container: HTMLElement): HTMLStyleElement {
      const nodes = container.ownerDocument.head.querySelectorAll<HTMLStyleElement>(
        'style[data-freegantt-variant-styles]',
      );
      return nodes[nodes.length - 1]!;
    }

    it('carries no diamond css when nothing installs diamond() — #286’s whole claim', () => {
      const container = document.createElement('div');
      const gantt = new Gantt({ container, dataset: oneDayDataset() });
      const node = variantStyleNodeOf(container);

      expect(node.textContent).not.toContain('.fg-bar-diamond');

      gantt.destroy();
    });

    it('carries diamond()’s own rules once an author installs it', () => {
      const container = document.createElement('div');
      const gantt = new Gantt({ container, dataset: oneDayDataset(), variants: [diamond()] });
      const node = variantStyleNodeOf(container);

      expect(node.textContent).toContain('.fg-bar-diamond');
      // After the base sheet, always (ADR 0022 §5) — so it can cancel `.fg-bar`'s own state paint.
      const baseStyle = container.ownerDocument.head.querySelector('style[data-freegantt-styles]')!;
      expect(baseStyle.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      gantt.destroy();
    });

    it('gantt.variants = […] installs a variant’s own css, and reassigning without it removes it', () => {
      const container = document.createElement('div');
      const gantt = new Gantt({ container, dataset: oneDayDataset() });
      const node = variantStyleNodeOf(container);
      expect(node.textContent).not.toContain('.fg-bar-diamond');

      gantt.variants = [diamond()];
      expect(node.textContent).toContain('.fg-bar-diamond');

      gantt.variants = [];
      expect(node.textContent).not.toContain('.fg-bar-diamond');

      gantt.destroy();
    });

    it('two Gantts with different variants each carry their own node, never one shared node (I2)', () => {
      const containerA = document.createElement('div');
      const ganttA = new Gantt({ container: containerA, dataset: oneDayDataset(), variants: [diamond()] });
      const nodeA = variantStyleNodeOf(containerA);

      const containerB = document.createElement('div');
      const ganttB = new Gantt({ container: containerB, dataset: oneDayDataset() });
      const nodeB = variantStyleNodeOf(containerB);

      expect(nodeA).not.toBe(nodeB);
      expect(nodeA.textContent).toContain('.fg-bar-diamond');
      expect(nodeB.textContent).not.toContain('.fg-bar-diamond');

      ganttA.destroy();
      expect(nodeA.isConnected).toBe(false);
      // B's own node is untouched by A's disposal — proof the two were never one shared, refcounted
      // node behind the two Gantts.
      expect(nodeB.isConnected).toBe(true);
      expect(nodeB.textContent).not.toContain('.fg-bar-diamond');

      ganttB.destroy();
    });
  });

  it('a field match on a key no Field declares never matches, and the Gantt keeps drawing (F2)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    // A chrome plugin installs after the Dataset closes its Field gate, so it cannot declare the key
    // it matches on. The rule answers no for every row; it never takes the layout pass down.
    const gantt = new Gantt({
      container,
      dataset,
      variants: [{ name: 'phased', when: { 'demo:phaseId': true }, paint: () => ({ text: 'P' }) }],
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['variant']).toBe('leaf');

    gantt.destroy();
  });

  it('the same match claims the row once a Field declares the key (F2)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [{ ...sampleEntries[0]!.toInput(), props: { 'demo:phaseId': true } }],
      timeZone: 'UTC',
      fields: [{ key: 'demo:phaseId' }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      variants: [{ name: 'phased', when: { 'demo:phaseId': true }, paint: () => ({ text: 'P' }) }],
    });

    expect(container.querySelector<HTMLElement>('.fg-bar')!.dataset['variant']).toBe('phased');

    gantt.destroy();
  });

  it('a headerRenderer paints the grid header cell, and reassigning it repaints with no header remount (I11)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      headerRenderer: ({ column }) => ({ class: { 'my-header': true }, text: `[${column.header}]` }),
    });

    const headerCell = container.querySelector<HTMLElement>('.fg-col-header')!;
    const headerLabel = headerCell.querySelector<HTMLElement>('.fg-col-header-label')!;
    expect(headerLabel.classList.contains('my-header')).toBe(true);
    expect(headerCell.textContent).toBe('[Name]');

    gantt.headerRenderer = undefined;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-col-header')).toBe(headerCell);
    expect(headerLabel.classList.contains('my-header')).toBe(false);
    expect(headerCell.textContent).toBe('Name');

    gantt.destroy();
  });

  it('a plugin-registered header renderer paints when no consumer headerRenderer is set (D-S5-11)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.header-renderer',
          view(ctx) {
            ctx.view.registerRenderer('header', () => ({ text: 'plugin-header' }));
            return () => {};
          },
        },
      ],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const headerCell = container.querySelector<HTMLElement>('.fg-col-header')!;
    expect(headerCell.textContent).toBe('plugin-header');

    gantt.destroy();
  });

  it('ctx.view.registerRenderer claims a point; a second plugin claiming the same point throws RendererAlreadyRegisteredError', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });

    // PluginRuntime.install() wraps a view() throw in PluginSetupError (C1) — the collision itself
    // is the wrapped cause.
    let cause: unknown;
    try {
      new Gantt({
        container,
        dataset,
        plugins: [
          {
            id: 'demo.renderer-one',
            view(ctx) {
              ctx.view.registerRenderer('cell', () => undefined);
              return () => {};
            },
          },
          {
            id: 'demo.renderer-two',
            view(ctx) {
              ctx.view.registerRenderer('cell', () => undefined);
              return () => {};
            },
          },
        ],
      });
      expect.unreachable();
    } catch (error) {
      cause = (error as { cause?: unknown }).cause;
    }
    expect(cause).toBeInstanceOf(RendererAlreadyRegisteredError);
  });
});

describe('Gantt plugin variant registrations (S5.9, D-S5-21/D-S5-22, ADR 0018)', () => {
  it("ctx.variants.add draws a variant's own shape; disposal restores the library's", async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.bufferVariant',
          view(ctx) {
            // One object answers every question about the variant: which rows wear it, and what
            // shape it draws. There is no stored classification to key on (ADR 0013, ADR 0018).
            ctx.variants.add({
              name: 'buffer',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              items: (entry) => [
                {
                  id: itemId(entry.id, 0),
                  entryId: entry.id,
                  variant: 'buffer',
                  label: `buffer: ${entry.name}`,
                  start: entry.start!,
                  end: entry.end!,
                },
              ],
            });
            return () => {};
          },
        },
      ],
    });
    // The plugin's own registration runs after GanttShell's first render (`Gantt.plugins`'s
    // constructor-time assignment lands after `new GanttShell(...)` returns) — its own
    // `#frames.request()` schedules the repaint, one rAF away.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe(`buffer: ${sampleEntries[0]!.name}`);

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector<HTMLElement>('.fg-bar')!.textContent).toBe(sampleEntries[0]!.name);

    gantt.destroy();
  });

  it("a variant's own `can` refuses resize for the rows it claims; disposal restores the library default", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.bufferVariant',
          view(ctx) {
            ctx.variants.add({
              name: 'buffer',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              can: { resize: false },
            });
            return () => {};
          },
        },
      ],
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    let start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);
    expect(bar.hasAttribute('data-movable')).toBe(true);

    gantt.plugins = [];
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  // #146: a Disposer freed a slot by position, so disposing one plugin's registration freed
  // another's. The two tests below stage both disposal orders end to end, through
  // `gantt.plugins = [...]`, because the unit registry never rebuilds a frame.
  //
  // Both stage two sibling plugins whose rules cover one row. That collision is what
  // `'variant-claimed-twice'` names (`J36`), so a console warning here is the design speaking.
  const bufferVariant = (pluginId: string, resize: boolean) => ({
    id: pluginId,
    view(ctx: PluginContext) {
      ctx.variants.add({
        name: 'buffer',
        when: (entry) => entry.id === sampleEntries[0]!.id,
        can: { resize },
      });
      return () => {};
    },
  });

  it('disposing the newest of two plugin variants restores the older one (#146)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const refusesResize = bufferVariant('demo.bufferA', false);
    const allowsResize = bufferVariant('demo.bufferB', true);
    const gantt = new Gantt({ container, dataset, plugins: [refusesResize, allowsResize] });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    // B registers last and wins (`Q5`): resize affordance visible.
    let start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(false);

    // Dropping B must restore A's own rule, not fall through to the library default.
    gantt.plugins = [refusesResize];
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    // Dropping A too falls back to the library default.
    gantt.plugins = [];
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('disposing the older of two plugin variants leaves the newest resolving, never the library default (#146)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const allowsResize = bufferVariant('demo.bufferA', true);
    // B's own answer (resize refused) must differ from the library default (resize allowed), or a
    // fall-through bug would read as B's rule still resolving, by coincidence.
    const refusesResize = bufferVariant('demo.bufferB', false);
    const gantt = new Gantt({ container, dataset, plugins: [allowsResize, refusesResize] });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    let start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    gantt.plugins = [refusesResize];
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it("the consumer's own interactions still wins over a variant's own `can`", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      interactions: { resize: true },
      plugins: [
        {
          id: 'demo.bufferVariant',
          view(ctx) {
            ctx.variants.add({
              name: 'buffer',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              can: { resize: false },
            });
            return () => {};
          },
        },
      ],
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('ctx.view.registerGridColumn appends after the consumer’s own gridColumns; disposal removes it', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        risk: { rollUp: 'max', column: { header: 'Risk' } },
      },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [
        {
          id: 'demo.riskColumn',
          view(ctx) {
            ctx.view.registerGridColumn({ field: 'risk' });
            return () => {};
          },
        },
      ],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const firstRow = container.querySelector<HTMLElement>('.fg-row')!;
    const fields = Array.from(firstRow.querySelectorAll('.fg-row-label, .fg-row-cell')).map((cell) =>
      cell.getAttribute('data-field'),
    );
    expect(fields).toEqual(['name', 'risk']);
    // the raw, consumer-authored list is untouched by the plugin's append (D-S5-21).
    expect(gantt.gridColumns).toEqual(['name']);

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const fieldsAfter = Array.from(container.querySelectorAll('.fg-row-label, .fg-row-cell')).map((cell) =>
      cell.getAttribute('data-field'),
    );
    expect(fieldsAfter).toEqual(['name']);

    gantt.destroy();
  });

  it('two plugins registering the same grid-column field collapse to one column, the later registration winning (#147)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        risk: { rollUp: 'max', column: { header: 'Risk' } },
      },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [
        {
          id: 'demo.riskColumnA',
          view(ctx) {
            ctx.view.registerGridColumn({ field: 'risk', header: 'Risk A' });
            return () => {};
          },
        },
        {
          id: 'demo.riskColumnB',
          view(ctx) {
            ctx.view.registerGridColumn({ field: 'risk', header: 'Risk B' });
            return () => {};
          },
        },
      ],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const riskHeaders = container.querySelectorAll('.fg-col-header[data-field="risk"]');
    expect(riskHeaders).toHaveLength(1);
    expect(riskHeaders[0]!.textContent).toBe('Risk B');

    gantt.destroy();
  });

  it('a resize commit keeps a plugin column, and disposing the plugin still removes it', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { risk: { rollUp: 'max', column: { header: 'Risk' } } },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [
        {
          id: 'demo.riskColumn',
          view(ctx) {
            ctx.view.registerGridColumn({ field: 'risk' });
            return () => {};
          },
        },
      ],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // A resize drag on the plugin's own grip: `commitWidth` rewrites every column on screen, so the
    // commit stores "risk" as a plugin-declared column of its own (D-S5-33) — the same seam
    // `api/plugin-context.ts`'s disposal promise has to reach through.
    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="risk"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    headerPane.releasePointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );

    expect(container.querySelector('[data-field="risk"]')).not.toBeNull();

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Without the fix, the resized "risk" column survives the commit even though the plugin that
    // registered it is gone.
    expect(container.querySelector('[data-field="risk"]')).toBeNull();

    gantt.destroy();
  });

  it('disposing the first of two plugins registering the same grid-column field still shows the second, not none (#147)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        risk: { rollUp: 'max', column: { header: 'Risk' } },
      },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const pluginA = {
      id: 'demo.riskColumnA',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk A' });
        return () => {};
      },
    };
    const pluginB = {
      id: 'demo.riskColumnB',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk B' });
        return () => {};
      },
    };
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [pluginA, pluginB],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let riskHeaders = container.querySelectorAll('.fg-col-header[data-field="risk"]');
    expect(riskHeaders).toHaveLength(1);
    expect(riskHeaders[0]!.textContent).toBe('Risk B');

    // Dropping A (the earlier registration, not the winner) must leave B's own column on screen —
    // never remove the field entirely (#147).
    gantt.plugins = [pluginB];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    riskHeaders = container.querySelectorAll('.fg-col-header[data-field="risk"]');
    expect(riskHeaders).toHaveLength(1);
    expect(riskHeaders[0]!.textContent).toBe('Risk B');

    gantt.destroy();
  });

  it('a resize commit bakes the winning plugin column in; disposing the losing plugin keeps it, width included (#147)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        risk: { rollUp: 'max', column: { header: 'Risk' } },
      },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const pluginA = {
      id: 'demo.riskColumnA',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk A' });
        return () => {};
      },
    };
    const pluginB = {
      id: 'demo.riskColumnB',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk B' });
        return () => {};
      },
    };
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [pluginA, pluginB],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // A resize drag on B's own grip (B is the winner) commits "risk" as a plugin-declared column at
    // width 200 (D-S5-33) — the same seam `api/plugin-context.ts`'s disposal promise reaches.
    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="risk"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    headerPane.releasePointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader.style.width).toBe('200px');

    // Dropping A (a loser on this field) must leave B's baked-in column on screen, committed
    // width included: B still owns the field, so the resize's commit is untouched (#147, plan §2.4
    // row 3).
    gantt.plugins = [pluginB];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader).not.toBeNull();
    expect(riskHeader.style.width).toBe('200px');

    gantt.destroy();
  });

  it('two plugins registering one field by the same bare string still dispose independently (#147)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { risk: { rollUp: 'max', column: { header: 'Risk' } } },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    // `GridColumnInput` is `string | GridColumn`, so both plugins hand `registerGridColumn` the
    // very same value. A disposer that asks "is the column on screen mine?" by comparing that
    // value would answer `true` for both registrations, and the loser's disposal would then strip
    // the winner's committed width. Each registration carries its own identity instead (#154).
    const registerRisk = (ctx: PluginContext): void => {
      ctx.view.registerGridColumn('risk');
    };
    const pluginA = {
      id: 'demo.riskSharedA',
      view(ctx: PluginContext) {
        registerRisk(ctx);
        return () => {};
      },
    };
    const pluginB = {
      id: 'demo.riskSharedB',
      view(ctx: PluginContext) {
        registerRisk(ctx);
        return () => {};
      },
    };
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [pluginA, pluginB],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="risk"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    headerPane.releasePointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader.style.width).toBe('200px');

    // Dropping A, a loser on this field, must leave B's baked-in column at its committed width.
    gantt.plugins = [pluginB];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader).not.toBeNull();
    expect(riskHeader.style.width).toBe('200px');

    gantt.destroy();
  });

  it('a resize commit bakes the winning plugin column in; the width survives while another plugin still asks for the field (#155)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: {
        risk: { rollUp: 'max', column: { header: 'Risk' } },
      },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    const pluginA = {
      id: 'demo.riskColumnA',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk A' });
        return () => {};
      },
    };
    const pluginB = {
      id: 'demo.riskColumnB',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'risk', header: 'Risk B' });
        return () => {};
      },
    };
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [pluginA, pluginB],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const grip = container.querySelector<HTMLElement>(
      '.fg-col-header[data-field="risk"] .fg-column-resizer',
    )!;
    const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
    headerPane.setPointerCapture = vi.fn();
    headerPane.releasePointerCapture = vi.fn();
    grip.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, bubbles: true }),
    );
    headerPane.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    grip.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 200, clientY: 0, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!.style.width).toBe(
      '200px',
    );

    // #155: dropping B leaves A registered on `risk`, so the field is still asked for and the baked
    // column stays exactly as the resize committed it — 200px, B's committed content. A commit
    // writes the consumer's own list (D-S5-21: config beats a plugin), and a resize is a gesture the
    // consumer performed, so a plugin leaving never takes that width with it. Only the last
    // registration on a field takes the baked column out.
    gantt.plugins = [pluginA];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader).not.toBeNull();
    expect(riskHeader.style.width).toBe('200px');

    // Dropping the last registration takes the baked column with it.
    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).toBeNull();

    gantt.destroy();
  });

  it('a duplicate field the consumer already names is dropped from the plugin side (config beats a plugin)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [
        {
          id: 'demo.duplicateColumn',
          view(ctx) {
            ctx.view.registerGridColumn({ field: 'name', header: 'Plugin name' });
            return () => {};
          },
        },
      ],
    });

    const firstRow = container.querySelector<HTMLElement>('.fg-row')!;
    expect(firstRow.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(1);

    gantt.destroy();
  });

  /** The page's own words for a row, which is the whole of how a variant is pinned now (ADR 0018).
   *  `bufferKind()` and `riskKind()` keep no list of the ids they own: each declares a Field and
   *  matches on it, so a test says which rows carry which mark and the rules read it back. */
  const markedDataset = (marks: Readonly<Record<string, readonly string[]>>, entryCount = 2): Dataset => {
    const marksOf = (id: string): Record<string, true> =>
      Object.fromEntries(
        Object.entries(marks)
          .filter(([, ids]) => ids.includes(id))
          .map(([key]) => [key, true as const]),
      );
    return new Dataset({
      timeZone: 'UTC',
      fields: Object.keys(marks).map((key) => ({ key })),
      entries: sampleEntries.slice(0, entryCount).map((entry) => {
        const input = entry.toInput();
        return { ...input, props: { ...input.props, ...marksOf(entry.id) } };
      }),
    });
  };

  it('[S5-A3] a consumer-defined variant renders, refuses resize, and offers its own menu item — one plugin, zero core edits', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = markedDataset({ buffer: [sampleEntries[0]!.id] });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [contextMenu(), bufferKind()],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
    const bufferBar = bars.find((bar) => bar.getAttribute('data-variant') === 'buffer')!;
    const spanBar = bars.find((bar) => bar.getAttribute('data-variant') !== 'buffer')!;
    expect(bufferBar.classList.contains('demo-buffer-bar')).toBe(true);

    bufferBar.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
    const bufferMenuLabels = Array.from(container.querySelectorAll('.fg-menu-item')).map(
      (item) => item.textContent,
    );
    expect(bufferMenuLabels).toContain('Mark buffer consumed');

    spanBar.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
    const spanMenuLabels = Array.from(container.querySelectorAll('.fg-menu-item')).map(
      (item) => item.textContent,
    );
    expect(spanMenuLabels).not.toContain('Mark buffer consumed');

    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bufferBar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
    container.remove();
  });

  it('[review P2] two plugins that each define a variant both install, both paint, and dropping one leaves the other', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const bufferEntryId = sampleEntries[0]!.id;
    const riskEntryId = sampleEntries[1]!.id;
    const dataset = markedDataset({ buffer: [bufferEntryId], risk: [riskEntryId] });
    const buffer = bufferKind();
    const risk = riskKind();
    const gantt = new Gantt({ container, dataset, plugins: [buffer, risk] });
    const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));
    await paint();

    // Keyed by `data-item-id` (the Entry's own id), not `data-variant`: a variant is a rule
    // resolved fresh every frame (ADR 0018), so `data-variant` reverts to `leaf` the moment a
    // plugin drops — the bar itself (and the Entry it draws) does not move.
    const barFor = (entryId: string): HTMLElement =>
      Array.from(container.querySelectorAll<HTMLElement>('.fg-bar')).find((bar) =>
        bar.getAttribute('data-item-id')?.startsWith(`${entryId}:`),
      )!;

    // Both installed, and both painted their own class from their own `bar` registration.
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.bufferKind', 'demo.riskKind']);
    expect(barFor(bufferEntryId).classList.contains('demo-buffer-bar')).toBe(true);
    expect(barFor(riskEntryId).classList.contains('demo-risk-bar')).toBe(true);

    // Dropping the first-registered plugin leaves the second painting; the dropped Entry's bar
    // still exists (structural `leaf`), it just no longer carries the plugin's class.
    gantt.plugins = [risk];
    await paint();
    expect(barFor(bufferEntryId).classList.contains('demo-buffer-bar')).toBe(false);
    expect(barFor(riskEntryId).classList.contains('demo-risk-bar')).toBe(true);

    // Re-installing is an ordinary sequence (#155), and the other disposal order behaves the same.
    gantt.plugins = [buffer, risk];
    await paint();
    gantt.plugins = [buffer];
    await paint();
    expect(barFor(bufferEntryId).classList.contains('demo-buffer-bar')).toBe(true);
    expect(barFor(riskEntryId).classList.contains('demo-risk-bar')).toBe(false);

    gantt.destroy();
    container.remove();
  });

  it('[Q10] two plugins claiming the same entry: the first claim paints, and the collision is reported', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // The same Entry, marked for both plugins' rules. The `[review P2]` test above marks disjoint
    // rows, so it never exercises this — nothing in the suite pinned a collision before Q10.
    const sharedEntryId = sampleEntries[0]!.id;
    const dataset = markedDataset({ buffer: [sharedEntryId], risk: [sharedEntryId] }, 1);
    const buffer = bufferKind();
    const risk = riskKind();
    const reports: ErrorReport[] = [];
    // Subscribed before the plugins install: a variant resolves during the constructor's own first
    // paint, so a handler added after that call has already missed the first collision.
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    gantt.plugins = [buffer, risk];
    const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));
    await paint();

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;

    // The newest rule wins (`Q5`). `riskKind` installed last, so the bar wears 'risk', not 'buffer'.
    expect(bar.getAttribute('data-variant')).toBe('risk');
    expect(bar.classList.contains('demo-risk-bar')).toBe(true);
    expect(bar.classList.contains('demo-buffer-bar')).toBe(false);

    // The library reports and continues; it never arbitrates between two plugins the consumer
    // chose to install. The report names both variants and both plugin ids.
    const collision = reports.find((report) => report.code === 'variant-claimed-twice');
    expect(collision).toBeDefined();
    expect(collision?.severity).toBe('warning');
    expect(collision?.by).toBe('core');
    expect(collision?.entryId).toBe(sharedEntryId);
    expect(collision?.message).toContain('demo.bufferKind');
    expect(collision?.message).toContain('demo.riskKind');

    // Dropping the winner hands the Entry to the rule that was losing.
    gantt.plugins = [buffer];
    await paint();
    const afterDrop = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(afterDrop.getAttribute('data-variant')).toBe('buffer');

    gantt.destroy();
    container.remove();
  });

  it('[Q10] one report per colliding pair, however many times a variant resolves', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // Both rules claim both entries, and a variant resolves once per Entry per frame. A collision
    // reported per resolution would bury the consumer's console.
    const owned = [sampleEntries[0]!.id, sampleEntries[1]!.id];
    const dataset = markedDataset({ buffer: owned, risk: owned });
    const reports: ErrorReport[] = [];
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    gantt.plugins = [bufferKind(), riskKind()];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(reports.filter((report) => report.code === 'variant-claimed-twice')).toHaveLength(1);

    gantt.destroy();
    container.remove();
  });

  it('[J59] reports a variant rule that matches on a key no Field declares', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // A typo in a `when` claims no row, and it must not take the layout pass down. Silence was the
    // remaining half of `J59`: the rule stopped matching and nothing said why.
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const reports: ErrorReport[] = [];
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    // Assigned after the subscription, not passed to the constructor: a variant in `GanttOptions`
    // resolves during the constructor's own first paint, the same trap `Q10`'s test above names.
    gantt.variants = [{ name: 'typo', when: { notAField: true }, paint: () => ({ class: { typo: true } }) }];
    // One report for the rule and the key, however many rows resolve and however many frames run.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    gantt.rowSource = { ...gantt.rowSource };
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const missing = reports.filter((report) => report.code === 'unknown-variant-field');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe('warning');
    expect(missing[0]?.field).toBe('notAField');
    expect(missing[0]?.message).toContain("'typo'");
    expect(container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);

    gantt.destroy();
    container.remove();
  });

  // ADR 0018, *How an app pins one row*: this is the whole of what a stored variant was going to
  // buy, and it costs core nothing. The word is the consumer's, the write is an ordinary Field
  // write, and the rule reads it back.
  it('pins one row by writing the data: the write lands in a ChangeSet, undoes, and repaints', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const pinned = sampleEntries[0]!.id;
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'milestone' }],
      entries: [sampleEntries[0]!.toInput()],
    });
    const gantt = new Gantt({
      container,
      dataset,
      variants: [
        {
          name: 'milestone',
          when: { milestone: true },
          paint: () => ({ class: { 'my-diamond': true } }),
        },
      ],
    });
    const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['variant']).toBe('leaf');

    const changes: ChangeSet[] = [];
    dataset.on('change', ({ changeSet }) => {
      changes.push(changeSet);
    });

    dataset.entries.update(pinned, { milestone: true });
    await paint();

    // The write is an ordinary Field write, so it arrives as one `{ from, to }` like any other.
    expect(changes).toHaveLength(1);
    const written = changes[0]!.updated.filter((row) => 'field' in row);
    expect(written).toContainEqual(
      expect.objectContaining({ id: pinned, field: 'milestone', from: undefined, to: true }),
    );

    // The rule read it back, and the same node repainted (I8).
    expect(container.querySelector('.fg-bar')).toBe(bar);
    expect(bar.dataset['variant']).toBe('milestone');
    expect(bar.classList.contains('my-diamond')).toBe(true);

    expect(dataset.canUndo).toBe(true);
    dataset.undo();
    await paint();
    expect(bar.dataset['variant']).toBe('leaf');
    expect(bar.classList.contains('my-diamond')).toBe(false);

    gantt.destroy();
    container.remove();
  });

  it("[S5-A3] the 'buffer' kind lives in harness/plugins/buffer-kind.ts alone — no src/ non-test file names it", async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(path.join(root, 'src'));
    // The bare word "buffer" is ordinary English (a culling buffer, a scroll buffer) — the claim is
    // narrower: no file names the kind *as a string literal*, `'buffer'`/`"buffer"`.
    const hits = files.filter((file) => /['"]buffer['"]/.test(readFileSync(file, 'utf8')));
    expect(hits.map((file) => path.relative(root, file))).toEqual([]);
  });
});

describe('Gantt selection (S3.1, D-S3-10, [S3-A1])', () => {
  it('gantt.selectedSegmentIds = [id] is live and loose in, branded out', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);
    expect(gantt.selectedSegmentIds).toEqual(dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]));
    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('selectedEntries resolves the Selection through the bound dataset, in row order', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    // #212: the Selection is proposed in click order, and both readings come back in row order.
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([
      sampleEntries[1]!.id,
      sampleEntries[0]!.id,
    ]);
    expect(gantt.selectedEntries).toEqual([
      dataset.entries.get(sampleEntries[0]!.id),
      dataset.entries.get(sampleEntries[1]!.id),
    ]);

    gantt.destroy();
  });

  it('selectedEntries skips ids no longer in the store and re-reads field edits', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([
      sampleEntries[0]!.id,
      sampleEntries[1]!.id,
    ]);

    dataset.entries.remove(sampleEntries[1]!.id);
    expect(gantt.selectedEntries).toEqual([dataset.entries.get(sampleEntries[0]!.id)]);

    dataset.entries.update(sampleEntries[0]!.id, { name: 'Renamed' });
    expect(gantt.selectedEntries[0]!.name).toBe('Renamed');

    gantt.destroy();
  });

  it('assignment runs beforeSelectionChange → selectionChange, and dataset.on("change") never fires', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const before: unknown[] = [];
    const after: unknown[] = [];
    const datasetChanges: unknown[] = [];
    gantt.on('beforeSelectionChange', (p) => {
      before.push(p);
    });
    gantt.on('selectionChange', (p) => {
      after.push(p);
    });
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);

    expect(before).toEqual([{ from: [], to: dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]) }]);
    expect(after).toEqual([{ from: [], to: dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]) }]);
    expect(datasetChanges).toEqual([]);

    gantt.destroy();
  });

  it('beforeSelectionChange returning false vetoes the change: selection stays put', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);

    gantt.on('beforeSelectionChange', () => false);
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[1]!.id]);

    expect(gantt.selectedSegmentIds).toEqual(dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]));

    gantt.destroy();
  });

  it('a non-empty-click, non-Escape assignment with an identical set is a no-op (no events)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);

    const after: unknown[] = [];
    gantt.on('selectionChange', (p) => {
      after.push(p);
    });
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);

    expect(after).toEqual([]);

    gantt.destroy();
  });

  it('a real click selects the bar and paints data-state~="selected"', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);
    expect(bar.dataset['state']).toBe('selected');

    document.elementFromPoint = original;
    gantt.destroy();
  });
});

/** One plain Entry and one that draws two bars — the smallest dataset that tells "the Segment the
 *  pointer named" from "every Segment the row owns". Module-scoped: the Delete-key describe block
 *  below shares this fixture with the Segment-selection tests, rather than re-declaring it. */
const SEGMENTED_ENTRIES = [
  { id: 'plain', name: 'Plain', start: '2026-09-01', end: '2026-09-03' },
  {
    id: 'split',
    name: 'Split',
    start: '2026-09-01',
    end: '2026-09-09',
    segments: [
      { id: 'split-a', start: '2026-09-01', end: '2026-09-03' },
      { id: 'split-b', start: '2026-09-05', end: '2026-09-09' },
    ],
  },
];

function makeSegmentedGantt(): { container: HTMLElement; gantt: Gantt; dataset: Dataset } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: SEGMENTED_ENTRIES, timeZone: 'UTC' });
  return { container, gantt: new Gantt({ container, dataset }), dataset };
}

describe('Gantt selection over Segments (ADR 0010, #212)', () => {
  /** Points `elementFromPoint` at one node, the way every other pointer test in this file does. */
  function clickTimelineOn(container: HTMLElement, node: HTMLElement): void {
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? node : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));
    document.elementFromPoint = original;
  }

  it('a timeline click selects the one Segment the bar drew', () => {
    const { container, gantt } = makeSegmentedGantt();
    const second = container.querySelector<HTMLElement>('.fg-bar[data-segment-id="split-b"]')!;

    clickTimelineOn(container, second);

    expect(gantt.selectedSegmentIds).toEqual(['split-b']);
    expect(gantt.selectedEntryIds).toEqual(['split']);
    const first = container.querySelector<HTMLElement>('.fg-bar[data-segment-id="split-a"]')!;
    expect(second.dataset['state']).toBe('selected');
    expect(first.dataset['state'] ?? '').toBe('');

    gantt.destroy();
    container.remove();
  });

  it('a grid-pane click selects every Segment of the row', () => {
    const { container, gantt } = makeSegmentedGantt();
    const row = container.querySelector<HTMLElement>('.fg-row[data-entry-id="split"]')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));

    row.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, bubbles: true }));
    document.elementFromPoint = original;

    expect(gantt.selectedSegmentIds).toEqual(['split-a', 'split-b']);
    expect(gantt.selectedEntryIds).toEqual(['split']);

    gantt.destroy();
    container.remove();
  });

  it('ctrl-click collects Segments across two Entries', () => {
    const { container, gantt } = makeSegmentedGantt();
    const plain = container.querySelector<HTMLElement>('.fg-bar[data-item-id="plain:0"]')!;

    clickTimelineOn(container, container.querySelector<HTMLElement>('.fg-bar[data-segment-id="split-a"]')!);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? plain : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, ctrlKey: true }));
    document.elementFromPoint = original;

    expect(gantt.selectedSegmentIds).toHaveLength(2);
    expect(gantt.selectedEntryIds).toEqual(['plain', 'split']);

    gantt.destroy();
    container.remove();
  });

  /** Shift-ranges from the `plain` row to `segmentId`, and reports what ends up selected. */
  function shiftRangeFromPlainTo(container: HTMLElement, segmentId: string): void {
    const plainBar = container.querySelector<HTMLElement>('.fg-bar[data-item-id="plain:0"]')!;
    clickTimelineOn(container, plainBar);
    const original = document.elementFromPoint.bind(document);
    const target = container.querySelector<HTMLElement>(`.fg-bar[data-segment-id="${segmentId}"]`)!;
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? target : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, shiftKey: true }));
    document.elementFromPoint = original;
  }

  it('a shift-range ends on the Segment it landed on, not the end of that row', () => {
    const { container, gantt } = makeSegmentedGantt();

    shiftRangeFromPlainTo(container, 'split-a');

    // The Selection holds Segments, so the range steps over Segments. `split-b` draws after
    // `split-a` in the same row, so the range stops before it.
    expect(gantt.selectedSegmentIds).toContain('split-a');
    expect(gantt.selectedSegmentIds).not.toContain('split-b');
    expect(gantt.selectedEntryIds).toEqual(['plain', 'split']);

    gantt.destroy();
    container.remove();
  });

  it('a shift-range that reaches the last Segment of a row takes the whole row', () => {
    const { container, gantt } = makeSegmentedGantt();

    shiftRangeFromPlainTo(container, 'split-b');

    expect(gantt.selectedSegmentIds).toContain('split-a');
    expect(gantt.selectedSegmentIds).toContain('split-b');
    expect(gantt.selectedEntryIds).toEqual(['plain', 'split']);

    gantt.destroy();
    container.remove();
  });

  it('selectedEntryIds dedupes two Segments of one Entry into one Entry, in row order', () => {
    const { container, gantt } = makeSegmentedGantt();

    // Proposed out of row order, and with two Segments of the same Entry.
    gantt.selectedSegmentIds = ['split-b', 'split-a'];

    expect(gantt.selectedEntryIds).toEqual(['split']);
    expect(gantt.selectedEntries.map((entry) => entry.id)).toEqual(['split']);

    gantt.destroy();
    container.remove();
  });

  it('Mod+Arrow steps the Selection between the Segments of one row', () => {
    const { container, gantt } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];

    const step = (key: string): void => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
    };

    step('ArrowRight');
    expect(gantt.selectedSegmentIds).toEqual(['split-b']);

    // The row has no third Segment, so the chord clamps rather than leaving the row.
    step('ArrowRight');
    expect(gantt.selectedSegmentIds).toEqual(['split-b']);

    step('ArrowLeft');
    expect(gantt.selectedSegmentIds).toEqual(['split-a']);

    gantt.destroy();
    container.remove();
  });

  it('a Segment the Dataset dropped never reaches a plugin through targetUnder (#212)', async () => {
    // The surface a plugin author actually meets. A right-click Delete reads `segmentIds` off this
    // target and hands them to `removeSegments`, which throws on an id the Dataset no longer holds.
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ entries: SEGMENTED_ENTRIES, timeZone: 'UTC' });
    let dom: GanttDom | undefined;
    const grabDom: ChromePlugin = {
      id: 'test.grabDom',
      view: (ctx) => {
        dom = ctx.view.dom;
      },
    };
    const gantt = new Gantt({ container, dataset, plugins: [grabDom] });
    const firstBar = container.querySelector<HTMLElement>('.fg-bar[data-item-id="split:0"]')!;
    // Read it once while `split-a` is still there, so the pointer memo holds that answer too.
    expect(dom!.targetUnder(firstBar)?.segmentIds).toEqual(['split-a']);

    dataset.entries.removeSegments(['split-a']);
    // `targetUnder` describes the frame on screen, so the answer moves when the next frame paints.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // The bar key is `split:0` either way, so the node survives and now draws `split-b`.
    const survivor = container.querySelector<HTMLElement>('.fg-bar[data-item-id="split:0"]')!;
    expect(survivor).toBe(firstBar);
    const reported = dom!.targetUnder(survivor)!.segmentIds;
    expect(reported).toEqual(['split-b']);
    // The contract, stated as the caller uses it: every id this names is one the Dataset still holds.
    expect(() => dataset.entries.removeSegments([...reported])).not.toThrow();

    gantt.destroy();
    container.remove();
  });

  it('a Mod+Arrow step never also nudges the entry it reselected', () => {
    const { container, gantt } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];
    const moves: unknown[] = [];
    gantt.on('entryMove', (payload) => {
      moves.push(payload);
    });

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }),
    );

    expect(moves).toEqual([]);

    gantt.destroy();
    container.remove();
  });

  // #230 R0: the Mod+Arrow test above drives the chord, not the two commands it binds, and it never
  // presses the low-end clamp or a one-Segment row. This pins both commands directly, both clamps.
  it('freegantt.selectNextSegment/selectPreviousSegment step within a row and clamp at both ends', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];

    // Already at the row's first Segment: stepping back clamps rather than leaving the row.
    gantt.commands.run('freegantt.selectPreviousSegment');
    expect(gantt.selectedSegmentIds).toEqual(['split-a']);

    gantt.commands.run('freegantt.selectNextSegment');
    expect(gantt.selectedSegmentIds).toEqual(['split-b']);

    // Already at the row's last Segment: stepping forward clamps too.
    gantt.commands.run('freegantt.selectNextSegment');
    expect(gantt.selectedSegmentIds).toEqual(['split-b']);

    gantt.commands.run('freegantt.selectPreviousSegment');
    expect(gantt.selectedSegmentIds).toEqual(['split-a']);

    // A row that draws one bar (the 'plain' entry) has nowhere to step, either direction.
    const onlySegment = dataset.entries.segmentIdsOfEntries(['plain']);
    gantt.selectedSegmentIds = onlySegment;
    gantt.commands.run('freegantt.selectNextSegment');
    expect(gantt.selectedSegmentIds).toEqual(onlySegment);
    gantt.commands.run('freegantt.selectPreviousSegment');
    expect(gantt.selectedSegmentIds).toEqual(onlySegment);

    gantt.destroy();
    container.remove();
  });
});

describe('Gantt Delete key (ADR 0010, #212)', () => {
  const pressDelete = (container: HTMLElement): void => {
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  };

  it('Delete removes the selected Segment, leaving the Entry with its remaining ones', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];

    pressDelete(container);

    const split = dataset.entries.get('split');
    expect(split?.segments.map((s) => s.id)).toEqual(['split-b']);

    gantt.destroy();
    container.remove();
  });

  it("deleting an Entry's last Segment keeps the Entry dateless, and one undo restores it (ADR 0012)", () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    // "plain" draws a single Segment ingest filled in. Removing that one Segment no longer removes
    // the Entry (ADR 0012 supersedes ADR 0010's own removal here): the row stays, dateless.
    const plainSegmentIds = dataset.entries.get('plain')!.segments.map((s) => s.id);
    gantt.selectedSegmentIds = plainSegmentIds;

    pressDelete(container);

    const cleared = dataset.entries.get('plain');
    expect(cleared).toBeDefined();
    expect(cleared?.start).toBeUndefined();
    expect(cleared?.end).toBeUndefined();
    expect(cleared?.segments).toHaveLength(0);

    dataset.undo();

    const restored = dataset.entries.get('plain');
    expect(restored).toBeDefined();
    expect(restored?.segments.map((s) => s.id)).toEqual(plainSegmentIds);

    gantt.destroy();
    container.remove();
  });

  it('the Delete key and gantt.commands.run() invoke the one registered command (D-S5-14)', () => {
    // The context menu's own item click also reaches `command.run(ctx)` with no second `run` of its
    // own (`extensions/features/context-menu.ts`) — this pins that the chord and a direct
    // `commands.run(id)` call, the menu's own mechanism, land on that same registered command and
    // produce the identical mutation, not two implementations that could drift apart.
    const viaKey = makeSegmentedGantt();
    viaKey.gantt.selectedSegmentIds = ['split-a'];
    pressDelete(viaKey.container);
    const afterKey = viaKey.dataset.entries.get('split')?.segments.map((s) => s.id);

    const viaCommand = makeSegmentedGantt();
    viaCommand.gantt.selectedSegmentIds = ['split-a'];
    viaCommand.gantt.commands.run('freegantt.deleteSelection');
    const afterCommand = viaCommand.dataset.entries.get('split')?.segments.map((s) => s.id);

    expect(afterKey).toEqual(afterCommand);

    viaKey.gantt.destroy();
    viaKey.container.remove();
    viaCommand.gantt.destroy();
    viaCommand.container.remove();
  });

  it('Delete does nothing while the keydown target is editable (issue #137 F7)', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];

    const input = document.createElement('input');
    container.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(dataset.entries.get('split')?.segments.map((s) => s.id)).toEqual(['split-a', 'split-b']);

    gantt.destroy();
    container.remove();
  });

  it('nothing selected: Delete has no target and removes nothing', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedSegmentIds = [];

    pressDelete(container);

    expect(dataset.entries.get('split')?.segments.map((s) => s.id)).toEqual(['split-a', 'split-b']);
    expect(dataset.entries.get('plain')).toBeDefined();

    gantt.destroy();
    container.remove();
  });

  it('a beforeChange refusal is a no-op: no error escapes, and the Entry survives', () => {
    // A cancel is a normal outcome, not a fault (`api/attemptMutation`'s own rule). `view/` cannot
    // import `api/`, so `freegantt.deleteSelection` repeats that one swallow inline — this pins it.
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedSegmentIds = ['split-a'];
    dataset.on('beforeChange', () => false);

    expect(() => pressDelete(container)).not.toThrow();
    expect(dataset.entries.get('split')?.segments.map((s) => s.id)).toEqual(['split-a', 'split-b']);

    gantt.destroy();
    container.remove();
  });
});
describe('Gantt interactions / capability hot path (S3.2, D-S3-9, [S3-A3]/[S3-A5])', () => {
  it('a resize-incapable entry renders no handle on hover ([S3-A5])', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { resize: false } });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);
    expect(bar.hasAttribute('data-movable')).toBe(true); // move is untouched by this rule

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('a roll-up parent takes the grab cursor and still gets no handle (ADR 0013)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      // A childless parent holds no dates and draws no bar at all (ADR 0012), so this gives it one
      // child to roll up from — the case a real "collapsed group" row is always in. It needs no
      // stored classification (ADR 0013): having a child already draws the parent look.
      entries: [
        { id: 'g1', name: 'Group' },
        { ...sampleEntries[0]!.toInput(), parentId: 'g1' },
        ...sampleEntries.slice(1),
      ],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({ container, dataset });

    const summaryBar = container.querySelector<HTMLElement>('[data-variant="summary"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => summaryBar;
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    // ADR 0013: the parent's own dates roll up, and dragging its bar translates the dated
    // descendants below it. So the move is offered, and the resize is not — one edge of a derived
    // envelope names no descendant to resize.
    expect(summaryBar.hasAttribute('data-movable')).toBe(true);
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('gantt.selectedSegmentIds still accepts a select-incapable Entry — the setter does not consult can("select") (D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { select: false } });

    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([sampleEntries[0]!.id]);
    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('a select-incapable bar refuses a pointer click', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { select: false } });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(gantt.selectedSegmentIds).toEqual([]);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('reassigning interactions re-resolves the affordance ids without a new pointer move', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    expect(bar.hasAttribute('data-movable')).toBe(true);

    gantt.interactions = { move: false };
    expect(bar.hasAttribute('data-movable')).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  // #195, D-S5-35: `gantt.interactions = { resize: false }` is the whole config, so a page that
  // flips one gesture with it drops every other rule it holds. These six cover the two verbs that
  // write one gesture instead.
  it('setCapabilityRule writes one gesture and leaves every other rule standing (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { move: false, select: false } });

    gantt.setCapabilityRule('resize', false);

    expect(gantt.interactions).toEqual({ move: false, select: false, resize: false });

    gantt.destroy();
  });

  it('setCapabilityRule never mutates the object the consumer assigned (#187, #195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const assigned = { move: false };
    const gantt = new Gantt({ container, dataset, interactions: assigned });

    gantt.setCapabilityRule('resize', false);

    expect(assigned).toEqual({ move: false });
    expect(gantt.interactions).not.toBe(assigned);

    gantt.destroy();
  });

  it('setCapabilityRule takes a predicate, like the config key it writes (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    expect(bar.hasAttribute('data-movable')).toBe(true);

    gantt.setCapabilityRule('move', (entry) => entry.id !== sampleEntries[0]!.id);
    expect(bar.hasAttribute('data-movable')).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('setCapabilityRule re-resolves the affordance ids without a new pointer move (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    gantt.setCapabilityRule('resize', false);
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('clearCapabilityRule restores a registered look default, which `true` would not (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [{ id: 'm1', name: 'Ship', start: '2026-09-01', end: '2026-09-01' }, ...sampleEntries],
      timeZone: 'UTC',
    });
    // ADR 0018: core ships no 'milestone' variant and no default resize refusal for any row. A
    // variant owns that default now, so this test states one inline to give `clearCapabilityRule`
    // a non-`true` answer to fall back to.
    const gantt = new Gantt({
      container,
      dataset,
      variants: [{ name: 'milestone', when: (entry) => entry.id === 'm1', can: { resize: false } }],
    });

    const milestoneBar = container.querySelector<HTMLElement>('[data-variant="milestone"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => milestoneBar;
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    // The plugin's registered default refuses resize for this look, and `true` overrides that
    // default. Its `start` and `end` are ordinary stored values, so nothing else stands in the way
    // once the gesture is offered (#256).
    gantt.setCapabilityRule('resize', true);
    expect(container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!.hidden).toBe(false);

    gantt.clearCapabilityRule('resize');
    expect(container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!.hidden).toBe(true);
    expect(gantt.interactions).toEqual({});

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('interactions.resize offers the gesture and still cannot write a derived date (#256)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      // A childless entry holds no dates and draws no bar at all (ADR 0012), so this gives 'g1' one
      // child to roll up from — it needs no stored classification to draw the parent look (ADR 0013).
      entries: [
        { id: 'g1', name: 'Group' },
        { ...sampleEntries[0]!.toInput(), parentId: 'g1' },
        ...sampleEntries.slice(1),
      ],
      timeZone: 'UTC',
    });
    // `resize: true` says which entries offer the gesture. It does not say whether the values that
    // gesture writes may change — a roll-up parent's `start` and `end` come from its children, and
    // `canWrite` is the one place that answers so (#256). Before this, `true` opened the handles and
    // the drag committed a write the Rollup pass immediately took back.
    const gantt = new Gantt({ container, dataset, interactions: { resize: true } });

    const summaryBar = container.querySelector<HTMLElement>('[data-variant="summary"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => summaryBar;
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    expect(container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('clearCapabilityRule leaves the other rules alone, and a gesture with no rule is a no-op (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { move: false, resize: false } });

    gantt.clearCapabilityRule('resize');
    expect(gantt.interactions).toEqual({ move: false });

    const before = gantt.interactions;
    gantt.clearCapabilityRule('select');
    expect(gantt.interactions).toBe(before);

    gantt.destroy();
  });
});

describe('Gantt entryMove (S3.3, [S3-A1] move half, [S3-A6])', () => {
  function stubPointerCapture(el: HTMLElement): void {
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
  }

  it('a real drag past the threshold fires beforeEntryMove/entryMove, writes the dataset once, and undo reverts it in one step', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);

    const beforeEvents: unknown[] = [];
    const afterEvents: unknown[] = [];
    gantt.on('beforeEntryMove', (p) => {
      beforeEvents.push(p);
    });
    gantt.on('entryMove', (p) => {
      afterEvents.push(p);
    });
    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    expect(beforeEvents).toHaveLength(1);
    expect(afterEvents).toHaveLength(1);
    const proposed = afterEvents[0] as { entry: unknown; start: unknown; end: unknown };
    expect(proposed.entry).toBe(id);
    expect(proposed.start).not.toBe(before.start);
    expect(datasetChanges).toHaveLength(1); // one transaction, D-S3-16

    const moved = dataset.entries.get(id)!;
    expect(moved.start).toBe(proposed.start);
    expect(moved.end).toBe(proposed.end);
    expect(moved.start).not.toBe(before.start);

    expect(dataset.canUndo).toBe(true);
    dataset.undo();
    const reverted = dataset.entries.get(id)!;
    expect(reverted.start).toBe(before.start);
    expect(reverted.end).toBe(before.end);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('beforeEntryMove returning false vetoes the commit: the dataset is untouched', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    gantt.on('beforeEntryMove', () => false);

    const afterEvents: unknown[] = [];
    gantt.on('entryMove', (p) => {
      afterEvents.push(p);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    expect(afterEvents).toEqual([]);
    expect(datesOf(dataset.entries.get(id)!)).toEqual(before);
    expect(dataset.canUndo).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });
});

describe('Gantt entryResize (S3.4, [S3-A1] resize half)', () => {
  function stubPointerCapture(el: HTMLElement): void {
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
  }

  it('a real drag on the end handle fires beforeEntryResize/entryResize, writes the dataset once, and undo reverts it in one step', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    // Hover the bar first (D-S3-6): resizableEntryId only resolves once something is hovered or
    // singly selected, and only then does the handle pair stop being `hidden`.
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const endHandle = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    expect(endHandle.hidden).toBe(false);
    document.elementFromPoint = (x: number, y: number) => (x === 10 && y === 5 ? endHandle : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);

    const beforeEvents: unknown[] = [];
    const afterEvents: unknown[] = [];
    gantt.on('beforeEntryResize', (p) => {
      beforeEvents.push(p);
    });
    gantt.on('entryResize', (p) => {
      afterEvents.push(p);
    });
    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5010, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5010, clientY: 5, pointerId: 1 }));

    expect(beforeEvents).toHaveLength(1);
    expect(afterEvents).toHaveLength(1);
    const proposed = afterEvents[0] as { entry: unknown; start: unknown; end: unknown; edge: string };
    expect(proposed.entry).toBe(id);
    expect(proposed.edge).toBe('end');
    expect(proposed.start).toBe(before.start); // start edge untouched by an end-handle resize
    expect(proposed.end).not.toBe(before.end);
    expect(datasetChanges).toHaveLength(1); // one transaction, D-S3-16

    const resized = dataset.entries.get(id)!;
    expect(resized.start).toBe(before.start);
    expect(resized.end).toBe(proposed.end);
    expect(resized.end).not.toBe(before.end);

    expect(dataset.canUndo).toBe(true);
    dataset.undo();
    const reverted = dataset.entries.get(id)!;
    expect(reverted.start).toBe(before.start);
    expect(reverted.end).toBe(before.end);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('beforeEntryResize returning false vetoes the commit: the dataset is untouched', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const endHandle = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    document.elementFromPoint = (x: number, y: number) => (x === 10 && y === 5 ? endHandle : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    gantt.on('beforeEntryResize', () => false);

    const afterEvents: unknown[] = [];
    gantt.on('entryResize', (p) => {
      afterEvents.push(p);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5010, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5010, clientY: 5, pointerId: 1 }));

    expect(afterEvents).toEqual([]);
    expect(datesOf(dataset.entries.get(id)!)).toEqual(before);
    expect(dataset.canUndo).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('a resize-incapable look (a plugin default) never gets a resize handle to grab (D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [
        {
          id: 'm1',
          name: 'Milestone',
          start: sampleEntries[0]!.start!,
          end: sampleEntries[0]!.start!,
        },
      ],
      timeZone: 'UTC',
    });
    // ADR 0013: core ships no 'milestone' variant and refuses resize for no look by default — a
    // plugin owns that pair of registrations for the ids it claims
    // (`harness/plugins/milestone-kind.ts` is the real one; this inlines the smallest version of it).
    const gantt = new Gantt({
      container,
      dataset,
      variants: [{ name: 'milestone', when: (entry) => entry.id === 'm1', can: { resize: false } }],
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const endHandle = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    expect(endHandle.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });
});

describe('Gantt keyboard nudge (S3.5, [S3-A1] keyboard half, D-S3-13)', () => {
  it('ArrowRight on the timeline pane nudges the selected entry, one transaction, undo reverts', () => {
    // S5.11, D-S5-39: `attachKeyboardEditing` scopes to the timeline pane now, not the whole
    // container — a bar's nudge is that pane's own job.
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([id]);

    const beforeEvents: unknown[] = [];
    const afterEvents: unknown[] = [];
    gantt.on('beforeEntryMove', (p) => {
      beforeEvents.push(p);
    });
    gantt.on('entryMove', (p) => {
      afterEvents.push(p);
    });
    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(beforeEvents).toHaveLength(1);
    expect(afterEvents).toHaveLength(1);
    expect(datasetChanges).toHaveLength(1); // one transaction per keypress, I6

    const moved = dataset.entries.get(id)!;
    expect(moved.start).not.toBe(before.start);

    expect(dataset.canUndo).toBe(true);
    dataset.undo();
    expect(dataset.entries.get(id)!.start).toBe(before.start);

    gantt.destroy();
  });

  it('a plain arrow key does nothing while the selection is empty (S3.7 owns the pan bindings)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;

    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(datasetChanges).toEqual([]);
    gantt.destroy();
  });

  it('Shift+ArrowRight resizes the end edge of the selected entry', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([id]);

    const afterEvents: { edge: string }[] = [];
    gantt.on('entryResize', (p) => {
      afterEvents.push(p);
    });

    timeline.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );

    expect(afterEvents).toHaveLength(1);
    expect(afterEvents[0]!.edge).toBe('end');
    const resized = dataset.entries.get(id)!;
    expect(resized.start).toBe(before.start);
    expect(resized.end).not.toBe(before.end);

    gantt.destroy();
  });

  it('ArrowDown in the grid pane moves focus to the next row without writing the dataset', () => {
    // S5.11, D-S5-26: `view/roving-focus.ts` owns row-to-row movement now — a grid-pane arrow key,
    // not the timeline's own nudge chord.
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const rows = container.querySelector<HTMLElement>('.fg-rows')!;

    const secondId = entryId(sampleEntries[1]!.id);

    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    rows.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(gantt.selectedEntryIds).toEqual([secondId]);
    expect(datasetChanges).toEqual([]);

    gantt.destroy();
  });
});

describe('Gantt async veto and pending (S3.5, D-S3-17)', () => {
  function stubPointerCapture(el: HTMLElement): void {
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
  }

  it('a beforeEntryMove Promise holds the dragged bar data-state~="pending" until it settles', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.preset = { ...gantt.preset, snap: { unit: 'day', increment: 1 } };

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    let resolveVeto!: (allowed: boolean) => void;
    gantt.on(
      'beforeEntryMove',
      () =>
        new Promise<void | false>((resolve) => {
          resolveVeto = (allowed) => resolve(allowed ? undefined : false);
        }),
    );
    const afterEvents: unknown[] = [];
    gantt.on('entryMove', (p) => {
      afterEvents.push(p);
    });

    const originTransform = bar.style.transform;
    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const unsnappedPreview = bar.style.transform;
    expect(unsnappedPreview).not.toBe(originTransform);

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    expect(bar.dataset['state']).toContain('pending');
    const heldTransform = bar.style.transform;
    expect(heldTransform).not.toBe(originTransform);
    // D-S3-17: held paint is the snapped commit draft, not the last unsnapped pointer preview.
    expect(heldTransform).not.toBe(unsnappedPreview);
    expect(afterEvents).toEqual([]);

    resolveVeto(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(afterEvents).toHaveLength(1);
    expect(bar.dataset['state']).not.toContain('pending');

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('a beforeEntryMove Promise resolving false commits nothing and clears pending', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    let resolveVeto!: () => void;
    gantt.on(
      'beforeEntryMove',
      () =>
        new Promise<void | false>((resolve) => {
          resolveVeto = () => resolve(false);
        }),
    );

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    resolveVeto();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(datesOf(dataset.entries.get(id)!)).toEqual(before);
    expect(bar.dataset['state']).not.toContain('pending');
    expect(dataset.canUndo).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  // #273: a collaborator's write lands while the veto is still pending. The settle must not
  // overwrite it with the drag's own pointerup-era instants — it refuses instead, cleanly, and the
  // collaborator's write stands.
  it('a collaborator write during the hold wins over a settle that resolves true (#273)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    let resolveVeto!: (allowed: boolean) => void;
    gantt.on(
      'beforeEntryMove',
      () =>
        new Promise<void | false>((resolve) => {
          resolveVeto = (allowed) => resolve(allowed ? undefined : false);
        }),
    );
    const errors: ErrorReport[] = [];
    gantt.on('error', (report) => {
      errors.push(report);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    expect(bar.dataset['state']).toContain('pending');

    // The collaborator writes the same row from outside, while the drag's own veto is still
    // pending — a websocket push, another tab, anything that is not this drag.
    const collaboratorStart = instant('2031-01-15T00:00:00Z');
    const collaboratorEnd = instant('2031-01-20T00:00:00Z');
    dataset.entries.update(id, { start: collaboratorStart, end: collaboratorEnd });

    resolveVeto(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const settled = dataset.entries.get(id)!;
    expect(settled.start).toBe(collaboratorStart);
    expect(settled.end).toBe(collaboratorEnd);
    expect(errors).toHaveLength(1);
    expect(bar.dataset['state']).not.toContain('pending');

    document.elementFromPoint = original;
    gantt.destroy();
  });
});

describe('Gantt viewport gestures (S3.7, [S3-A7], D-S3-14)', () => {
  // happy-dom's WheelEvent drops MouseEvent fields from the init dict (ctrlKey, clientX).
  function wheel(props: {
    deltaY?: number;
    clientX?: number;
    ctrlKey?: boolean;
    shiftKey?: boolean;
  }): WheelEvent {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: props.deltaY ?? 0,
    });
    Object.defineProperty(event, 'ctrlKey', { value: props.ctrlKey ?? false });
    Object.defineProperty(event, 'shiftKey', { value: props.shiftKey ?? false });
    Object.defineProperty(event, 'metaKey', { value: false });
    Object.defineProperty(event, 'clientX', { value: props.clientX ?? 0 });
    return event;
  }
  function mount(): {
    container: HTMLElement;
    gantt: Gantt;
    dataset: Dataset;
    scroll: ScrollModel;
    scale: TimeScaleModel;
    timeline: HTMLElement;
  } {
    const container = document.createElement('div');
    const scroll = new ScrollModel();
    const scale = new TimeScaleModel({ fit: 'preset', preset: 'day' });
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, scale, scroll });
    FakeResizeObserver.instances.at(-1)!.fire({ width: 300, height: 100 });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0 }) as DOMRect;
    return { container, gantt, dataset, scroll, scale, timeline };
  }

  it('[S3-A7] ctrl+wheel zooms, anchored; shift+wheel pans; Mod+Home/End pan; dataset.on("change") never fires', () => {
    // S5.11, D-S5-26: bare `PageDown`/`Home`/`End` moved off the timeline this slice — the grid
    // pane's `RovingFocus` now owns them, for paging and jumping between rows (`roving-focus.test.ts`
    // covers that). The timeline keeps `Mod+Home`/`Mod+End` as its own axis-wide fallback.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const a = mount();
      const b = mount();
      const changes: unknown[] = [];
      a.dataset.on('change', (c) => {
        changes.push(c);
      });

      const presetBefore = a.gantt.preset.id;
      a.timeline.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 0 }));
      b.timeline.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 150 }));

      expect(a.gantt.preset.id).not.toBe(presetBefore);
      expect(b.gantt.preset.id).toBe(a.gantt.preset.id);
      expect(a.scroll.state.position.x).not.toBe(b.scroll.state.position.x);

      const xBeforePan = a.scroll.state.position.x;
      a.timeline.dispatchEvent(wheel({ shiftKey: true, deltaY: 80 }));
      expect(a.scroll.state.position.x).toBe(xBeforePan + 80);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position.x).toBe(0);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position.x).toBe(a.scroll.state.max.x);

      expect(changes).toEqual([]);

      a.gantt.destroy();
      b.gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('viewportGestures: false leaves ctrl+wheel and keyboard pan inert; zoomBy still works', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollModel();
      const scale = new TimeScaleModel({ fit: 'preset', preset: 'day' });
      const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
      const gantt = new Gantt({
        container,
        dataset,
        scale,
        scroll,
        viewportGestures: false,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
      timeline.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0 }) as DOMRect;

      const pxBefore = scale.scale.pxPerMs;
      const presetBefore = gantt.preset.id;
      const xBefore = scroll.state.position.x;
      timeline.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 0 }));
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      expect(gantt.preset.id).toBe(presetBefore);
      expect(scale.scale.pxPerMs).toBe(pxBefore);
      expect(scroll.state.position.x).toBe(xBefore);

      gantt.zoomBy(2);
      expect(scale.scale.pxPerMs).toBeGreaterThan(pxBefore);

      gantt.viewportGestures = { wheelZoom: true };
      timeline.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 0 }));
      expect(gantt.preset.id).not.toBe(presetBefore);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Gantt rows and collapse (S4.6)', () => {
  it('[S4-A3] switching rows re-resolves with no remount and keeps the scroll position', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const container = document.createElement('div');
    const scroll = new ScrollModel();
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      scroll,
      rowSource: { source: 'entries', tree: true },
    });
    FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
    scroll.panTo({ x: 0, y: 80 });
    const yBefore = scroll.state.position.y;
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const itemId = bar.dataset['itemId'];

    gantt.rowSource = { source: 'group', groupBy: (entry: Entry) => entry.name };
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(container.querySelector(`[data-item-id="${itemId}"]`)).toBe(bar);
    expect(scroll.state.position.y).toBe(yBefore);

    gantt.destroy();
    vi.unstubAllGlobals();
  });

  it('[S4-A6] collapse survives add/update/remove, a veto restores, and two Gantts stay independent', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c', name: 'c', start: '2026-01-03', end: '2026-01-04', parentId: 'p' },
      ],
    });
    const a = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });
    const b = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });
    a.collapse('p');
    expect(a.collapsed).toEqual([entryId('p')]);
    expect(b.collapsed).toEqual([]);

    dataset.entries.remove('c');
    dataset.entries.update('p', { name: 'still p' });
    dataset.entries.add({ id: 'n', name: 'n', start: '2026-01-05', end: '2026-01-06' });
    expect(a.collapsed).toEqual([entryId('p')]);

    a.on('beforeCollapseChange', () => false);
    a.expand('p');
    expect(a.collapsed).toEqual([entryId('p')]);

    a.destroy();
    b.destroy();
  });

  it('collapseAll uses expandable planned row ids, including grouped headers', async () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      // `entry.read` refuses a key no Field declares (ADR 0017), so the group key is declared here.
      fields: [{ key: 'category' }],
      entries: [
        { id: 'p', name: 'p', start: '2026-01-01', end: '2026-01-02', props: { category: 'group' } },
        {
          id: 'c',
          name: 'c',
          start: '2026-01-03',
          end: '2026-01-04',
          parentId: 'p',
          props: { category: 'span' },
        },
        {
          id: 'solo',
          name: 'solo',
          start: '2026-01-05',
          end: '2026-01-06',
          props: { category: 'milestone' },
        },
      ],
    });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });

    gantt.collapseAll();
    expect(gantt.collapsed.map(String)).toEqual(['p']);

    gantt.expandAll();
    expect(gantt.collapsed).toEqual([]);

    gantt.rowSource = { source: 'group', groupBy: (item: Entry) => item.read('category') as string };
    await new Promise((resolve) => requestAnimationFrame(resolve));
    gantt.collapseAll();
    expect(gantt.collapsed.map(String)).toEqual(['group:group', 'group:span', 'group:milestone']);

    gantt.destroy();
  });

  it('[S4-A11] a custom source produces the resolver rows', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      rowSource: {
        source: 'custom',
        resolve: ({ entries }: { entries: readonly Entry[] }) => [
          { id: 'h', label: 'All' },
          { id: 'r0', entryIds: [entries[0]!.id] },
        ],
      },
    });
    expect(container.querySelector('[data-row-id="h"]')?.textContent).toContain('All');
    expect(container.querySelector(`[data-row-id="${sampleEntries[0]!.id}"]`)).toBeNull();
    expect(container.querySelector('[data-row-id="r0"]')).not.toBeNull();
    gantt.destroy();
  });
});

describe('Gantt scroll re-clamp when the row count shrinks', () => {
  it('never resets to 0, and a caller re-clamp brings it back inside bounds (D-S1.5-2)', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const container = document.createElement('div');
    const scroll = new ScrollModel();
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset, scroll });
    FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
    scroll.panTo({ x: 0, y: scroll.state.max.y });
    const yBefore = scroll.state.position.y;
    expect(yBefore).toBeGreaterThan(0);

    for (const entry of sampleEntries.slice(0, sampleEntries.length - 3)) {
      dataset.entries.remove(entry.id);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // D-S1.5-2: a shrink never rewrites `position` by itself — it stays exactly where the
    // caller last asked, even past the new, smaller `max`, until something re-clamps it.
    expect(scroll.state.position.y).toBe(yBefore);
    expect(scroll.state.position.y).not.toBe(0);

    scroll.panTo(scroll.state.position);
    expect(scroll.state.position.y).toBeGreaterThan(0);
    expect(scroll.state.position.y).toBeLessThanOrEqual(scroll.state.max.y);

    gantt.destroy();
    vi.unstubAllGlobals();
  });
});

describe('Gantt.plugins (S5.1, D-S5-1/D-S5-3)', () => {
  function makeGantt(container: HTMLElement, plugins?: import('./gantt.js').ChromePlugin[]) {
    return new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' }),
      ...(plugins !== undefined ? { plugins } : {}),
    });
  }

  it('sets up on construction and disposes on destroy()', () => {
    const log: string[] = [];
    const container = document.createElement('div');
    let seenGantt: unknown;
    const gantt = makeGantt(container, [
      {
        id: 'demo.log',
        view(ctx) {
          seenGantt = ctx.gantt;
          log.push('setup');
          return () => log.push('dispose');
        },
      },
    ]);

    expect(log).toEqual(['setup']);
    expect(seenGantt).toBe(gantt);

    gantt.destroy();

    expect(log).toEqual(['setup', 'dispose']);
  });

  it('a plugin reads the real Dataset and event bus off its context', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let sawEntryCount = -1;
    let firedGridWidthChange = false;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.reader',
          view(ctx) {
            sawEntryCount = ctx.dataset.entries.all.length;
            ctx.events.on('gridWidthChange', () => {
              firedGridWidthChange = true;
            });
            return () => {};
          },
        },
      ],
    });

    expect(sawEntryCount).toBe(2);

    gantt.gridWidth = gantt.gridWidth + 10;
    expect(firedGridWidthChange).toBe(true);

    gantt.destroy();
  });

  it('gantt.plugins = [...] adds and removes without a remount (bar nodes keep identity, I8)', () => {
    const container = document.createElement('div');
    const gantt = makeGantt(container, []);
    const barBefore = container.querySelector('.fg-bar');

    let disposed = false;
    gantt.plugins = [...gantt.plugins, { id: 'demo.added', view: () => () => (disposed = true) }];
    expect(gantt.plugins.map((p) => p.id)).toEqual(['demo.added']);
    expect(container.querySelector('.fg-bar')).toBe(barBefore);

    gantt.plugins = gantt.plugins.filter((p) => p.id !== 'demo.added');
    expect(disposed).toBe(true);
    expect(gantt.plugins).toEqual([]);

    gantt.destroy();
  });

  // #195, D-S5-36: adding one plugin at runtime used to mean restating the installed set —
  // `gantt.plugins = [...gantt.plugins, x]` to add and a `filter` to remove. `harness/main.ts` wrote
  // both, three times in one file.
  it('installPlugin adds one plugin and leaves the running ones untouched (#195)', () => {
    const log: string[] = [];
    const container = document.createElement('div');
    const gantt = makeGantt(container, [{ id: 'demo.first', view: () => () => log.push('first disposed') }]);
    const barBefore = container.querySelector('.fg-bar');

    gantt.installPlugin({
      id: 'demo.second',
      view: () => {
        log.push('second setup');
        return () => log.push('second disposed');
      },
    });

    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.first', 'demo.second']);
    expect(log).toEqual(['second setup']);
    expect(container.querySelector('.fg-bar')).toBe(barBefore);

    gantt.destroy();
  });

  it('installPlugin refuses an id that is already installed, and installs nothing (#195)', () => {
    const container = document.createElement('div');
    const gantt = makeGantt(container, [{ id: 'demo.only', view: () => () => {} }]);

    let secondSetupRan = false;
    expect(() =>
      gantt.installPlugin({
        id: 'demo.only',
        view: () => {
          secondSetupRan = true;
        },
      }),
    ).toThrow(DuplicatePluginIdError);
    expect(secondSetupRan).toBe(false);
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.only']);

    gantt.destroy();
  });

  it('uninstallPlugin disposes the one named, by the object the caller holds (#195)', () => {
    const log: string[] = [];
    const container = document.createElement('div');
    const kept: ChromePlugin = { id: 'demo.kept', view: () => () => log.push('kept disposed') };
    const dropped: ChromePlugin = { id: 'demo.dropped', view: () => () => log.push('dropped disposed') };
    const gantt = makeGantt(container, [kept, dropped]);

    gantt.uninstallPlugin(dropped);

    expect(log).toEqual(['dropped disposed']);
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.kept']);

    gantt.destroy();
  });

  it('uninstallPlugin takes the id on its own, for a plugin the page no longer holds (#195)', () => {
    let disposed = false;
    const container = document.createElement('div');
    const gantt = makeGantt(container, [{ id: 'demo.byId', view: () => () => (disposed = true) }]);

    gantt.uninstallPlugin('demo.byId');

    expect(disposed).toBe(true);
    expect(gantt.plugins).toEqual([]);

    gantt.destroy();
  });

  it('hasPlugin answers what a toggle reads, by id or by the object the caller holds (#195)', () => {
    const container = document.createElement('div');
    const plugin: ChromePlugin = { id: 'demo.toggled', view: () => () => {} };
    const gantt = makeGantt(container, []);

    expect(gantt.hasPlugin('demo.toggled')).toBe(false);

    gantt.installPlugin(plugin);

    expect(gantt.hasPlugin('demo.toggled')).toBe(true);
    expect(gantt.hasPlugin(plugin)).toBe(true);

    gantt.uninstallPlugin(plugin);

    expect(gantt.hasPlugin(plugin)).toBe(false);

    gantt.destroy();
  });

  it('uninstallPlugin throws for an id nothing installs, rather than doing nothing (#195)', () => {
    const container = document.createElement('div');
    const gantt = makeGantt(container, [{ id: 'demo.only', view: () => () => {} }]);

    expect(() => gantt.uninstallPlugin('demo.typo')).toThrow(PluginNotInstalledError);
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.only']);

    gantt.destroy();
  });

  it('destroy() disposes plugins before panes', () => {
    const container = document.createElement('div');
    let containerHadChildrenAtDispose = false;
    const gantt = makeGantt(container, [
      {
        id: 'demo.check',
        view: () => () => {
          containerHadChildrenAtDispose = container.children.length > 0;
        },
      },
    ]);

    gantt.destroy();

    expect(containerHadChildrenAtDispose).toBe(true);
  });

  it('two Gantts install independent plugin instances (I2)', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    const setups: string[] = [];
    const plugin = (label: string): import('./gantt.js').ChromePlugin => ({
      id: 'demo.shared-id',
      view: () => {
        setups.push(label);
        return () => {};
      },
    });
    const ganttA = makeGantt(containerA, [plugin('a')]);
    const ganttB = makeGantt(containerB, [plugin('b')]);

    expect(setups).toEqual(['a', 'b']);

    ganttA.destroy();
    ganttB.destroy();
  });
});

describe('Gantt.commands (S5.2, D-S5-6/D-S5-7)', () => {
  it("gantt.commands.run('freegantt.collapseAll') collapses", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [
        { id: 'p', name: 'Parent', start: '2024-01-01', end: '2024-01-05' },
        { id: 'c', name: 'Child', parentId: 'p', start: '2024-01-01', end: '2024-01-02' },
      ],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({ container, dataset, rowSource: { source: 'entries', tree: true } });

    expect(gantt.collapsed).toEqual([]);

    gantt.commands.run('freegantt.collapseAll');

    expect(gantt.collapsed).not.toEqual([]);

    gantt.destroy();
  });

  it('a command invoked with no right-click reads the Selection off ctx.target, not just ctx.entry (#212)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const [a, b] = dataset.entries.all;
    gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([a!.id, b!.id]);

    let reached: readonly string[] | undefined;
    gantt.commands.register({
      id: 'demo.reachedSelection',
      label: 'Reached',
      run: (ctx) => (reached = ctx.target?.entryIds),
    });

    // `run(id)` takes the same path a keyboard chord does — `GanttShell#buildCommandContext` — so a
    // command that reads `ctx.target.entryIds` sees the whole Selection here too, not only
    // `ctx.entry` (the first selected Entry alone).
    gantt.commands.run('demo.reachedSelection');

    expect(reached).toEqual([a!.id, b!.id]);

    gantt.destroy();
  });

  it('a plugin binding on Mod+A wins over core only while its when passes', () => {
    // S5.11, D-S5-26: `Mod+A` replaces the old exemplar `ArrowRight` here — plain `ArrowRight` is
    // no longer a core chord at all (roving focus owns the plain arrows now). `Mod+A` still binds
    // unconditionally to `freegantt.selectAll`, so it keeps this test's fallback-to-core check.
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let overrideEnabled = false;
    let overrideRuns = 0;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.override-select-all',
          view(ctx) {
            ctx.commands.register({
              id: 'demo.selectAllOverride',
              label: 'Demo override',
              when: () => overrideEnabled,
              run: () => {
                overrideRuns += 1;
              },
            });
            ctx.interaction.registerKeybinding({ chord: 'Mod+A', command: 'demo.selectAllOverride' });
            return () => {};
          },
        },
      ],
    });

    // The plugin's own `when` declines: falls through to core's Mod+A (selectAll), which still
    // runs and still prevents the browser's own default (a matched-but-declined binding is not a
    // miss).
    const notOverridden = container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(notOverridden).toBe(false);
    expect(overrideRuns).toBe(0);

    // Once the plugin's `when` passes, its own, newer binding wins over core — and only it runs.
    overrideEnabled = true;
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(overrideRuns).toBe(1);

    gantt.destroy();
  });

  it('ctx.commands.register() called after view() returns throws RegistrationClosedError (C2)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let capturedCommands: PluginContext['commands'] | undefined;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.late-register',
          view(ctx) {
            capturedCommands = ctx.commands;
            return () => {};
          },
        },
      ],
    });

    expect(() =>
      capturedCommands!.register({ id: 'demo.tooLate', label: 'Too late', run: () => {} }),
    ).toThrow(RegistrationClosedError);

    gantt.destroy();
  });

  it('variants.add/registerGridColumn called after view() returns each throw RegistrationClosedError (#152)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let capturedCtx: PluginContext | undefined;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.late-register-s5.9',
          view(ctx) {
            capturedCtx = ctx;
            return () => {};
          },
        },
      ],
    });

    expect(() => capturedCtx!.variants.add({ name: 'buffer', can: { resize: false } })).toThrow(
      RegistrationClosedError,
    );
    expect(() => capturedCtx!.view.registerGridColumn({ field: 'name' })).toThrow(RegistrationClosedError);

    gantt.destroy();
  });
});

describe('Gantt.interaction.registerKeyHandler out-of-container dismissal (issue #137 F1)', () => {
  it('a chord registered through ctx.interaction.registerKeyHandler still fires for a key event whose target sits outside the container', () => {
    // A popup opened from a trigger that lives outside the Gantt's own container (a toolbar button
    // in the consumer's own page, say) has no path through the container's own bubble-phase listener — this is
    // exactly the second regression the QC review found (F1): the old document-wide capture listener
    // C3 removed used to catch this, and nothing replaced it. `plans/reviews/2026-09-03-s5-start-fixes-qc.md`.
    const container = document.createElement('div');
    document.body.append(container);
    const outsideTrigger = document.createElement('button');
    document.body.append(outsideTrigger);

    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let handlerRuns = 0;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.outside-escape',
          view(ctx) {
            const unregister = ctx.interaction.registerKeyHandler('Escape', () => {
              handlerRuns += 1;
            });
            return () => unregister();
          },
        },
      ],
    });

    outsideTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(handlerRuns).toBe(1);

    // The container's own bubble-phase listener still resolves an in-container key event exactly
    // once — the document-level fallback does not double-fire it.
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(handlerRuns).toBe(2);

    gantt.destroy();
    outsideTrigger.remove();
    container.remove();
  });
});

describe('plugin registrations live exactly as long as their plugin (#155)', () => {
  it('a plugin renderer stops painting on uninstall, and the same plugin re-installs without colliding with itself', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const plugin = {
      id: 'demo.cellRenderer',
      view(ctx: PluginContext) {
        ctx.view.registerRenderer('cell', () => ({ text: 'from the plugin' }));
        return () => {};
      },
    };
    const gantt = new Gantt({ container, dataset, plugins: [plugin] });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const cell = (): string | null =>
      container.querySelector<HTMLElement>('.fg-row-label[data-field="name"]')!.textContent;
    expect(cell()).toBe('from the plugin');

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cell()).toBe(sampleEntries[0]!.name);

    // The point is free again, so re-installing the same plugin is an ordinary install — not a
    // collision with the registration its own earlier installation left behind.
    gantt.plugins = [plugin];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cell()).toBe('from the plugin');

    gantt.destroy();
  });

  it('a plugin command is gone on uninstall, and a core command it overrode answers again', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    let hijacked = 0;
    const plugin = {
      id: 'demo.commands',
      view(ctx: PluginContext) {
        ctx.commands.register({
          id: 'freegantt.selectAll',
          label: 'Select all, the plugin way',
          run: () => {
            hijacked += 1;
          },
        });
        ctx.commands.register({ id: 'demo.own', label: 'Plugin only', run: () => {} });
        return () => {};
      },
    };
    const gantt = new Gantt({ container, dataset, plugins: [plugin] });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // D-S5-7: while the plugin is installed, its override wins — core's own select-all never runs.
    gantt.commands.run('freegantt.selectAll');
    expect(hijacked).toBe(1);
    expect(gantt.selectedSegmentIds).toEqual([]);

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Core's own select-all answers the id again — the override went out with its plugin.
    gantt.commands.run('freegantt.selectAll');
    expect(hijacked).toBe(1);
    expect(gantt.selectedEntryIds).toEqual([sampleEntries[0]!.id]);
    expect(() => gantt.commands.run('demo.own')).toThrow(UnknownCommandError);

    gantt.destroy();
  });

  it('a plugin retracts its own registrations mid-life through the Disposer each register* returns', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { risk: { rollUp: 'max', column: { header: 'Risk' } } },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    let retract = (): void => {};
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name'],
      plugins: [
        {
          id: 'demo.retractable',
          view(ctx: PluginContext) {
            retract = ctx.view.registerGridColumn({ field: 'risk', header: 'Risk' });
            return () => {};
          },
        },
      ],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).not.toBeNull();

    retract();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).toBeNull();

    // The plugin is still installed, and disposing it later must not double-remove anything.
    retract();
    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).toBeNull();

    gantt.destroy();
  });
});

/** One resize drag on a header's grip, start to finish — the gesture #181's t2 describes. */
const dragColumnEdge = (container: HTMLElement, field: string, toClientX: number): void => {
  const grip = container.querySelector<HTMLElement>(
    `.fg-col-header[data-field="${field}"] .fg-column-resizer`,
  )!;
  const headerPane = container.querySelector<HTMLElement>('.fg-grid-header')!;
  headerPane.setPointerCapture = vi.fn();
  headerPane.releasePointerCapture = vi.fn();
  grip.dispatchEvent(
    new PointerEvent('pointerdown', { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
  );
  headerPane.dispatchEvent(
    new PointerEvent('pointermove', { clientX: toClientX, clientY: 0, pointerId: 1, bubbles: true }),
  );
  grip.dispatchEvent(
    new PointerEvent('pointerup', { clientX: toClientX, clientY: 0, pointerId: 1, bubbles: true }),
  );
};

describe('a plugin column never becomes the consumer’s config (D-S5-33, #162/#181)', () => {
  const riskDataset = () =>
    new Dataset({
      timeZone: 'UTC',
      fieldTypes: { risk: { rollUp: 'max', column: { header: 'Risk' } } },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });

  const riskColumnPlugin = {
    id: 'demo.riskColumn',
    view(ctx: PluginContext) {
      ctx.view.registerGridColumn({ field: 'risk' });
      return () => {};
    },
  };

  it('a resize of a consumer column leaves the plugin column out of the getter, the payload and the save', async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: riskDataset(),
      gridColumns: ['name', 'start'],
      plugins: [riskColumnPlugin],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // t1 of #181's table: the plugin's column paints, and the getter is still the consumer's own.
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).not.toBeNull();
    expect(gantt.gridColumns).toEqual(['name', 'start']);

    // t2: the user drags a column edge. Before the fix this baked "risk" into the consumer's list.
    let saved: string[] = [];
    gantt.on('gridColumnsChange', ({ to }) => {
      saved = to.map((column) => String(column.field));
    });
    dragColumnEdge(container, 'name', 260);

    // t3/t4: the getter, the payload and the documented save round-trip all stay the consumer's own.
    expect(gantt.gridColumns.map((c) => (typeof c === 'string' ? c : c.field))).toEqual(['name', 'start']);
    expect(saved).toEqual(['name', 'start']);
    // The drag still did its job: the consumer's own column carries the width it committed.
    const nameColumn = gantt.gridColumns[0]!;
    expect(typeof nameColumn === 'string' ? undefined : nameColumn.width).toBeGreaterThan(100);
    // And the plugin's column still paints.
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).not.toBeNull();

    gantt.destroy();
  });

  it('a resize of the plugin’s own column changes nothing the consumer authored', async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: riskDataset(),
      gridColumns: ['name'],
      plugins: [riskColumnPlugin],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const payloads: { from: string[]; to: string[] }[] = [];
    gantt.on('gridColumnsChange', ({ from, to }) => {
      payloads.push({
        from: from.map((column) => String(column.field)),
        to: to.map((column) => String(column.field)),
      });
    });
    dragColumnEdge(container, 'risk', 300);

    // The pair still fires, so a `beforeGridColumnsChange` veto still reaches this gesture. What it
    // reports is the truth: the consumer's own configuration did not change.
    expect(payloads).toEqual([{ from: ['name'], to: ['name'] }]);
    expect(gantt.gridColumns).toEqual(['name']);
    // The width the user gave the plugin's column sticks for the session all the same.
    const riskHeader = container.querySelector<HTMLElement>('.fg-col-header[data-field="risk"]')!;
    expect(riskHeader).not.toBeNull();

    gantt.destroy();
  });

  it('a plain gridColumns assignment after a commit keeps the plugin column painting, and out of the list', async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: riskDataset(),
      gridColumns: ['name', 'start'],
      plugins: [riskColumnPlugin],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    dragColumnEdge(container, 'name', 260);
    gantt.gridColumns = ['name'];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(gantt.gridColumns).toEqual(['name']);
    const painted = Array.from(container.querySelectorAll('.fg-col-header')).map((cell) =>
      cell.getAttribute('data-field'),
    );
    expect(painted).toEqual(['name', 'risk']);

    gantt.destroy();
  });

  it('disposing the plugin after a commit leaves a same-field column the consumer authored alone', async () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: riskDataset(),
      // The consumer names "risk" themselves: config beats a plugin, so this column is the
      // consumer's, and the plugin leaving must not take it away (D-S5-33).
      gridColumns: ['name', 'risk'],
      plugins: [riskColumnPlugin],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    dragColumnEdge(container, 'risk', 300);
    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(gantt.gridColumns.map((c) => (typeof c === 'string' ? c : c.field))).toEqual(['name', 'risk']);
    expect(container.querySelector('.fg-col-header[data-field="risk"]')).not.toBeNull();

    gantt.destroy();
  });

  // #189, D-S5-38: the plugin owns its own column's geometry, the way the consumer owns theirs. The
  // library reports the width and persists it for nobody. This is that path, end to end, through the
  // public plugin surface alone: hear the commit, read your own column, register it back next time.
  it('a plugin carries its own column width across a reload, with no library-side store (#189)', async () => {
    let savedWidth: number | undefined;
    let readMyColumn: (() => number | undefined) | undefined;

    const riskColumnThatRemembers = (width?: number): ChromePlugin => ({
      id: 'demo.riskColumn',
      view(ctx) {
        ctx.view.registerGridColumn({ field: 'risk', ...(width !== undefined ? { width } : {}) });
        const myWidth = (): number | undefined =>
          ctx.view.resolvedColumns().find((column) => column.field === 'risk')?.width;
        readMyColumn = myWidth;
        // The pair fires for every commit, a resize of this plugin's own column included. Its
        // payload truthfully reports no change to the consumer's columns (D-S5-33), so the plugin
        // reads its own column rather than the payload.
        ctx.events.on('gridColumnsChange', () => {
          savedWidth = myWidth();
        });
        return () => {};
      },
    });

    const first = document.createElement('div');
    const gantt = new Gantt({
      container: first,
      dataset: riskDataset(),
      gridColumns: ['name'],
      plugins: [riskColumnThatRemembers()],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    dragColumnEdge(first, 'risk', 300);

    expect(savedWidth).toBeGreaterThan(100);
    // Nothing the consumer saves carries it — that is D-S5-33 working, not a regression.
    expect(gantt.gridColumns).toEqual(['name']);
    gantt.destroy();

    // The next load: the plugin declares the column again, with the width it kept.
    const second = document.createElement('div');
    const reloaded = new Gantt({
      container: second,
      dataset: riskDataset(),
      gridColumns: ['name'],
      plugins: [riskColumnThatRemembers(savedWidth)],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(readMyColumn?.()).toBe(savedWidth);

    reloaded.destroy();
  });
});

describe('a hidden grid column keeps its width and its place (S5.7, D-S5-34, #184)', () => {
  const threeColumnGantt = (container: HTMLElement, plugins: ChromePlugin[] = []): Gantt =>
    new Gantt({
      container,
      dataset: new Dataset({ timeZone: 'UTC', entries: sampleEntries }),
      gridColumns: ['name', 'start', 'end'],
      plugins,
    });

  const fieldOf = (column: GridColumnInput): string =>
    typeof column === 'string' ? column : String(column.field);

  const paintedFields = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll<HTMLElement>('.fg-col-header')).map(
      (cell) => cell.dataset['field'] ?? '',
    );

  it('hiding takes the column off the screen and leaves the width and the order the user set', async () => {
    const container = document.createElement('div');
    const gantt = threeColumnGantt(container);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // The user resizes the middle column. That width is the thing a wholesale reassignment loses.
    dragColumnEdge(container, 'start', 260);
    const resized = gantt.gridColumns[1]!;
    const userWidth = typeof resized === 'string' ? undefined : resized.width;
    expect(userWidth).toBeGreaterThan(100);

    gantt.hideGridColumn('start');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(paintedFields(container)).toEqual(['name', 'end']);
    expect(gantt.hiddenGridColumns).toEqual(['start']);
    // Still declared, still second, still carrying the width the user gave it.
    expect(gantt.gridColumns.map(fieldOf)).toEqual(['name', 'start', 'end']);
    expect(gantt.gridColumns[1]).toEqual({ field: 'start', width: userWidth, hidden: true });

    gantt.showGridColumn('start');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(paintedFields(container)).toEqual(['name', 'start', 'end']);
    expect(gantt.hiddenGridColumns).toEqual([]);
    // Showing removes the key rather than writing `hidden: false`, so the list reads as authored.
    expect(gantt.gridColumns[1]).toEqual({ field: 'start', width: userWidth });

    gantt.destroy();
  });

  it('the saved list restores a hidden column hidden, in its own place', async () => {
    const first = document.createElement('div');
    const gantt = threeColumnGantt(first);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let saved: readonly GridColumnInput[] = [];
    gantt.on('gridColumnsChange', ({ to }) => {
      saved = to;
    });
    gantt.hideGridColumn('start');
    gantt.destroy();

    // The documented round-trip: keep `to`, hand it back to the next Gantt.
    expect(saved.map(fieldOf)).toEqual(['name', 'start', 'end']);
    const second = document.createElement('div');
    const reloaded = new Gantt({
      container: second,
      dataset: new Dataset({ timeZone: 'UTC', entries: sampleEntries }),
      gridColumns: saved,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(paintedFields(second)).toEqual(['name', 'end']);
    expect(reloaded.hiddenGridColumns).toEqual(['start']);
    reloaded.showGridColumn('start');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(paintedFields(second)).toEqual(['name', 'start', 'end']);

    reloaded.destroy();
  });

  it('hiding a plugin’s own column never reaches the consumer’s configuration (D-S5-33)', async () => {
    const container = document.createElement('div');
    const endColumnPlugin: ChromePlugin = {
      id: 'demo.endColumn',
      view(ctx: PluginContext) {
        ctx.view.registerGridColumn({ field: 'end' });
        return () => {};
      },
    };
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ timeZone: 'UTC', entries: sampleEntries }),
      gridColumns: ['name', 'start'],
      plugins: [endColumnPlugin],
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(paintedFields(container)).toEqual(['name', 'start', 'end']);

    const payloads: { from: string[]; to: string[] }[] = [];
    gantt.on('gridColumnsChange', ({ from, to }) => {
      payloads.push({ from: from.map((c) => String(c.field)), to: to.map((c) => String(c.field)) });
    });
    gantt.hideGridColumn('end');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // It leaves the screen, and it stays the plugin's: nothing the consumer would save learns of it.
    expect(paintedFields(container)).toEqual(['name', 'start']);
    expect(gantt.gridColumns).toEqual(['name', 'start']);
    expect(gantt.hiddenGridColumns).toEqual([]);
    expect(payloads).toEqual([{ from: ['name', 'start'], to: ['name', 'start'] }]);

    gantt.destroy();
  });

  it('a hidden column leaves ctx.view.resolvedColumns() — that seam answers what paints', async () => {
    const container = document.createElement('div');
    let seen: PluginContext | undefined;
    const gantt = threeColumnGantt(container, [
      {
        id: 'demo.reader',
        view(ctx: PluginContext) {
          seen = ctx;
          return () => {};
        },
      },
    ]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(seen!.view.resolvedColumns().map((c) => String(c.field))).toEqual(['name', 'start', 'end']);

    gantt.hideGridColumn('start');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(seen!.view.resolvedColumns().map((c) => String(c.field))).toEqual(['name', 'end']);

    gantt.destroy();
  });

  it('hiding runs the cancelable pair a resize runs, so a veto keeps the column on screen', async () => {
    const container = document.createElement('div');
    const gantt = threeColumnGantt(container);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    gantt.on('beforeGridColumnsChange', () => false);
    gantt.hideGridColumn('start');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(paintedFields(container)).toEqual(['name', 'start', 'end']);
    expect(gantt.hiddenGridColumns).toEqual([]);

    gantt.destroy();
  });

  it('a field no column declares is a mistake, not a silent no-op', async () => {
    const container = document.createElement('div');
    const gantt = threeColumnGantt(container);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(() => gantt.hideGridColumn('nope')).toThrow(UnknownGridColumnError);
    expect(() => gantt.showGridColumn('nope')).toThrow(UnknownGridColumnError);

    gantt.destroy();
  });
});

// #186 at the public seam: `api/gantt.ts` hands the drag preview an *arrow* over the Dataset's edit
// hook, so every drag re-reads whatever occupies that hook (D-S5-23). This suite proves the arrow
// reaches an installed extender through the public `Gantt` surface, and ghosts nothing when the hook
// stands empty.
//
// It does not prove the live half of #186 — an occupant that *changes* after the Gantt exists. No
// public route allows that: `RegistrationGate` shuts `ctx.edits.setExtender` when the Dataset
// constructor returns, so a test here can only occupy the hook before the Gantt is built.
// `interaction/extender-preview.test.ts` reaches `DatasetState.setExtender` directly, composes a
// second occupant after the shell exists, and guards the live read there.

describe('Gantt ghosts the Dataset’s edit hook occupant (#186)', () => {
  const A_START = instant('2026-09-01T00:00:00Z');
  const A_END = instant('2026-09-03T00:00:00Z');
  const X_START = instant('2026-09-05T00:00:00Z');
  const X_END = instant('2026-09-06T00:00:00Z');

  /** Occupies the Dataset's edit hook with `cascade`, through the one seam a real plugin uses
   *  (#250 A2: `extraEditsFor` is no longer a `Dataset` method, so a test can no longer intercept it
   *  by subclassing). Nothing else installs here, so the wrapper discards the occupant it composes
   *  onto — `data/edit-extension.test.ts` is where composition order is asserted (D-S5-23). */
  function extenderPlugin(cascade: EditExtender): DataPlugin {
    return {
      id: 'test.extender',
      data(ctx) {
        ctx.edits.setExtender(() => cascade);
      },
    };
  }

  /** Moves `x` — never grabbed — whenever a move on `a` is proposed. Absolute instants, so no
   *  arithmetic on an `Instant` happens outside `time/` (I10). */
  const cascadeOntoX: EditExtender = ({ proposed }) => {
    const moved = proposed.get(entryId('a'));
    if (!moved || moved.start === undefined) return new Map();
    return new Map([
      [entryId('x'), { start: instant('2026-09-08T00:00:00Z'), end: instant('2026-09-09T00:00:00Z') }],
    ]);
  };

  /** No `cascade` means no plugin at all, so the hook keeps its identity occupant — the contrast the
   *  second test reads. */
  function buildGantt(cascade?: EditExtender): { gantt: Gantt; container: HTMLElement } {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'a', name: 'a', start: A_START, end: A_END },
        { id: 'x', name: 'x', start: X_START, end: X_END },
      ],
      ...(cascade ? { plugins: [extenderPlugin(cascade)] } : {}),
    });
    return { gantt: new Gantt({ container, dataset }), container };
  }

  it('ghosts an entry an installed extender moves, through the public seam', async () => {
    const { gantt, container } = buildGantt(cascadeOntoX);

    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.setPointerCapture = vi.fn();
    timeline.releasePointerCapture = vi.fn();
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? barA : original(x, y));

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    // The preview coalesces on the pipeline's own rAF, not synchronously per pointermove (D-S3-18).
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state'] ?? '').toContain('ghost');

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('ghosts nothing while the hook stands empty, so the assertion above reads the occupant and not a default', async () => {
    const { gantt, container } = buildGantt();

    const barA = container.querySelector<HTMLElement>('[data-item-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-item-id="x:0"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.setPointerCapture = vi.fn();
    timeline.releasePointerCapture = vi.fn();
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? barA : original(x, y));

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state'] ?? '').not.toContain('ghost');

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    document.elementFromPoint = original;
    gantt.destroy();
  });
});

describe('the Selection follows the Dataset when a Segment goes away (#212, ADR 0010)', () => {
  function ganttOverTwoSegments(): { gantt: Gantt; dataset: Dataset } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        {
          id: 'e1',
          name: 'Framing',
          start: '2026-01-01',
          end: '2026-01-07',
          segments: [
            { id: 's1', start: '2026-01-01', end: '2026-01-03' },
            { id: 's2', start: '2026-01-05', end: '2026-01-07' },
          ],
        },
      ],
    });
    return { gantt: new Gantt({ container, dataset }), dataset };
  }

  it('drops a selected Segment the Dataset removed, and keeps the rest', () => {
    const { gantt, dataset } = ganttOverTwoSegments();
    gantt.selectedSegmentIds = ['s1', 's2'];
    dataset.entries.removeSegments(['s1']);
    expect(gantt.selectedSegmentIds).toEqual(['s2']);
    gantt.destroy();
  });

  it('reports the drop as one selectionChange, with no cancelable before pair', () => {
    const { gantt, dataset } = ganttOverTwoSegments();
    gantt.selectedSegmentIds = ['s1', 's2'];
    const changes: { from: readonly string[]; to: readonly string[] }[] = [];
    const vetoes = vi.fn((): false => false);
    gantt.on('selectionChange', (e) => {
      changes.push({ from: [...e.from], to: [...e.to] });
    });
    gantt.on('beforeSelectionChange', vetoes);
    dataset.entries.removeSegments(['s1']);
    expect(changes).toEqual([{ from: ['s1', 's2'], to: ['s2'] }]);
    // A veto cannot bring back a Segment the Dataset no longer holds, so it is never asked.
    expect(vetoes).not.toHaveBeenCalled();
    expect(gantt.selectedSegmentIds).toEqual(['s2']);
    gantt.destroy();
  });

  it('never hands a dead SegmentId to a mutation, so a second Delete is a no-op', () => {
    const { gantt, dataset } = ganttOverTwoSegments();
    gantt.selectedSegmentIds = ['s1'];
    gantt.commands.run('freegantt.deleteSelection');
    expect(dataset.entries.get('e1')!.segments.map((s) => s.id)).toEqual(['s2']);
    expect(gantt.selectedSegmentIds).toEqual([]);
    // Before #212 closed this, the Selection still held the removed `s1` and this second run threw
    // `SegmentNotFoundError` out of a keystroke.
    expect(() => gantt.commands.run('freegantt.deleteSelection')).not.toThrow();
    gantt.destroy();
  });

  it('drops the Segments of an Entry the Dataset removed outright', () => {
    const { gantt, dataset } = ganttOverTwoSegments();
    gantt.selectedSegmentIds = ['s1', 's2'];
    dataset.entries.remove('e1');
    expect(gantt.selectedSegmentIds).toEqual([]);
    expect(gantt.selectedEntryIds).toEqual([]);
    gantt.destroy();
  });
});

// #275 item 3: nineteen public `Gantt` members ran under no test before this — eight of them
// setters, which makes this the live-reconfigurable claim (`plans/02`: "every config key is
// live-reconfigurable") seen from the same side as §2's matrix row. A zero-arg smoke test reaches
// every getter; each setter then gets its own round-trip against the getter that reads it back.
describe('Gantt — never-called public members (#275 §3/§4, merged with the live-reconfigurable claim)', () => {
  it('zero-arg smoke: every named getter answers with no throw off a freshly constructed Gantt', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    const reads: Record<string, unknown> = {
      theme: gantt.theme,
      a11yLabel: gantt.a11yLabel,
      barLabels: gantt.barLabels,
      variants: gantt.variants,
      range: gantt.range,
      fit: gantt.fit,
      todayLine: gantt.todayLine,
      dateLines: gantt.dateLines,
      dateLineLabelPlacement: gantt.dateLineLabelPlacement,
      resolvedTheme: gantt.resolvedTheme,
      zoomPresets: gantt.zoomPresets,
      viewportGestures: gantt.viewportGestures,
      canZoomIn: gantt.canZoomIn,
      canZoomOut: gantt.canZoomOut,
    };

    expect(reads['theme']).toBe('auto');
    expect(typeof reads['a11yLabel']).toBe('string');
    expect(reads['barLabels']).toBe('fitBar');
    expect(reads['variants']).toEqual([]);
    expect(reads['range']).toBe('fitDataset');
    expect(reads['fit']).toBe('pane');
    expect(reads['todayLine']).toBe(true);
    expect(reads['dateLines']).toEqual([]);
    expect(reads['dateLineLabelPlacement']).toBe('belowHeader');
    expect(reads['resolvedTheme']).toBe('light');
    expect(Array.isArray(reads['zoomPresets'])).toBe(true);
    expect((reads['zoomPresets'] as unknown[]).length).toBeGreaterThan(0);
    expect(reads['viewportGestures']).toBeDefined();
    expect(typeof reads['canZoomIn']).toBe('boolean');
    expect(typeof reads['canZoomOut']).toBe('boolean');

    gantt.destroy();
  });

  it('set barLabels is live — no remount needed to read the new value back', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    gantt.barLabels = 'outside';
    expect(gantt.barLabels).toBe('outside');
    gantt.barLabels = 'none';
    expect(gantt.barLabels).toBe('none');

    gantt.destroy();
  });

  it('set dateLineLabelPlacement is live — no remount needed to read the new value back (#318)', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    gantt.dateLineLabelPlacement = 'inHeader';
    expect(gantt.dateLineLabelPlacement).toBe('inHeader');
    gantt.dateLineLabelPlacement = 24;
    expect(gantt.dateLineLabelPlacement).toBe(24);

    gantt.destroy();
  });

  it('set collapsed assigns the whole collapsed set directly, not just collapse()/expand() one at a time', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c', name: 'c', start: '2026-01-03', end: '2026-01-04', parentId: 'p' },
      ],
    });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });

    gantt.collapsed = ['p'];
    expect(gantt.collapsed).toEqual([entryId('p')]);

    gantt.collapsed = [];
    expect(gantt.collapsed).toEqual([]);

    gantt.destroy();
  });

  it('toggleCollapse flips a row between collapsed and expanded', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'p', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c', name: 'c', start: '2026-01-03', end: '2026-01-04', parentId: 'p' },
      ],
    });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });

    gantt.toggleCollapse('p');
    expect(gantt.collapsed).toEqual([entryId('p')]);
    gantt.toggleCollapse('p');
    expect(gantt.collapsed).toEqual([]);

    gantt.destroy();
  });

  it('set range pins the time axis to a span; assigning fitDataset back releases it', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    gantt.range = { start: '2026-01-01', end: '2026-02-01' };
    const pinned = gantt.range;
    expect(pinned).not.toBe('fitDataset');
    if (pinned !== 'fitDataset') {
      expect(pinned.start).toBe(instant('2026-01-01T00:00:00Z'));
      expect(pinned.end).toBe(instant('2026-02-01T00:00:00Z'));
    }

    gantt.range = 'fitDataset';
    expect(gantt.range).toBe('fitDataset');

    gantt.destroy();
  });

  it('set fit is live — pane, preset, and a fixed pxPerMs number all read back exactly', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    gantt.fit = 'preset';
    expect(gantt.fit).toBe('preset');
    gantt.fit = 0.05;
    expect(gantt.fit).toBe(0.05);
    gantt.fit = 'pane';
    expect(gantt.fit).toBe('pane');

    gantt.destroy();
  });

  it('set zoomPresets replaces the step list zoomIn/zoomOut walk, and drives canZoomIn/canZoomOut', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        preset: 'day',
        fit: 'preset',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.zoomPresets = ['day', 'week'];
      expect(gantt.zoomPresets.map((preset) => preset.id)).toEqual(['day', 'week']);

      // "day" is now the finest step in this Gantt's own list: nothing finer to zoom into.
      expect(gantt.canZoomIn).toBe(false);
      expect(gantt.canZoomOut).toBe(true);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('zoomTo sets an exact density and fires navigationChange, the same notification zoomIn/zoomOut fire', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const seen: unknown[] = [];
      gantt.on('navigationChange', (payload) => {
        seen.push(payload);
      });

      gantt.zoomTo(0.01);

      expect(seen.length).toBeGreaterThan(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('zoomToSpan fills the pane with the given span and pans its start to the left edge', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const seen: unknown[] = [];
      gantt.on('navigationChange', (payload) => {
        seen.push(payload);
      });

      gantt.zoomToSpan({ start: '2026-09-01', end: '2026-09-08' });

      expect(seen.length).toBeGreaterThan(0);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
