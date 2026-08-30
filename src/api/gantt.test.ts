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

describe('Gantt selection (S3.1, D-S3-10, [S3-A1])', () => {
  it('gantt.selection = [id] is live and loose in, branded out', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.selection = [sampleEntries[0]!.id];
    expect(gantt.selection).toEqual([entryId(sampleEntries[0]!.id)]);

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

  it('a group entry (derivedSpanKinds) gets neither the grab cursor nor a handle', () => {
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
