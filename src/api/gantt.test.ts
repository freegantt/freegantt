import { describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { EntryNotFoundError, ScrollModel, TimeScaleModel, entryId } from './index.js';
import { sampleEntries } from '../../fixtures/sample-project.js';

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
  it('mounts fixture entries as bars in the host element', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
    const bars = host.querySelectorAll('.fg-bar');
    expect(bars.length).toBe(sampleEntries.length);
    gantt.destroy();
  });

  it('two Gantt instances on one page have fully independent state (I2)', () => {
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 5), timeZone: 'UTC' }),
    });
    const ganttB = new Gantt({
      host: hostB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' }),
    });

    expect(hostA.querySelectorAll('.fg-bar').length).toBe(5);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttA.destroy();
    expect(hostA.children.length).toBe(0);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttB.destroy();
  });

  it('two Gantt instances sharing one TimeScaleModel compute identical bar positions (D9 seam)', () => {
    const scale = new TimeScaleModel({
      range: { start: sampleEntries[0]!.start, end: sampleEntries[0]!.end },
    });
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });
    const ganttB = new Gantt({
      host: hostB,
      dataset: new Dataset({ entries: sampleEntries.slice(0, 3), timeZone: 'UTC' }),
      scale,
    });

    const xOf = (host: HTMLElement): string[] =>
      Array.from(host.querySelectorAll<HTMLElement>('.fg-bar')).map((el) => el.style.transform);

    expect(xOf(hostA)).toEqual(xOf(hostB));

    ganttA.destroy();
    ganttB.destroy();
  });
});

describe('Gantt preset/range/zoom/overscan/zoomTo/zoomBy/reveal (S1.9)', () => {
  it('[S1-A3] a preset switch redraws the axis but keeps bar DOM identity (I8)', () => {
    // Regression coverage for a measured pane under the default 'fitViewport' zoom: pxPerMs there
    // does not depend on the preset, so this must exercise a real ResizeObserver measurement
    // (not an unmeasured 0-width pane, where pxPerMs happens to depend on the preset anyway and
    // would pass even if the notify path were broken).
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const host = document.createElement('div');
      const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      const before = host.querySelector<HTMLElement>('.fg-bar');
      expect(host.querySelectorAll('.fg-band')).toHaveLength(1);

      gantt.preset = 'weekAndMonth';

      const after = host.querySelector<HTMLElement>('.fg-bar');
      expect(after).toBe(before);
      expect(gantt.preset.id).toBe('weekAndMonth');
      expect(host.querySelectorAll('.fg-band')).toHaveLength(2);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('U5: gantt.overscan is live and reaches the bound Viewport', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      overscan: { horizontalPx: 64 },
    });

    expect(gantt.overscan).toEqual({ horizontalPx: 64 });
    gantt.overscan = { horizontalPx: 256 };
    expect(gantt.overscan).toEqual({ horizontalPx: 256 });

    gantt.destroy();
  });

  it('U4: reveal(id) moves the bound ScrollModel to bring an off-screen entry into view', () => {
    // Reads the ScrollModel a caller shared, not the element's scrollLeft/scrollTop — I12 confines
    // that read to view/scroll-attachment.ts; scroll-attachment.test.ts and e2e/scroll-sync.spec.ts
    // already prove the model's position lands on the live element.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const host = document.createElement('div');
      const scroll = new ScrollModel();
      const gantt = new Gantt({
        host,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        zoom: 'preset',
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
    const host = document.createElement('div');
    const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

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

  it('U7: shared scale+scroll, zoomBy on one Gantt is observed on the other live DOM', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const scale = new TimeScaleModel({ zoom: 'preset', preset: 'day' });
      const scroll = new ScrollModel();
      const hostA = document.createElement('div');
      const hostB = document.createElement('div');
      const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });

      const ganttA = new Gantt({ host: hostA, dataset, scale, scroll });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      const ganttB = new Gantt({ host: hostB, dataset, scale, scroll });
      FakeResizeObserver.instances[1]!.fire({ width: 300, height: 100 });

      // The last bar, not the first: entry-1 starts at the dataset's own range start, so its x stays
      // 0 at any zoom — a vacuous check. A later entry's x scales with pxPerMs.
      const lastBarXOf = (host: HTMLElement): string => {
        const bars = host.querySelectorAll<HTMLElement>('.fg-bar');
        return bars[bars.length - 1]!.style.transform;
      };
      const before = lastBarXOf(hostA);
      expect(lastBarXOf(hostB)).toBe(before);

      ganttA.zoomBy(2);

      expect(lastBarXOf(hostA)).not.toBe(before);
      expect(lastBarXOf(hostB)).toBe(lastBarXOf(hostA));

      ganttA.destroy();
      ganttB.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a caller passing both scale and preset gets the shared scale, ignoring the constructor preset (D-S1.9-9)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scale = new TimeScaleModel({ preset: 'week' });
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      scale,
      preset: 'month',
    });

    expect(gantt.preset.id).toBe('week');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();

    gantt.destroy();
  });
});

describe('Gantt theme and a11yLabel (S1.10)', () => {
  it('theme setter flips data-fg-theme on the host live; auto removes it', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    expect(host.getAttribute('data-fg-theme')).toBeNull();

    gantt.theme = 'dark';
    expect(host.getAttribute('data-fg-theme')).toBe('dark');

    gantt.theme = 'light';
    expect(host.getAttribute('data-fg-theme')).toBe('light');

    gantt.theme = 'auto';
    expect(host.getAttribute('data-fg-theme')).toBeNull();

    gantt.destroy();
  });

  it('a11yLabel setter updates aria-label on the host live', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    expect(host.getAttribute('aria-label')).toBe('Gantt');

    gantt.a11yLabel = 'Project plan';
    expect(host.getAttribute('aria-label')).toBe('Project plan');

    gantt.destroy();
  });
});

describe('Gantt gridWidth and events (S1.8, plans/02 §6)', () => {
  it('beforeGridWidthChange returning false vetoes the change: gridWidth stays put', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 160,
    });

    gantt.on('beforeGridWidthChange', () => false);
    gantt.gridWidth = 220;

    expect(gantt.gridWidth).toBe(160);
    const gridPane = host.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane.style.width).toBe('160px');

    gantt.destroy();
  });

  it('a non-vetoed change fires gridWidthChange exactly once with {from, to}', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
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
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
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
    const host = document.createElement('div');
    const gantt = new Gantt({
      host,
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
