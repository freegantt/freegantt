import { describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { EntryNotFoundError, ScrollModel, TimeScaleModel, entryId } from './index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { instant } from '../time/index.js';

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
      range: { start: sampleEntries[0]!.start, end: sampleEntries[0]!.end },
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

  it('U6: reveal throws EntryNotFoundError for an id the dataset has no entry for', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    let caught: unknown;
    try {
      gantt.reveal(entryId('does-not-exist'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EntryNotFoundError);
    expect((caught as EntryNotFoundError).code).toBe('entry-not-found');

    gantt.destroy();
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
      expect(labels[0]!.style.transform).toBe(lines[0]!.style.transform);

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
      entries: sampleEntries.map((entry, i) => (i === 0 ? { ...entry, meta: { cost: 500 } } : entry)),
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

  it("default gridColumns is ['name']", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
    });
    expect(gantt.gridColumns).toEqual(['name']);
    const row = container.querySelector('.fg-row')!;
    expect(row.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(1);
    gantt.destroy();
  });
});

describe('Gantt selection (S3.1, D-S3-10, [S3-A1])', () => {
  it('gantt.selection = [id] is live and loose in, branded out', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.selection = [sampleEntries[0]!.id];
    expect(gantt.selection).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('selectionEntries resolves selection ids through the bound dataset, in order', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.selection = [sampleEntries[1]!.id, sampleEntries[0]!.id];
    expect(gantt.selectionEntries).toEqual([
      dataset.entries.get(sampleEntries[1]!.id),
      dataset.entries.get(sampleEntries[0]!.id),
    ]);

    gantt.destroy();
  });

  it('selectionEntries skips ids no longer in the store and re-reads field edits', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selection = [sampleEntries[0]!.id, sampleEntries[1]!.id];

    dataset.entries.remove(sampleEntries[1]!.id);
    expect(gantt.selectionEntries).toEqual([dataset.entries.get(sampleEntries[0]!.id)]);

    dataset.entries.update(sampleEntries[0]!.id, { name: 'Renamed' });
    expect(gantt.selectionEntries[0]!.name).toBe('Renamed');

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

    gantt.selection = [sampleEntries[0]!.id];

    expect(before).toEqual([{ from: [], to: [entryId(sampleEntries[0]!.id)] }]);
    expect(after).toEqual([{ from: [], to: [entryId(sampleEntries[0]!.id)] }]);
    expect(datasetChanges).toEqual([]);

    gantt.destroy();
  });

  it('beforeSelectionChange returning false vetoes the change: selection stays put', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selection = [sampleEntries[0]!.id];

    gantt.on('beforeSelectionChange', () => false);
    gantt.selection = [sampleEntries[1]!.id];

    expect(gantt.selection).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('a non-empty-click, non-Escape assignment with an identical set is a no-op (no events)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selection = [sampleEntries[0]!.id];

    const after: unknown[] = [];
    gantt.on('selectionChange', (p) => {
      after.push(p);
    });
    gantt.selection = [sampleEntries[0]!.id];

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

    expect(gantt.selection).toEqual([entryId(sampleEntries[0]!.id)]);
    expect(bar.dataset['state']).toBe('selected');

    document.elementFromPoint = original;
    gantt.destroy();
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

  it('a group entry (rollUpKinds) gets neither the grab cursor nor a handle', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [{ id: 'g1', kind: 'group', name: 'Group' }, ...sampleEntries],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({ container, dataset });

    const groupBar = container.querySelector<HTMLElement>('[data-kind="group"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => groupBar;
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    expect(groupBar.hasAttribute('data-movable')).toBe(false);
    const start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    expect(start.hidden).toBe(true);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('gantt.selection = [id] still accepts a select-incapable id — the setter does not consult can("select") (D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, interactions: { select: false } });

    gantt.selection = [sampleEntries[0]!.id];
    expect(gantt.selection).toEqual([entryId(sampleEntries[0]!.id)]);

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

    expect(gantt.selection).toEqual([]);

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
    const before = dataset.entries.get(id)!;

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
    const before = dataset.entries.get(id)!;
    gantt.on('beforeEntryMove', () => false);

    const afterEvents: unknown[] = [];
    gantt.on('entryMove', (p) => {
      afterEvents.push(p);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

    expect(afterEvents).toEqual([]);
    expect(dataset.entries.get(id)).toEqual(before);
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
    // Hover the bar first (D-S3-6): resizableItemId only resolves once something is hovered or
    // singly selected, and only then does the handle pair stop being `hidden`.
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));

    const endHandle = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    expect(endHandle.hidden).toBe(false);
    document.elementFromPoint = (x: number, y: number) => (x === 10 && y === 5 ? endHandle : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = dataset.entries.get(id)!;

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
    const before = dataset.entries.get(id)!;
    gantt.on('beforeEntryResize', () => false);

    const afterEvents: unknown[] = [];
    gantt.on('entryResize', (p) => {
      afterEvents.push(p);
    });

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5010, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5010, clientY: 5, pointerId: 1 }));

    expect(afterEvents).toEqual([]);
    expect(dataset.entries.get(id)).toEqual(before);
    expect(dataset.canUndo).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('a milestone (resize-incapable) never gets a resize handle to grab (D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [
        {
          id: 'm1',
          kind: 'milestone',
          name: 'Milestone',
          start: sampleEntries[0]!.start,
          end: sampleEntries[0]!.start,
        },
      ],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({ container, dataset });

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
  it('ArrowRight on the container nudges the selected entry, one transaction, undo reverts', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const id = entryId(sampleEntries[0]!.id);
    const before = dataset.entries.get(id)!;
    gantt.selection = [id];

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

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

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

    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(datasetChanges).toEqual([]);
    gantt.destroy();
  });

  it('Shift+ArrowRight resizes the end edge of the selected entry', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const id = entryId(sampleEntries[0]!.id);
    const before = dataset.entries.get(id)!;
    gantt.selection = [id];

    const afterEvents: { edge: string }[] = [];
    gantt.on('entryResize', (p) => {
      afterEvents.push(p);
    });

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );

    expect(afterEvents).toHaveLength(1);
    expect(afterEvents[0]!.edge).toBe('end');
    const resized = dataset.entries.get(id)!;
    expect(resized.start).toBe(before.start);
    expect(resized.end).not.toBe(before.end);

    gantt.destroy();
  });

  it('ArrowDown moves the selection to the next row without writing the dataset', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const firstId = entryId(sampleEntries[0]!.id);
    const secondId = entryId(sampleEntries[1]!.id);
    gantt.selection = [firstId];

    const datasetChanges: unknown[] = [];
    dataset.on('change', (c) => {
      datasetChanges.push(c);
    });

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    expect(gantt.selection).toEqual([secondId]);
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
    const before = dataset.entries.get(id)!;
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

    expect(dataset.entries.get(id)).toEqual(before);
    expect(bar.dataset['state']).not.toContain('pending');
    expect(dataset.canUndo).toBe(false);

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

  it('[S3-A7] ctrl+wheel zooms, anchored; shift+wheel pans; Page/Home/End pan; dataset.on("change") never fires', () => {
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

      const yBefore = a.scroll.state.position.y;
      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position.y).toBeGreaterThan(yBefore);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position.x).toBe(0);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
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
