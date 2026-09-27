import { describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import {
  DerivedFieldNotWritableError,
  DuplicatePluginIdError,
  RevealTargetNotFoundError,
  PluginNotInstalledError,
  RegistrationClosedError,
  RendererAlreadyRegisteredError,
  ScrollAxis,
  UnknownCommandError,
  UnknownFieldError,
  UnknownGridColumnError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  TimeScaleModel,
  MS,
  entryId,
  barId,
  contextMenu,
  diamond,
  fixedWidthBar,
  currency,
  CustomRowSourceNotFilterableOrSortableError,
  PluginSetupError,
} from './index.js';
import type {
  ChangeSet,
  DataPlugin,
  Duration,
  EditExtender,
  Entry,
  EntryInput,
  ErrorReport,
  ChromePlugin,
  GridColumn,
  GridColumnInput,
  PluginContext,
  TimeUnit,
  SnapRule,
} from './index.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { diffMs, instant } from '../time/index.js';
import { convenienceCommandIds } from './command.js';

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

// Every plugin registration seam returns a Disposer (I2) — `on` is that seam for a Gantt event.
describe('Gantt.on returns a Disposer', () => {
  it('removes exactly the handler it was returned for, leaving another handler on the same event alone', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
    let calls = 0;
    let otherCalls = 0;
    const dispose = gantt.on('themeChange', () => {
      calls += 1;
    });
    gantt.on('themeChange', () => {
      otherCalls += 1;
    });

    gantt.theme = 'dark';
    dispose();
    gantt.theme = 'light';

    expect(calls).toBe(1);
    expect(otherCalls).toBe(2);
    gantt.destroy();
  });

  it('calling the Disposer twice is safe', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });
    const dispose = gantt.on('themeChange', () => {});
    dispose();
    expect(() => dispose()).not.toThrow();
    gantt.destroy();
  });
});

describe('ctx.events.on is removed on uninstall, like every other registration seam', () => {
  it('removes a handler added during setup when the plugin is dropped from Gantt.plugins', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    let calls = 0;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.listener',
          view(ctx) {
            ctx.events.on('themeChange', () => {
              calls += 1;
            });
          },
        },
      ],
    });

    gantt.theme = 'dark';
    gantt.plugins = [];
    gantt.theme = 'light';

    expect(calls).toBe(1);
    gantt.destroy();
  });

  it('removes a handler added after setup returned', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    let calls = 0;
    let addLateHandler = (): void => undefined;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.late-listener',
          view(ctx) {
            addLateHandler = () =>
              ctx.events.on('themeChange', () => {
                calls += 1;
              });
          },
        },
      ],
    });

    addLateHandler();
    gantt.theme = 'dark';
    gantt.plugins = [];
    gantt.theme = 'light';

    expect(calls).toBe(1);
    gantt.destroy();
  });

  it('calling its own events.on Disposer early, then uninstalling, throws nothing', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.early-dispose',
          view(ctx) {
            const dispose = ctx.events.on('themeChange', () => undefined);
            dispose();
          },
        },
      ],
    });

    expect(() => (gantt.plugins = [])).not.toThrow();
    gantt.destroy();
  });

  it('leaves another plugin’s handler and the app’s own gantt.on handler firing', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    let trackedCalls = 0;
    let survivorCalls = 0;
    let appCalls = 0;
    const survivor = {
      id: 'demo.survivor-listener',
      view(ctx: PluginContext) {
        ctx.events.on('themeChange', () => {
          survivorCalls += 1;
        });
      },
    };
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.tracked-listener',
          view(ctx) {
            ctx.events.on('themeChange', () => {
              trackedCalls += 1;
            });
          },
        },
        survivor,
      ],
    });
    gantt.on('themeChange', () => {
      appCalls += 1;
    });

    gantt.plugins = [survivor];
    gantt.theme = 'dark';

    expect(trackedCalls).toBe(0);
    expect(survivorCalls).toBe(1);
    expect(appCalls).toBe(1);
    gantt.destroy();
  });

  it('destroy() removes a handler added during setup', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    let calls = 0;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.listener',
          view(ctx) {
            ctx.events.on('themeChange', () => {
              calls += 1;
            });
          },
        },
      ],
    });

    gantt.destroy();
    expect(calls).toBe(0);
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

  it('turns its own Undo and Redo commands off when the app owns undo (history: false)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC', history: false });
    const gantt = new Gantt({ container, dataset });

    dataset.entries.update(sampleEntries[0]!.id, { name: 'renamed' });

    const available = gantt.commands.available().map((command) => command.id);
    expect(available).not.toContain('freegantt.undo');
    expect(available).not.toContain('freegantt.redo');

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
      // The preset change's render request is coalesced onto the next animation frame.
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

  it('U4: reveal(id) moves the bound ScrollAxis to bring an off-screen entry into view', () => {
    // Reads the ScrollAxis a caller shared, not the element's scrollLeft/scrollTop — I12 confines
    // that read to view/scroll-attachment.ts; scroll-attachment.test.ts and e2e/scroll-sync.spec.ts
    // already prove the model's position lands on the live element.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(scroll.state.position).toBe(0);

      // 'entry-50' starts weeks after the dataset's start — off-screen at a 300px pane, day preset.
      gantt.reveal(entryId('entry-50'));

      expect(scroll.state.position).toBeGreaterThan(0);

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

  it('reveal(childId) reveals that one child’s own bar, not the segmented row’s envelope (ADR 0010, ADR 0025, #421)', () => {
    // A parent segmented by three children: `split-a` sits on-screen, `split-b` sits off-screen at a
    // moderate distance, and `split-c` sits far off-screen and sets the row's own drawn extent.
    // Each reveal target below reads a different geometry, so each expects a different scroll.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scroll = new ScrollAxis();
      const dataset = new Dataset({
        entries: [
          { id: 'split', name: 'Split' },
          // A timed end (midnight, explicit) stores exactly as written — keeps the geometry in this
          // test arithmetic, unlike a date-only end, which always means through that day.
          {
            id: 'split-a',
            parentId: 'split',
            name: 'Split A',
            start: '2026-09-01',
            end: '2026-09-03T00:00:00Z',
          },
          {
            id: 'split-b',
            parentId: 'split',
            name: 'Split B',
            start: '2026-09-20',
            end: '2026-09-23T00:00:00Z',
          },
          {
            id: 'split-c',
            parentId: 'split',
            name: 'Split C',
            start: '2026-11-01',
            end: '2026-11-05T00:00:00Z',
          },
        ],
        timeZone: 'UTC',
      });
      const gantt = new Gantt({
        container,
        dataset,
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
        rowSource: { source: 'entries', childrenAsSegments: true },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.reveal(entryId('split-a'));
      expect(scroll.state.position).toBe(0);

      // Each of the next two reveals starts over from x 0, so "nearest edge" never has an already
      // off-screen far edge to snap back to — the two results are independently comparable.
      gantt.reveal(entryId('split-b'));
      const afterB = scroll.state.position;
      expect(afterB).toBeGreaterThan(0);

      scroll.panTo(0);
      gantt.reveal(entryId('split-c'));
      expect(scroll.state.position).toBeGreaterThan(afterB);

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
      const scroll = { x: new ScrollAxis(), y: new ScrollAxis() };
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
      // zoomBy's render request is coalesced onto the next animation frame, for both Gantts.
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

// #195: before `gantt.snap` existed, changing the snap alone meant
// `gantt.preset = { ...gantt.preset, snap }` — a one-off copy of a shipped preset, thrown away by
// the next zoom. The harness wrote that, which is how this was found.
describe('Gantt.snap (D-S3-24, #195)', () => {
  it('reads none when this Gantt states nothing — snap is opt-in (#489 reverses D-S3-24s preset fallback)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.snap).toBe('none');

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

  it('undefined turns snapping back off (#489)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, snap: { unit: 'day', increment: 1 } });

    gantt.snap = undefined;

    expect(gantt.snap).toBe('none');

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

    ganttA.snap = 'tick';

    expect(ganttA.snap).toBe('tick');
    // Opt-in, and per Gantt (#489): ganttB never asked for snapping, so sharing an axis with a Gantt
    // that did leaves it dragging free.
    expect(ganttB.snap).toBe('none');

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

  // #489: a custom SnapRule is a gantt.snap member too — a real drag must reach it, not just a
  // named { unit, increment }.
  it('a real drag commits on the boundary a custom SnapRule chooses', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const fixedBoundary = instant('2026-01-01T00:00:00Z');
    const alwaysSnapToFixedBoundary: SnapRule = () => fixedBoundary;
    const gantt = new Gantt({ container, dataset, snap: alwaysSnapToFixedBoundary });

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

    const moved = dataset.entries.get(id)!;
    expect(moved.start).toBe(fixedBoundary);

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(scroll.state.position).toBe(0);
      gantt.panToDate('2026-10-15T00:00:00Z');
      expect(scroll.state.position).toBeGreaterThan(0);

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate('2026-10-15T00:00:00Z', 'start');
      const start = scroll.state.position;

      gantt.panToDate('2026-10-15T00:00:00Z', 'center');
      const center = scroll.state.position;

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToToday('center');
      const fromToday = scroll.state.position;

      gantt.panToDate(fakeNow, 'center');
      const fromDate = scroll.state.position;

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate(fakeNow, 'start');
      const flush = scroll.state.position;

      gantt.panToToday('start');
      const withMargin = scroll.state.position;

      // Default margin (2 ticks of the 'day' preset): strictly left of the flush landing.
      expect(withMargin).toBeLessThan(flush);

      // align 'center' is untouched by the margin (S1.13 follow-up doc: "no effect on 'center'").
      gantt.panToDate(fakeNow, 'center');
      const centerFlush = scroll.state.position;
      gantt.panToToday('center');
      expect(scroll.state.position).toBe(centerFlush);

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
        todayLineMarginTicks: 0,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      expect(gantt.todayLineMarginTicks).toBe(0);

      // 0 ticks of margin: panToToday('start') lands exactly where panToDate('start') does.
      gantt.panToDate(fakeNow, 'start');
      const flush = scroll.state.position;
      gantt.panToToday('start');
      expect(scroll.state.position).toBe(flush);

      // Raising it live moves the landing further left of the flush position.
      gantt.todayLineMarginTicks = 5;
      gantt.panToToday('start');
      expect(scroll.state.position).toBeLessThan(flush);

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      expect(() => gantt.panToDate('1990-01-01T00:00:00Z')).not.toThrow();
      expect(scroll.state.position).toBe(0); // well before range.start, clamped down to 0

      expect(() => gantt.panToDate('2099-01-01T00:00:00Z')).not.toThrow();
      expect(scroll.state.position).toBe(scroll.state.max); // well past range.end, clamped up

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
      const scroll = new ScrollAxis();
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        fit: 'preset',
        preset: 'day',
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

      gantt.panToDate('2026-10-15T00:00:00Z');
      const fromString = scroll.state.position;

      // A Date object is `toInstant`'s job (`time/input.test.ts`); I10 bans `new Date()` here.
      gantt.panToDate(Date.parse('2026-10-15T00:00:00Z'));
      expect(scroll.state.position).toBe(fromString);

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
      // component under the default placement (#318 — the px nudge a non-default
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

describe('Gantt.visibleSpan (issue #461)', () => {
  it('answers a degenerate span before any pane measurement arrives — nothing is on screen yet', () => {
    // No FakeResizeObserver.fire() call in this test: this is deliberately BEFORE the first real
    // measurement a browser's own ResizeObserver would deliver, so `Viewport`'s `#paneSize` is still
    // `ZERO_SIZE`. The decided answer (#461) is the same one a `display: none` pane gets — a
    // degenerate span, because no pixels stand for no time. It is NOT the whole content range: that
    // is `frame.ts`'s "cull nothing" convenience, and reporting it here would claim a reader can see
    // a window that has never been painted.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      });

      const beforeMeasure = gantt.visibleSpan;
      expect(beforeMeasure.start).toBe(beforeMeasure.end);

      // Where that degenerate span sits: at the content's own start, not at an invented origin.
      // Nothing has scrolled, so the first measured window opens at the very same instant — which
      // names the pre-measure edge without this test hard-coding an epoch of its own.
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      const afterMeasure = gantt.visibleSpan;
      expect(afterMeasure.start).toBe(beforeMeasure.start);
      expect(afterMeasure.end).toBeGreaterThan(afterMeasure.start);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('navigationChange carries `visibleSpan`, and it matches `gantt.visibleSpan` at the moment it fires', () => {
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

      let seen: { start: number; end: number } | undefined;
      gantt.on('navigationChange', (payload) => {
        seen = payload.visibleSpan;
      });
      gantt.zoomIn();

      expect(seen).toBeDefined();
      expect(seen).toEqual(gantt.visibleSpan);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('zoomIn narrows the span; zoomOut widens it back', () => {
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

      const atRest = diffMs(gantt.visibleSpan.end, gantt.visibleSpan.start);
      gantt.zoomIn();
      const zoomedIn = diffMs(gantt.visibleSpan.end, gantt.visibleSpan.start);
      expect(zoomedIn).toBeLessThan(atRest);

      gantt.zoomOut();
      gantt.zoomOut();
      const zoomedOut = diffMs(gantt.visibleSpan.end, gantt.visibleSpan.start);
      expect(zoomedOut).toBeGreaterThan(zoomedIn);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a resize that widens the pane (a splitter drag, in a real browser) moves the span and fires navigationChange', () => {
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
      const before = gantt.visibleSpan;

      let fired = 0;
      let lastSpan: { start: number; end: number } | undefined;
      gantt.on('navigationChange', (payload) => {
        fired++;
        lastSpan = payload.visibleSpan;
      });

      // happy-dom does no layout (dragSplitter's own comment, above): a real splitter drag reflows
      // the timeline pane and the browser's own ResizeObserver reports the new size. Firing it here
      // is that reflow, simulated the same way every other pane-size test in this file does.
      FakeResizeObserver.instances[0]!.fire({ width: 600, height: 100 });

      expect(fired).toBeGreaterThan(0);
      expect(lastSpan).toEqual(gantt.visibleSpan);
      expect(gantt.visibleSpan.end).not.toBe(before.end);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('under fit: "pane" with content narrower than the pane, the span equals the content range and no wider', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const container = document.createElement('div');
      const narrowEntries = [{ id: 'only', name: 'Only', start: '2026-01-01', end: '2026-01-02' }];
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: narrowEntries, timeZone: 'UTC' }),
        fit: 'pane',
        range: 'fitDataset',
      });
      // A pane far wider than one day's own content at any legible density.
      FakeResizeObserver.instances[0]!.fire({ width: 2000, height: 100 });

      // `range: 'fitDataset'` reads back as that same word, by its own type (the reader resolves
      // *loose dates* to `Instant`s; the sentinel stays a sentinel), so this compares against the
      // one entry's own dates directly. A date-only `end` always means through that day
      // (`time/toEndInstant`), so the entry's stored half-open end is one day past its authored
      // `'2026-01-02'` — 2026-01-03.
      expect(gantt.visibleSpan).toEqual({
        start: instant('2026-01-01T00:00:00Z'),
        end: instant('2026-01-03T00:00:00Z'),
      });

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('two Gantts on one shared ScrollAxis, with different pane widths, report different spans', () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    try {
      const scroll = new ScrollAxis();
      const sharedScale = new TimeScaleModel({ range: 'fitDataset', fit: 'preset', preset: 'day' });
      const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });

      const narrowContainer = document.createElement('div');
      const narrowGantt = new Gantt({
        container: narrowContainer,
        dataset,
        scale: sharedScale,
        scroll: { x: scroll },
      });
      const wideContainer = document.createElement('div');
      const wideGantt = new Gantt({
        container: wideContainer,
        dataset,
        scale: sharedScale,
        scroll: { x: scroll },
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      FakeResizeObserver.instances[1]!.fire({ width: 900, height: 100 });

      expect(narrowGantt.visibleSpan.start).toBe(wideGantt.visibleSpan.start);
      expect(narrowGantt.visibleSpan.end).not.toBe(wideGantt.visibleSpan.end);

      narrowGantt.destroy();
      wideGantt.destroy();
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

  it('[#394] checkResolvedTheme() re-resolves after a re-parent and fires themeChange when the answer moved', () => {
    const outerLight = document.createElement('div');
    const outerDark = document.createElement('div');
    outerDark.setAttribute('data-fg-theme', 'dark');

    const container = document.createElement('div');
    outerLight.append(container);
    const gantt = new Gantt({ container, dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }) });

    expect(gantt.resolvedTheme).toBe('light');

    const events: Array<{ from: string; to: string }> = [];
    gantt.on('themeChange', (change) => {
      events.push(change);
    });

    // Re-parent under the differently-pinned wrapper. No attribute of this Gantt's own changed, so
    // the getter already answers 'dark' but no event has fired yet.
    outerDark.append(container);
    expect(gantt.resolvedTheme).toBe('dark');
    expect(events).toEqual([]);

    expect(gantt.checkResolvedTheme()).toBe('dark');
    expect(events).toEqual([{ from: 'light', to: 'dark' }]);

    // Calling again with no further move fires nothing more.
    expect(gantt.checkResolvedTheme()).toBe('dark');
    expect(events).toEqual([{ from: 'light', to: 'dark' }]);

    gantt.destroy();
  });

  it('[#376] fires no event before the constructor returns, and themeChange never carries from: undefined', () => {
    const container = document.createElement('div');
    const events: Array<{ event: string; payload: unknown }> = [];
    const spy: ChromePlugin = {
      id: 'test.themeSpy',
      view: (ctx) => {
        ctx.events.on('themeChange', (payload) => {
          events.push({ event: 'themeChange', payload });
        });
        ctx.events.on('navigationChange', (payload) => {
          events.push({ event: 'navigationChange', payload });
        });
      },
    };

    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      theme: 'dark',
      plugins: [spy],
    });

    // Construction reported nothing — not the initial preset settling, not the theme this Gantt
    // just wrote for the first time. A plugin reads starting state off `ctx.gantt` instead.
    expect(events).toEqual([]);
    expect(gantt.resolvedTheme).toBe('dark');

    gantt.theme = 'light';
    expect(events).toEqual([{ event: 'themeChange', payload: { from: 'dark', to: 'light' } }]);

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

describe("a constructor-supplied plugin's view() runs on a finished Gantt", () => {
  it('reads every applied option back off ctx.gantt, and the DOM its own registrations shaped, with no await', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      fieldTypes: { risk: { rollUp: 'max', column: { header: 'Risk' } } },
      fields: [{ key: 'risk', type: 'risk' }],
      entries: [{ ...sampleEntries[0]!.toInput(), props: { risk: 'high' } }],
    });
    let seen:
      | {
          selectedEntryIds: readonly unknown[];
          zoomPresetIds: readonly string[];
          resolvedTheme: unknown;
          a11yLabel: string;
          gridWidth: number;
        }
      | undefined;
    const gantt = new Gantt({
      container,
      dataset,
      theme: 'dark',
      a11yLabel: 'Room bookings',
      gridWidth: 220,
      gridColumns: ['name'],
      selectedEntryIds: [sampleEntries[0]!.id],
      zoomPresets: ['day', 'week'],
      plugins: [
        {
          id: 'demo.readsFinishedGantt',
          view(ctx) {
            seen = {
              selectedEntryIds: ctx.gantt.selectedEntryIds,
              zoomPresetIds: ctx.gantt.zoomPresets.map((preset) => preset.id),
              resolvedTheme: ctx.gantt.resolvedTheme,
              a11yLabel: ctx.gantt.a11yLabel,
              gridWidth: ctx.gantt.gridWidth,
            };
            // A plugin variant, a plugin grid column and a decoration all shape frame 1 — the DOM
            // they draw is already there when `new Gantt()` below returns, with no `await`.
            ctx.variants.add({
              name: 'buffer',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              bars: (entry) => [
                {
                  id: barId(entry.id, 0),
                  entryId: entry.id,
                  variant: 'buffer',
                  label: 'buffer',
                  start: entry.start!,
                  end: entry.end!,
                },
              ],
            });
            ctx.view.registerGridColumn({ field: 'risk' });
            ctx.view.registerDecoration('underBars', () => [
              {
                kind: 'rangeBand',
                start: sampleEntries[0]!.start!,
                end: sampleEntries[0]!.end!,
                class: 'demo-band',
              },
            ]);
            return () => {};
          },
        },
      ],
    });

    expect(seen).toEqual({
      selectedEntryIds: [sampleEntries[0]!.id],
      zoomPresetIds: ['day', 'week'],
      resolvedTheme: 'dark',
      a11yLabel: 'Room bookings',
      gridWidth: 220,
    });
    expect(container.querySelector('.fg-bar[data-variant="buffer"]')).not.toBeNull();
    expect(container.querySelector('[data-field="risk"]')).not.toBeNull();
    expect(container.querySelector('.demo-band')).not.toBeNull();

    gantt.destroy();
  });

  it("[#376] a view()-time write to ctx.gantt is silent: an earlier plugin's handler hears nothing, but the write stands", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const heardByA: unknown[] = [];
    const pluginA: ChromePlugin = {
      id: 'demo.a',
      view(ctx) {
        ctx.events.on('selectionChange', (change) => {
          heardByA.push(change);
        });
      },
    };
    const pluginB: ChromePlugin = {
      id: 'demo.b',
      view(ctx) {
        ctx.gantt.selectedEntryIds = [sampleEntries[1]!.id];
      },
    };

    const gantt = new Gantt({ container, dataset, plugins: [pluginA, pluginB] });

    expect(heardByA).toEqual([]);
    expect(gantt.selectedEntryIds).toEqual([sampleEntries[1]!.id]);

    gantt.destroy();
  });
});

describe('a throwing view() tears the shell down (ADR 0032)', () => {
  it('rethrows PluginSetupError, empties the container, and detaches the dataset and document listeners', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const datasetOff = vi.spyOn(dataset, 'off');
    const documentRemoveListener = vi.spyOn(document, 'removeEventListener');

    let thrown: unknown;
    try {
      new Gantt({
        container,
        dataset,
        plugins: [
          {
            id: 'demo.throwsInView',
            view() {
              throw new Error('boom');
            },
          },
        ],
      });
      expect.unreachable();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PluginSetupError);
    expect(container.children.length).toBe(0);
    expect(datasetOff).toHaveBeenCalledWith('change', expect.any(Function));
    expect(documentRemoveListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);

    container.remove();
  });
});

describe('the ⚠️ consequences ADR 0032 records', () => {
  it("theme: 'auto' resolves against the OS inside view(), not against the light default", () => {
    const matchesDark = {
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    vi.stubGlobal('matchMedia', () => matchesDark);
    try {
      const container = document.createElement('div');
      let seenInView: string | undefined;
      const gantt = new Gantt({
        container,
        dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
        theme: 'auto',
        plugins: [
          {
            id: 'demo.readsAutoTheme',
            view(ctx) {
              seenInView = ctx.gantt.resolvedTheme;
            },
          },
        ],
      });

      // Before ADR 0032, view() ran ahead of the shell's own option application, so this answered
      // the class default ('light') instead of the OS's own dark-scheme match.
      expect(seenInView).toBe('dark');

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ctx.gantt.plugins reads [] during view(), even for the plugin whose own view() is running', () => {
    const container = document.createElement('div');
    let seenInView: readonly unknown[] | undefined;
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      plugins: [
        {
          id: 'demo.readsPluginsDuringView',
          view(ctx) {
            seenInView = ctx.gantt.plugins;
          },
        },
      ],
    });

    expect(seenInView).toEqual([]);
    expect(gantt.plugins.map((plugin) => plugin.id)).toEqual(['demo.readsPluginsDuringView']);

    gantt.destroy();
  });

  it('a Dataset write inside view() becomes an undo step, not a silent seed', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const entryId = sampleEntries[0]!.id;
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        {
          id: 'demo.writesDatasetInView',
          view() {
            dataset.entries.update(entryId, { name: 'written in view()' });
          },
        },
      ],
    });

    expect(dataset.entries.get(entryId)?.name).toBe('written in view()');
    expect(dataset.canUndo).toBe(true);

    dataset.undo();
    expect(dataset.entries.get(entryId)?.name).toBe(sampleEntries[0]!.name);

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

describe('Gantt gridResizable (#432)', () => {
  /** Drags the real splitter from `fromX` to `toX` and releases — same helper as the
   *  `minGridWidth` suite above. */
  function dragSplitter(container: HTMLElement, fromX: number, toX: number): void {
    const splitter = container.querySelector<HTMLElement>('.fg-splitter');
    if (splitter === null) throw new Error('no splitter');
    splitter.setPointerCapture = vi.fn();
    splitter.releasePointerCapture = vi.fn();
    splitter.dispatchEvent(new PointerEvent('pointerdown', { clientX: fromX, pointerId: 1 }));
    splitter.dispatchEvent(new PointerEvent('pointermove', { clientX: toX, pointerId: 1 }));
    splitter.dispatchEvent(new PointerEvent('pointerup', { clientX: toX, pointerId: 1 }));
  }

  it('defaults true: the splitter drags exactly as it did before this option existed', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });

    dragSplitter(container, 200, 300);

    expect(gantt.gridWidth).toBe(300);
    gantt.destroy();
  });

  it('gridResizable: false stops a splitter drag from changing gridWidth', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridResizable: false,
    });

    dragSplitter(container, 200, 300);

    expect(gantt.gridWidth).toBe(200);
    gantt.destroy();
  });

  it('gridResizable: false fires no beforeGridWidthChange for a drag that cannot arm', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridResizable: false,
    });
    const before = vi.fn();
    gantt.on('beforeGridWidthChange', before);

    dragSplitter(container, 200, 300);

    expect(before).not.toHaveBeenCalled();
    gantt.destroy();
  });

  it('gridResizable: false leaves the splitter with no resize cursor', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
    });

    const splitter = container.querySelector<HTMLElement>('.fg-splitter')!;
    expect(splitter.hasAttribute('data-resize-off')).toBe(true);

    gantt.destroy();
  });

  it('gridResizable: false stops every column painting a resizer grip, regardless of its own resizable', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
      gridColumns: [{ field: 'name', resizable: true }],
    });

    const header = container.querySelector<HTMLElement>('.fg-col-header')!;
    expect(header.hasAttribute('data-resizable-off')).toBe(true);

    gantt.destroy();
  });

  it('gridResizable: false fires no beforeGridColumnsChange for a column resize that cannot arm', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
      gridColumns: ['name'],
    });
    const before = vi.fn();
    gantt.on('beforeGridColumnsChange', before);

    const resizer = container.querySelector<HTMLElement>('.fg-column-resizer')!;
    resizer.setPointerCapture = vi.fn();
    resizer.releasePointerCapture = vi.fn();
    resizer.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 0, pointerId: 1, bubbles: true }),
    );
    resizer.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );
    resizer.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 250, clientY: 0, pointerId: 1, bubbles: true }),
    );

    expect(before).not.toHaveBeenCalled();
    gantt.destroy();
  });

  it('a programmatic gridWidth write still lands while locked — the gesture is off, not the value', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridResizable: false,
    });

    gantt.gridWidth = 240;

    expect(gantt.gridWidth).toBe(240);
    gantt.destroy();
  });

  it('a programmatic gridColumns write still lands while locked', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
      gridColumns: ['name'],
    });

    gantt.gridColumns = ['name', 'start'];

    expect(gantt.gridColumns.map((c) => (typeof c === 'string' ? c : c.field))).toEqual(['name', 'start']);
    gantt.destroy();
  });

  it("locks in gridWidth: 'fitColumns' against a splitter drag — #432's own consequence of #157", () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 'fitColumns',
      gridColumns: ['name', 'start'],
      gridResizable: false,
    });
    const widthBeforeDrag = gantt.gridWidth;

    dragSplitter(container, widthBeforeDrag, widthBeforeDrag + 400);

    expect(gantt.gridWidth).toBe(widthBeforeDrag);
    // A stray drag must not convert 'fitColumns' into a fixed width: adding a column still grows
    // the pane, which only happens while 'fitColumns' still stands.
    gantt.gridColumns = ['name', 'start', 'end'];
    expect(gantt.gridWidth).toBeGreaterThan(widthBeforeDrag);
    gantt.destroy();
  });

  it('is live: turning gridResizable back on restores the splitter drag', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
      gridResizable: false,
    });

    gantt.gridResizable = true;
    dragSplitter(container, 200, 300);

    expect(gantt.gridWidth).toBe(300);
    gantt.destroy();
  });

  it('is live: turning gridResizable off mid-session locks an in-place splitter', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridWidth: 200,
    });

    gantt.gridResizable = false;
    dragSplitter(container, 200, 300);

    expect(gantt.gridWidth).toBe(200);
    gantt.destroy();
  });

  it('a column keeps its own narrower resizable: false once the Gantt-wide lock lifts', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
      gridColumns: [{ field: 'name', resizable: false }],
    });

    gantt.gridResizable = true;

    const header = container.querySelector<HTMLElement>('.fg-col-header')!;
    expect(header.hasAttribute('data-resizable-off')).toBe(true);
    gantt.destroy();
  });

  // (branch review, 2026-09-19): a locked Gantt paints every grip off, but a programmatic
  // column write's own `from` must still report the consumer's real, authored `resizable` — never
  // a `resizable: false` the lock forced into a stored resolution and the consumer never wrote.
  it('gridColumnsChange reports the authored resizable, not the lock, in both from and to', () => {
    const container = document.createElement('div');
    const gantt = new Gantt({
      container,
      dataset: new Dataset({ entries: sampleEntries, timeZone: 'UTC' }),
      gridResizable: false,
      gridColumns: ['name', 'start'],
    });
    const changed = vi.fn();
    gantt.on('gridColumnsChange', changed);

    gantt.hideGridColumn('start');

    expect(changed).toHaveBeenCalledTimes(1);
    const [{ from, to }] = changed.mock.calls[0] as [{ from: GridColumn[]; to: GridColumn[] }];
    const fromName = from.find((c) => c.field === 'name')!;
    const toName = to.find((c) => c.field === 'name')!;
    expect(fromName.resizable).toBe(true);
    expect(toName.resizable).toBe(true);
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

  it("the Name cell is empty for an Entry with no name — not 'undefined' (#421 C5)", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: sampleEntries.map((entry, i) => (i === 0 ? { ...entry.toInput(), name: undefined } : entry)),
    });
    const gantt = new Gantt({ container, dataset, gridColumns: ['name'] });

    const firstRow = container.querySelector<HTMLElement>('.fg-row')!;
    const nameCell = firstRow.querySelector('.fg-row-label, .fg-row-cell')!;
    expect(nameCell.textContent).toBe('');

    gantt.destroy();
  });

  it('a per-column columnRenderer beats a plugin-registered cell renderer (D-S5-11/D-S5-17 combined order, s5.4-renderers.md)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries.slice(0, 1) });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: [{ field: 'name', columnRenderer: () => ({ text: 'per-column' }) }],
      plugins: [
        {
          id: 'demo.cell-renderer',
          view(ctx) {
            ctx.view.registerRenderer('gridCell', () => ({ text: 'plugin' }));
            return () => {};
          },
        },
      ],
    });

    const cell = container.querySelector<HTMLElement>('.fg-row-label[data-field="name"]')!;
    expect(cell.textContent).toBe('per-column');

    gantt.destroy();
  });

  it('a gridCellRenderer reads the Field value beside the formatted string (review H3)', () => {
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
      gridCellRenderer: ({ column, value, fieldValue }) => {
        if (column.field === 'cost') seen.push({ value, fieldValue });
        return undefined;
      },
    });

    // The renderer branches on the number the Field registry produced; it never parses "$1500" back.
    expect(seen).toEqual([{ value: '$1500', fieldValue: 1500 }]);

    gantt.destroy();
  });

  it('a per-column columnRenderer reads the same Field value (review H3)', () => {
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
          columnRenderer: ({ value, fieldValue }) =>
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

  // #428: duration is an ordinary Field, so its text overrides the same way start's and end's do.
  it('a formatValue override on duration changes the grid cell, the bar label and every other reader', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [
        {
          key: 'duration',
          formatValue: (value: Duration | undefined) => `${(value?.value ?? 0) / MS.DAY} d`,
        },
      ],
      entries: [{ id: 't1', name: 'Design', start: 0, end: 2 * MS.DAY }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      gridColumns: ['name', 'duration'],
      barLabels: { field: 'duration' },
    });

    const cell = container.querySelector<HTMLElement>('.fg-row[data-entry-id="t1"] [data-field="duration"]')!;
    const bar = container.querySelector<HTMLElement>(
      `.fg-bar[data-bar-id="${barId(entryId('t1'), 0)}"] .fg-bar-label`,
    )!;
    const entry = dataset.entries.get('t1')!;
    expect(cell.textContent).toBe('2 d');
    expect(bar.textContent).toBe('2 d');
    expect(
      dataset.field('duration')!.formatValue!(
        entry.read('duration'),
        { timeZone: 'UTC', locale: 'en-US' },
        entry,
      ),
    ).toBe('2 d');

    gantt.destroy();
    container.remove();
  });
});

describe('Gantt.formatFieldValue (#576)', () => {
  function moneyGantt(container: HTMLElement) {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [
        { key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' },
        { key: 'progress', type: 'percent' },
      ],
      entries: sampleEntries.map((entry, i) =>
        i === 0 ? { ...entry.toInput(), props: { cost: 500, progress: 40 } } : entry,
      ),
    });
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'cost'] });
    return { dataset, gantt };
  }

  it('gives the same text the painted grid cell shows', () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[0]!;
    const cell = container.querySelector('.fg-row [data-field="cost"]');
    expect(gantt.formatFieldValue(entry, 'cost')).toBe(cell?.textContent);
    gantt.destroy();
  });

  it('formats a Field with no column', () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[0]!;
    expect(gantt.formatFieldValue(entry, 'progress')).toBe('40%');
    gantt.destroy();
  });

  it('follows gantt.locale live', () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[0]!;
    const before = gantt.formatFieldValue(entry, 'cost');
    gantt.locale = 'de-DE';
    expect(gantt.formatFieldValue(entry, 'cost')).not.toBe(before);
    gantt.destroy();
  });

  it("gives '' for an Entry with no value", () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[1]!;
    expect(gantt.formatFieldValue(entry, 'progress')).toBe('');
    gantt.destroy();
  });

  it('throws UnknownFieldError naming formatFieldValue for an undeclared key', () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[0]!;
    try {
      gantt.formatFieldValue(entry, 'notAField');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownFieldError);
      expect((error as UnknownFieldError).operation).toBe('formatFieldValue' satisfies string);
    }
    gantt.destroy();
  });

  it("formats a compute Field's own text, the same the Grid paints", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', { field: 'duration' }] });
    const entry = dataset.entries.all[0]!;
    const cell = container.querySelector('.fg-row [data-field="duration"]');
    expect(gantt.formatFieldValue(entry, 'duration')).toBe(cell?.textContent);
    gantt.destroy();
  });

  it("reads through dataset.formatFieldValue with this Gantt's own locale (#583)", () => {
    const container = document.createElement('div');
    const { dataset, gantt } = moneyGantt(container);
    const entry = dataset.entries.all[0]!;
    expect(gantt.formatFieldValue(entry, 'cost')).toBe(dataset.formatFieldValue(entry, 'cost'));
    gantt.locale = 'de-DE';
    expect(gantt.formatFieldValue(entry, 'cost')).toBe(dataset.formatFieldValue(entry, 'cost', 'de-DE'));
    gantt.destroy();
  });
});

describe("Gantt falls back to the Dataset's own locale (#583)", () => {
  function moneyGanttWithDatasetLocale(container: HTMLElement, locale: Intl.LocalesArgument) {
    const dataset = new Dataset({
      timeZone: 'UTC',
      locale,
      fields: [{ key: 'cost', type: currency({ code: 'EUR' }), rollUp: 'sum' }],
      entries: sampleEntries.map((entry, i) =>
        i === 0 ? { ...entry.toInput(), props: { cost: 500 } } : entry,
      ),
    });
    return { dataset };
  }

  it("with no locale of its own, shows the Dataset's locale in a Grid cell and in formatFieldValue", () => {
    const container = document.createElement('div');
    const { dataset } = moneyGanttWithDatasetLocale(container, 'de-DE');
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'cost'] });
    const entry = dataset.entries.all[0]!;
    const cell = container.querySelector('.fg-row [data-field="cost"]');
    expect(cell?.textContent).toBe('500,00 €');
    expect(gantt.formatFieldValue(entry, 'cost')).toBe(cell?.textContent);
    gantt.destroy();
  });

  it("this Gantt's own locale beats the Dataset's", () => {
    const container = document.createElement('div');
    const { dataset } = moneyGanttWithDatasetLocale(container, 'de-DE');
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'cost'], locale: 'en-US' });
    const entry = dataset.entries.all[0]!;
    const cell = container.querySelector('.fg-row [data-field="cost"]');
    expect(cell?.textContent).toBe('€500.00');
    expect(gantt.formatFieldValue(entry, 'cost')).toBe('€500.00');
    gantt.destroy();
  });

  it("a live gantt.locale = undefined falls back to the Dataset's own locale", async () => {
    const container = document.createElement('div');
    const { dataset } = moneyGanttWithDatasetLocale(container, 'de-DE');
    const gantt = new Gantt({ container, dataset, gridColumns: ['name', 'cost'], locale: 'en-US' });
    const entry = dataset.entries.all[0]!;
    gantt.locale = undefined;
    expect(gantt.locale).toBeUndefined();
    expect(gantt.formatFieldValue(entry, 'cost')).toBe('500,00 €');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const cell = container.querySelector('.fg-row [data-field="cost"]');
    expect(cell?.textContent).toBe('500,00 €');
    gantt.destroy();
  });
});

describe('Gantt.formatContext (#578)', () => {
  it("carries the Dataset's own time zone", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'America/New_York', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset });
    expect(gantt.formatContext.timeZone).toBe('America/New_York');
    gantt.destroy();
  });

  it('follows gantt.locale live', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset });
    gantt.locale = 'de-DE';
    expect(gantt.formatContext.locale).toBe('de-DE');
    gantt.destroy();
  });

  it("falls back to the Dataset's own locale when the Gantt names none (#583)", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ timeZone: 'UTC', locale: 'de-DE', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset });
    expect(gantt.formatContext.locale).toBe('de-DE');
    expect(gantt.locale).toBeUndefined();
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
    // straight back as `gridColumns`. `format` is the one thing dropped (#194).
    expect(before[0]!.from).toEqual([expect.objectContaining({ field: 'name' })]);
    expect(before[0]!.to).toEqual([
      expect.objectContaining({ field: 'name' }),
      expect.objectContaining({ field: 'start' }),
    ]);
    expect(after[0]).toEqual(before[0]);

    gantt.destroy();
  });

  // #194: a renderer context used to hand a consumer `column.key` while every other
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
      gridCellRenderer: ({ column }) => {
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
    // A hidden consumer column stays in the payload, so a saved list restores it hidden.
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
  it('barRenderer/gridCellRenderer/headerRenderer/tooltipRenderer are live properties', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 1), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    expect(gantt.barRenderer).toBeUndefined();
    expect(gantt.gridCellRenderer).toBeUndefined();
    expect(gantt.headerRenderer).toBeUndefined();
    expect(gantt.tooltipRenderer).toBeUndefined();

    const barRenderer = () => ({ text: 'bar' });
    const gridCellRenderer = () => ({ text: 'gridCell' });
    const headerRenderer = () => ({ text: 'header' });
    const tooltipRenderer = () => ({ text: 'tooltip' });
    gantt.barRenderer = barRenderer;
    gantt.gridCellRenderer = gridCellRenderer;
    gantt.headerRenderer = headerRenderer;
    gantt.tooltipRenderer = tooltipRenderer;

    expect(gantt.barRenderer).toBe(barRenderer);
    expect(gantt.gridCellRenderer).toBe(gridCellRenderer);
    expect(gantt.headerRenderer).toBe(headerRenderer);
    expect(gantt.tooltipRenderer).toBe(tooltipRenderer);

    gantt.destroy();
  });

  // #448: `barRenderer` is the catch-all `#paintFor`'s ladder reaches only when the resolved
  // variant has no `paint` of its own. Assign one to a Gantt whose entries all resolve to a
  // painting variant, and it silently never runs — these four tests pin the warning that now says
  // so, and the false positives a naive per-frame check would have introduced.
  describe("'bar-renderer-shadowed': barRenderer painting no bars is reported (#448)", () => {
    const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));

    it('reports once, the moment every entry already resolves to a painting variant', async () => {
      const container = document.createElement('div');
      const dataset = new Dataset({ entries: [sampleEntries[0]!.toInput()], timeZone: 'UTC' });
      const gantt = new Gantt({
        container,
        dataset,
        variants: [{ name: 'v', when: () => true, paint: () => ({ text: 'v' }) }],
      });
      const reports: ErrorReport[] = [];
      // Subscribed before `barRenderer` is assigned: the constructor's own first paint runs
      // synchronously, and a handler added after that call would miss the check it triggers.
      gantt.on('error', (report) => {
        reports.push(report);
      });
      gantt.barRenderer = () => ({ text: 'never painted' });

      await paint();
      await paint();

      const shadowed = reports.filter((report) => report.code === 'bar-renderer-shadowed');
      expect(shadowed).toHaveLength(1);
      expect(shadowed[0]?.severity).toBe('warning');
      expect(shadowed[0]?.by).toBe('core');
      expect(shadowed[0]?.message).toContain('barRenderer');
      expect(shadowed[0]?.message).toContain('paint');

      gantt.destroy();
    });

    it('does not fire while a scroll only changes which already-painting rows sit in the frame', async () => {
      // A frame drawing only variant-painted rows is not proof the renderer never paints — the
      // rest of the Dataset may still reach it off-window. So the check reads the whole Dataset
      // (`dataset.entries.all`), the same array `render()` already holds, never the frame's own
      // windowed rows, and a repeated render with nothing changed must report nothing new.
      const container = document.createElement('div');
      const dataset = new Dataset({
        entries: [sampleEntries[0]!.toInput(), sampleEntries[1]!.toInput()],
        timeZone: 'UTC',
      });
      const gantt = new Gantt({
        container,
        dataset,
        variants: [
          { name: 'v', when: (entry) => entry.id === sampleEntries[0]!.id, paint: () => ({ text: 'v' }) },
        ],
      });
      const reports: ErrorReport[] = [];
      gantt.on('error', (report) => {
        reports.push(report);
      });
      gantt.barRenderer = () => ({ text: 'reaches entry-2' });

      await paint();
      await paint();
      await paint();

      expect(reports.filter((report) => report.code === 'bar-renderer-shadowed')).toHaveLength(0);
      gantt.destroy();
    });

    it('does not fire for a barRenderer assigned before any entries exist', async () => {
      const container = document.createElement('div');
      const dataset = new Dataset({ entries: [], timeZone: 'UTC' });
      const gantt = new Gantt({
        container,
        dataset,
        variants: [{ name: 'v', when: () => true, paint: () => ({ text: 'v' }) }],
        barRenderer: () => ({ text: 'never painted' }),
      });
      const reports: ErrorReport[] = [];
      gantt.on('error', (report) => {
        reports.push(report);
      });

      await paint();
      expect(reports.filter((report) => report.code === 'bar-renderer-shadowed')).toHaveLength(0);

      // An empty Dataset answers nothing, so the check is not spent on it — once an Entry exists
      // to ask about, the same assigned renderer is checked for real.
      dataset.entries.add(sampleEntries[0]!.toInput());
      await paint();
      expect(reports.filter((report) => report.code === 'bar-renderer-shadowed')).toHaveLength(1);

      gantt.destroy();
    });

    it('does not fire when barRenderer is set to undefined', async () => {
      const container = document.createElement('div');
      const dataset = new Dataset({ entries: [sampleEntries[0]!.toInput()], timeZone: 'UTC' });
      const gantt = new Gantt({
        container,
        dataset,
        variants: [{ name: 'v', when: () => true, paint: () => ({ text: 'v' }) }],
        barRenderer: () => ({ text: 'never painted' }),
      });
      const reports: ErrorReport[] = [];
      gantt.on('error', (report) => {
        reports.push(report);
      });
      gantt.barRenderer = undefined;

      await paint();

      expect(reports.filter((report) => report.code === 'bar-renderer-shadowed')).toHaveLength(0);
      gantt.destroy();
    });
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
    // A rule that names the rows it covers beats a catch-all that names none. Core's `parent`
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

  it('lets a consumer’s own rule match the summary row, which is how they paint it (J61)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'P', start: '2026-01-01', end: '2026-01-10' },
        { id: 'c', name: 'C', parentId: 'p', start: '2026-01-01', end: '2026-01-10' },
      ],
    });
    const painted: string[] = [];
    // The consumer's own rule outranks core's, so their paint answers.
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
      expect(variant.bars).toEqual(expect.any(Function));

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
    // Date-only strings, not an Instant pair: a date-only `end` always means through that day, so
    // `start === end` here ingests as one calendar day, not a zero-duration point
    // (`diamond()`'s own default `when` does not match it). Named for what it delivers,
    // because this `describe` only ever asserts stylesheet text and never which row `diamond()`
    // claims — the neighbouring `pointDataset()` above, built from `instant(Date.UTC(...))`, is
    // the one that actually matches a row.
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

  it('the same match matches the row once a Field declares the key (F2)', () => {
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
              ctx.view.registerRenderer('gridCell', () => undefined);
              return () => {};
            },
          },
          {
            id: 'demo.renderer-two',
            view(ctx) {
              ctx.view.registerRenderer('gridCell', () => undefined);
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
              bars: (entry) => [
                {
                  id: barId(entry.id, 0),
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
    // The plugin's variant already shaped frame 1 (ADR 0032): the bar reads its buffer label with
    // no `await`. Dropping the plugin below still needs a real rAF, because `gantt.plugins = []`
    // runs a live reconfiguration, not a construction-time install.
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe(`buffer: ${sampleEntries[0]!.name}`);

    gantt.plugins = [];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector<HTMLElement>('.fg-bar')!.textContent).toBe(sampleEntries[0]!.name);

    gantt.destroy();
  });

  it("ctx.variants.add's items with no label get the Gantt's barLabels answer (Q36, #421 C5)", async () => {
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
          id: 'demo.unlabelledVariant',
          view(ctx) {
            // No `label` here — the producer opts back into the Gantt's own Field resolution
            // instead of insisting on its own text (absent means "the Gantt decides").
            ctx.variants.add({
              name: 'unlabelled',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              bars: (entry) => [
                {
                  id: barId(entry.id, 0),
                  entryId: entry.id,
                  variant: 'unlabelled',
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
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe(sampleEntries[0]!.name);

    gantt.destroy();
  });

  it("a variant's own `capabilities` refuses resize for the rows it matches; disposal restores the library default", () => {
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
              capabilities: { resize: false },
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
  // `'variant-matched-twice'` names, so a console warning here is the design speaking.
  const bufferVariant = (pluginId: string, resize: boolean) => ({
    id: pluginId,
    view(ctx: PluginContext) {
      ctx.variants.add({
        name: 'buffer',
        when: (entry) => entry.id === sampleEntries[0]!.id,
        capabilities: { resize },
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

    // B registers last and wins: resize affordance visible.
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

  it("the consumer's own `capabilities` still wins over a variant's own `capabilities`", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: [sampleEntries[0]!.toInput()],
      timeZone: 'UTC',
    });
    const gantt = new Gantt({
      container,
      dataset,
      capabilities: { resize: true },
      plugins: [
        {
          id: 'demo.bufferVariant',
          view(ctx) {
            ctx.variants.add({
              name: 'buffer',
              when: (entry) => entry.id === sampleEntries[0]!.id,
              capabilities: { resize: false },
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
    // the raw, consumer-authored list is untouched by the plugin's append.
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
    // commit stores "risk" as a plugin-declared column of its own — the same seam
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
    // width 200 — the same seam `api/plugin-context.ts`'s disposal promise reaches.
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
    // writes the consumer's own list (config beats a plugin), and a resize is a gesture the
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

    // Keyed by `data-bar-id` (the Entry's own id), not `data-variant`: a variant is a rule
    // resolved fresh every frame (ADR 0018), so `data-variant` reverts to `leaf` the moment a
    // plugin drops — the bar itself (and the Entry it draws) does not move.
    const barFor = (entryId: string): HTMLElement =>
      Array.from(container.querySelectorAll<HTMLElement>('.fg-bar')).find((bar) =>
        bar.getAttribute('data-bar-id')?.startsWith(`${entryId}:`),
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

  it('[Q10] two plugins matching the same entry: the first match paints, and the collision is reported', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // The same Entry, marked for both plugins' rules. The `[review P2]` test above marks disjoint
    // rows, so it never exercises this — nothing in the suite pinned a collision before.
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

    // The newest rule wins. `riskKind` installed last, so the bar wears 'risk', not 'buffer'.
    expect(bar.getAttribute('data-variant')).toBe('risk');
    expect(bar.classList.contains('demo-risk-bar')).toBe(true);
    expect(bar.classList.contains('demo-buffer-bar')).toBe(false);

    // The library reports and continues; it never arbitrates between two plugins the consumer
    // chose to install. The report names both variants and both plugin ids.
    const collision = reports.find((report) => report.code === 'variant-matched-twice');
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
    // Both rules match both entries, and a variant resolves once per Entry per frame. A collision
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

    expect(reports.filter((report) => report.code === 'variant-matched-twice')).toHaveLength(1);

    gantt.destroy();
    container.remove();
  });

  it('[J59] reports a variant rule that matches on a key no Field declares', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    // A typo in a `when` matches no row, and it must not take the layout pass down. Silence was the
    // The rule stopped matching and nothing said why.
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const reports: ErrorReport[] = [];
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    // Assigned after the subscription, not passed to the constructor: a variant in `GanttOptions`
    // resolves during the constructor's own first paint, the same trap the test above names.
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

  it('[#421 F2] a bad gantt.barLabels field reports once and renders no label, never throws', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const reports: ErrorReport[] = [];
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    // Assigned after the subscription, live (`plans/02`): `barLabels` in `GanttOptions` resolves
    // during the constructor's own first paint, the same trap the test above names.
    gantt.barLabels = { field: 'notAField' };
    // One report for the field, however many bars and frames run — never one throw per bar, which
    // would escape `FrameScheduler`'s own rAF callback and reach no consumer (#421).
    await new Promise((resolve) => requestAnimationFrame(resolve));
    gantt.barLabels = { field: 'notAField' };
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar.textContent).toBe('');

    const missing = reports.filter((report) => report.code === 'unknown-bar-label-field');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe('warning');
    expect(missing[0]?.field).toBe('notAField');
    expect(missing[0]?.message).toContain('barLabels');

    gantt.destroy();
    container.remove();
  });

  it('[#421 F2] a bad EntryVariant.barLabels field reports once and renders no label, never throws', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const reports: ErrorReport[] = [];
    const gantt = new Gantt({ container, dataset });
    gantt.on('error', (report) => {
      reports.push(report);
    });
    // A variant's own `barLabels` is live too (ADR 0018), and it overrides the Gantt's own — a
    // valid Gantt-wide field is not enough to save it (`mergeBarLabels`).
    gantt.variants = [
      {
        name: 'badLabelField',
        when: (entry) => entry.id === sampleEntries[0]!.id,
        barLabels: { field: 'notAField' },
      },
    ];
    await new Promise((resolve) => requestAnimationFrame(resolve));
    gantt.variants = [{ ...gantt.variants[0]! }];
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe('');

    const missing = reports.filter((report) => report.code === 'unknown-bar-label-field');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.field).toBe('notAField');

    gantt.destroy();
    container.remove();
  });

  describe('childrenAsSegments on a real Gantt (#421 C1, item 1 — entryRulePorts reaches resolveRows)', () => {
    function segmentedTree() {
      return [
        { id: 'p1', name: 'P1', start: '2026-01-01', end: '2026-01-10', props: { phase: 'build' } },
        { id: 'c1', name: 'C1', parentId: 'p1', start: '2026-01-01', end: '2026-01-05' },
        { id: 'c2', name: 'C2', parentId: 'p1', start: '2026-01-05', end: '2026-01-10' },
        { id: 'p2', name: 'P2', start: '2026-01-01', end: '2026-01-10', props: { phase: 'plan' } },
        { id: 'c3', name: 'C3', parentId: 'p2', start: '2026-01-01', end: '2026-01-10' },
      ];
    }

    it('a field-match rule matches only the parent it matches: one row for it, none for its children, the other parent and its child untouched', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({ timeZone: 'UTC', fields: [{ key: 'phase' }], entries: segmentedTree() });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: { phase: 'build' } },
      });

      const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
        row.getAttribute('data-entry-id'),
      );
      // p1 is segmented (phase: build) — c1/c2 draw no row of their own. p2 does not match
      // (phase: plan) — it and c3 keep their own rows, same as a Gantt with no rule at all.
      expect(rowIds).toEqual(['p1', 'p2', 'c3']);

      gantt.destroy();
      container.remove();
    });

    it('a misspelt key reports once as unknown-row-source-field, and matches nothing', async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({ timeZone: 'UTC', fields: [{ key: 'phase' }], entries: segmentedTree() });
      const reports: ErrorReport[] = [];
      const gantt = new Gantt({ container, dataset });
      gantt.on('error', (report) => {
        reports.push(report);
      });
      // Assigned after the subscription, not passed to the constructor: `rowSource` in `GanttOptions`
      // resolves during the constructor's own first paint, the same trap the test above names.
      gantt.rowSource = { source: 'entries', childrenAsSegments: { phaes: 'build' } as never };
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // One report for the key, however many frames run.
      gantt.rowSource = { ...gantt.rowSource };
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
        row.getAttribute('data-entry-id'),
      );
      // Every entry keeps its own row: the rule matches nothing, not `unknown-variant-field`'s
      // "typo'd key" case, but this rule's own code.
      expect(rowIds).toEqual(['p1', 'c1', 'c2', 'p2', 'c3']);

      const missing = reports.filter((report) => report.code === 'unknown-row-source-field');
      expect(missing).toHaveLength(1);
      expect(missing[0]?.field).toBe('phaes');
      expect(missing[0]?.message).toContain('childrenAsSegments');

      gantt.destroy();
      container.remove();
    });

    it('the rule switches live: clearing it gives every child its row back', async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({ timeZone: 'UTC', fields: [{ key: 'phase' }], entries: segmentedTree() });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
      });
      const rowIdsNow = (): (string | null)[] =>
        Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
          row.getAttribute('data-entry-id'),
        );

      expect(rowIdsNow()).toEqual(['p1', 'p2']);

      // Every config key is live-reconfigurable (`plans/02`), and this one is no exception.
      gantt.rowSource = { source: 'entries' };
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(rowIdsNow()).toEqual(['p1', 'c1', 'c2', 'p2', 'c3']);

      gantt.rowSource = { source: 'entries', childrenAsSegments: true };
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(rowIdsNow()).toEqual(['p1', 'p2']);

      gantt.destroy();
      container.remove();
    });

    it('two Gantts on one Dataset disagree: one folds the children, the other gives them rows (I2)', () => {
      const first = document.createElement('div');
      const second = document.createElement('div');
      document.body.append(first, second);
      const dataset = new Dataset({ timeZone: 'UTC', fields: [{ key: 'phase' }], entries: segmentedTree() });
      const folded = new Gantt({
        container: first,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
      });
      const open = new Gantt({ container: second, dataset });
      const rowIdsIn = (container: HTMLElement): (string | null)[] =>
        Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
          row.getAttribute('data-entry-id'),
        );

      // The rule is a per-Gantt row question, never a stored classification on the Entry (I2).
      expect(rowIdsIn(first)).toEqual(['p1', 'p2']);
      expect(rowIdsIn(second)).toEqual(['p1', 'c1', 'c2', 'p2', 'c3']);

      folded.destroy();
      open.destroy();
      first.remove();
      second.remove();
    });

    it('a filter that drops a segmented parent drops its segments with it (J-plan-F)', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({ timeZone: 'UTC', fields: [{ key: 'phase' }], entries: segmentedTree() });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: {
          source: 'entries',
          childrenAsSegments: true,
          filter: (entry) => entry.id !== 'p1',
        },
      });

      const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
        row.getAttribute('data-entry-id'),
      );
      // c1 and c2 are bars on p1's row, not rows. The filter drops that row, so they go with it.
      // Nothing brings them back as rows of their own.
      expect(rowIds).toEqual(['p2']);

      gantt.destroy();
      container.remove();
    });
  });

  describe('a segmented row draws its children’s bars, not core’s own rail (#421 C2, Q26/Q27/Q33)', () => {
    it('a segmented row draws exactly its children’s bars, summary() resolved for the parent included', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({
        timeZone: 'UTC',
        entries: [
          { id: 'p1', name: 'P1', start: '2026-01-01', end: '2026-01-10' },
          { id: 'c1', name: 'C1', parentId: 'p1', start: '2026-01-01', end: '2026-01-05' },
          { id: 'c2', name: 'C2', parentId: 'p1', start: '2026-01-05', end: '2026-01-10' },
        ],
      });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
      });

      const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
      const barIds = bars.map((bar) => bar.dataset['barId']);
      // p1 draws no bar of its own — `summary()` resolved for it and `wholeSpanUnlessSegments` answered `[]`
      // c1 and c2 draw their own bars, on p1's row.
      expect(barIds).toEqual([barId(entryId('c1'), 0), barId(entryId('c2'), 0)]);
      expect(bars.every((bar) => bar.dataset['variant'] === 'leaf')).toBe(true);

      gantt.destroy();
      container.remove();
    });

    it('a consumer producer that ignores the parameter still draws a band behind the children (Q26)', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({
        timeZone: 'UTC',
        entries: [
          { id: 'p1', name: 'P1', start: '2026-01-01', end: '2026-01-10' },
          { id: 'c1', name: 'C1', parentId: 'p1', start: '2026-01-01', end: '2026-01-05' },
          { id: 'c2', name: 'C2', parentId: 'p1', start: '2026-01-05', end: '2026-01-10' },
        ],
      });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
        // A plugin's own rule, ranked ahead of core's `summary()` (ADR 0018). Its `items` producer
        // names two parameters, not three, and never asks about `childrenAsSegments` — it
        // still wins and still draws.
        variants: [
          {
            name: 'band',
            when: (entry) => entry.hasChildren,
            bars: (entry, variant) => [
              {
                id: barId(entry.id, 99),
                entryId: entry.id,
                variant,
                label: entry.name,
                start: entry.start!,
                end: entry.end!,
              },
            ],
          },
        ],
      });

      const bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar'));
      const barIds = bars.map((bar) => bar.dataset['barId']);
      // p1's own band bar draws, plus c1's and c2's own bars — the band producer ignoring the new
      // parameter still ran and still won for p1.
      expect(barIds).toEqual([barId(entryId('p1'), 99), barId(entryId('c1'), 0), barId(entryId('c2'), 0)]);
      expect(bars[0]?.dataset['variant']).toBe('band');

      gantt.destroy();
      container.remove();
    });

    it('an empty segmented parent draws a blank row (J-plan-D: the row is dateless, not suppressed)', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({
        timeZone: 'UTC',
        entries: [
          // p1 has one child, so the rule matches it — but neither carries a date, so p1's own
          // rollup start/end stays undefined too. `spansTime` already skips every dateless entry
          // (ADR 0012), so this needs no new mechanism.
          { id: 'p1', name: 'P1' },
          { id: 'c1', name: 'C1', parentId: 'p1' },
        ],
      });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
      });

      const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
        row.getAttribute('data-entry-id'),
      );
      expect(rowIds).toEqual(['p1']);
      expect(container.querySelectorAll('.fg-bar')).toHaveLength(0);

      gantt.destroy();
      container.remove();
    });

    it('an parent no rule matches still wears summary()’s rail over its children’s own rows, in the same frame', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({
        timeZone: 'UTC',
        fields: [{ key: 'phase' }],
        entries: [
          { id: 'p1', name: 'P1', start: '2026-01-01', end: '2026-01-10', props: { phase: 'build' } },
          { id: 'c1', name: 'C1', parentId: 'p1', start: '2026-01-01', end: '2026-01-05' },
          { id: 'c2', name: 'C2', parentId: 'p1', start: '2026-01-05', end: '2026-01-10' },
          { id: 'p2', name: 'P2', start: '2026-02-01', end: '2026-02-10', props: { phase: 'plan' } },
          { id: 'c3', name: 'C3', parentId: 'p2', start: '2026-02-01', end: '2026-02-10' },
        ],
      });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: { phase: 'build' } },
      });

      const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
        row.getAttribute('data-entry-id'),
      );
      // p1 is segmented and folds c1/c2 onto its own row; p2 does not match, so it and c3 keep the
      // rows a Gantt with no rule at all would give them.
      expect(rowIds).toEqual(['p1', 'p2', 'c3']);

      const p2Bar = container.querySelector<HTMLElement>(
        `.fg-bar[data-bar-id="${barId(entryId('p2'), 0)}"]`,
      )!;
      const c3Bar = container.querySelector<HTMLElement>(
        `.fg-bar[data-bar-id="${barId(entryId('c3'), 0)}"]`,
      )!;
      // p2 is not segmented and still wears the rail (`summary()`, resolved on `entry.hasChildren`), in
      // the same Gantt, in the same frame, as p1's segmented row drawing c1's and c2's own bars.
      expect(p2Bar.dataset['variant']).toBe('summary');
      expect(c3Bar.dataset['variant']).toBe('leaf');
      const p1Bars = Array.from(container.querySelectorAll<HTMLElement>('.fg-bar')).map(
        (bar) => bar.dataset['barId'],
      );
      expect(p1Bars).toContain(barId(entryId('c1'), 0));
      expect(p1Bars).toContain(barId(entryId('c2'), 0));
      expect(p1Bars).not.toContain(barId(entryId('p1'), 0));

      gantt.destroy();
      container.remove();
    });
  });

  describe('a shared row resolves per Entry, not per subject (#421 C3, spike Q9)', () => {
    function segmentedGantt(
      container: HTMLElement,
      extra: Partial<ConstructorParameters<typeof Gantt>[0]> = {},
    ) {
      const dataset = new Dataset({
        timeZone: 'UTC',
        fields: [{ key: 'locked', type: 'boolean' }],
        entries: [
          { id: 'p1', name: 'P1', start: '2026-01-01', end: '2026-11-05' },
          {
            id: 'c1',
            name: 'C1',
            parentId: 'p1',
            start: '2026-01-01',
            end: '2026-01-05',
            props: { locked: true },
          },
          { id: 'c2', name: 'C2', parentId: 'p1', start: '2026-11-01', end: '2026-11-05' },
        ],
      });
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
        capabilities: { resize: (entry) => entry.read('locked') !== true },
        ...extra,
      });
      return { dataset, gantt };
    }

    it('a locked child refuses resize while its sibling keeps both handles (I14)', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const { gantt } = segmentedGantt(container);
      const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
      const original = document.elementFromPoint.bind(document);

      const lockedBar = container.querySelector<HTMLElement>(
        `.fg-bar[data-bar-id="${barId(entryId('c1'), 0)}"]`,
      )!;
      document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? lockedBar : original(x, y));
      timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
      let start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
      let end = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
      // The same `capabilities.resize` answer that hides the handle also refuses the drag (I14) —
      // this pins the paint half; `Gantt entryResize`'s tests already pin the refusal half generally.
      expect(start.hidden).toBe(true);
      expect(end.hidden).toBe(true);

      const openBar = container.querySelector<HTMLElement>(
        `.fg-bar[data-bar-id="${barId(entryId('c2'), 0)}"]`,
      )!;
      document.elementFromPoint = (x: number, y: number) => (x === 6 && y === 5 ? openBar : original(x, y));
      timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 6, clientY: 5 }));
      start = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
      end = container.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
      expect(start.hidden).toBe(false);
      expect(end.hidden).toBe(false);

      document.elementFromPoint = original;
      gantt.destroy();
      container.remove();
    });

    it('keyboard order walks the bars in draw order — the children’s dataset order (J-plan-E)', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const { gantt } = segmentedGantt(container);

      // Select c1's own bar, then step forward: draw order is c1, c2 — the children's dataset
      // order, never date order.
      gantt.selectedEntryIds = [entryId('c1')];
      gantt.commands.run('freegantt.selectNextEntry');
      expect(gantt.selectedEntryIds).toEqual([entryId('c2')]);

      gantt.commands.run('freegantt.selectNextEntry');
      // c2 is the last bar the row draws: stepping forward again clamps.
      expect(gantt.selectedEntryIds).toEqual([entryId('c2')]);

      gantt.commands.run('freegantt.selectPreviousEntry');
      expect(gantt.selectedEntryIds).toEqual([entryId('c1')]);

      gantt.destroy();
      container.remove();
    });

    it('a grid-row click selects every bar the segmented row owns', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const { gantt } = segmentedGantt(container);
      const row = container.querySelector<HTMLElement>('.fg-row[data-entry-id="p1"]')!;
      const original = document.elementFromPoint.bind(document);
      document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));

      row.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, bubbles: true }));
      document.elementFromPoint = original;

      expect(gantt.selectedEntryIds).toContain(entryId('c1'));
      expect(gantt.selectedEntryIds).toContain(entryId('c2'));

      gantt.destroy();
      container.remove();
    });

    it('reveal finds a child bar', () => {
      FakeResizeObserver.instances = [];
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      try {
        const container = document.createElement('div');
        const scroll = new ScrollAxis();
        const { gantt } = segmentedGantt(container, { fit: 'preset', preset: 'day', scroll: { x: scroll } });
        FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });

        expect(scroll.state.position).toBe(0);

        // c2 sits months after c1 — off-screen at a 300px pane, day preset — and it draws only as a
        // bar on p1's segmented row, never a row of its own.
        gantt.reveal(entryId('c2'));

        expect(scroll.state.position).toBeGreaterThan(0);

        gantt.destroy();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('a non-segmented, one-Entry row behaves exactly as it does today', () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = new Dataset({ entries: [sampleEntries[0]!.toInput()], timeZone: 'UTC' });
      const gantt = new Gantt({ container, dataset });
      const row = container.querySelector<HTMLElement>('.fg-row')!;
      const original = document.elementFromPoint.bind(document);
      document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));

      row.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, bubbles: true }));
      document.elementFromPoint = original;

      expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

      gantt.commands.run('freegantt.selectNextEntry');
      // One bar on the row: nowhere to step, nothing moves.
      expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

      gantt.destroy();
      container.remove();
    });
  });

  // #421 C7 (`959f8e6`, `plans/segment-is-a-bar/SPIKE-FINDINGS.md`): five acceptance boxes C1–C6
  // never pinned. Each `it` below names the box it closes.
  describe('the five acceptance boxes C1–C6 left uncovered (#421 C7, 959f8e6)', () => {
    /** `req-1` draws `d1`/`d2` as segments while `showDaysOnRow` reads `true` — the spike's own example
     *  (`plans/segment-is-a-bar/README.md` "The rule, in one line"). */
    function crewRoster(): EntryInput<{ showDaysOnRow: boolean; hours: number }>[] {
      return [
        { id: 'req-1', name: 'Framing crew', props: { showDaysOnRow: true } },
        {
          id: 'd1',
          name: 'Day 1',
          parentId: 'req-1',
          start: '2026-01-01',
          end: '2026-01-02',
          props: { hours: 8 },
        },
        {
          id: 'd2',
          name: 'Day 2',
          parentId: 'req-1',
          start: '2026-01-02',
          end: '2026-01-03',
          props: { hours: 4 },
        },
      ];
    }

    function crewDataset() {
      return new Dataset({
        timeZone: 'UTC',
        fields: [
          { key: 'showDaysOnRow', type: 'boolean' },
          { key: 'hours', type: 'number', rollUp: 'sum' },
        ],
        entries: crewRoster(),
      });
    }

    // Box: "dataset.entries.update('req-1', { showDaysOnRow: false }) opens one row into sub-rows
    // in one undo step, leaves every other row alone, and undoes back with the Selection intact."
    // The live per-Entry switch through a data write, not through `gantt.rowSource`.
    it('a write to the Field the rule matches on opens the row into sub-rows, in one undo step, and undoes back (Q10)', async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = crewDataset();
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
      });
      const rowIdsNow = (): (string | null)[] =>
        Array.from(container.querySelectorAll<HTMLElement>('.fg-row')).map((row) =>
          row.getAttribute('data-entry-id'),
        );
      const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));

      expect(rowIdsNow()).toEqual(['req-1']);
      gantt.selectedEntryIds = [entryId('d1')];

      const changes: ChangeSet[] = [];
      dataset.on('change', ({ changeSet }) => {
        changes.push(changeSet);
      });

      dataset.entries.update('req-1', { showDaysOnRow: false });
      await paint();

      expect(rowIdsNow()).toEqual(['req-1', 'd1', 'd2']);
      // One transaction, one ChangeSet row for the write, one undo step.
      expect(changes).toHaveLength(1);
      expect(dataset.canUndo).toBe(true);
      // The Selection survives the re-fold: d1 was selected before, and it is still a valid
      // Entry id after the row opens — the write never touched the Selection.
      expect(gantt.selectedEntryIds).toEqual([entryId('d1')]);

      dataset.undo();
      await paint();

      expect(rowIdsNow()).toEqual(['req-1']);
      expect(gantt.selectedEntryIds).toEqual([entryId('d1')]);
      expect(dataset.entries.get('req-1')?.read('showDaysOnRow')).toBe(true);

      gantt.destroy();
      container.remove();
    });

    // Box: "A segmented row's cells roll up over its children, start/end included, on today's code
    // path. rollUp: 'sum' on hours totals the day bars onto the row."
    it("rollUp: 'sum' totals the day bars onto a segmented row's grid cell", () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = crewDataset();
      const gantt = new Gantt({
        container,
        dataset,
        gridColumns: ['name', { field: 'hours' }],
        rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
      });

      const cell = container.querySelector<HTMLElement>(
        '.fg-row[data-entry-id="req-1"] [data-field="hours"]',
      )!;
      // 8 + 4 = 12, read off the segmented row's own grid cell — the Rollup's answer, not a bar's.
      expect(cell.textContent).toBe('12');
      expect(dataset.entries.get('req-1')?.read('hours')).toBe(12);

      gantt.destroy();
      container.remove();
    });

    // Box: "A write to a segmented row's start/end throws DerivedFieldNotWritableError. A row drag
    // moves every bar." A segmented row is an ordinary rolling-up parent to the write door — data/
    // carries no notion of "claimed" at all, so the refusal is proven the same way any rolling-up
    // parent's is (`entry-store.mutation.test.ts`); this pins it against the exact shape a segmented
    // row uses. The drag half needs a bar to grab: `req-1` draws none of its own, so a
    // consumer variant supplies the rail the way `harness/e2e/hierarchy.ts`'s own `summary()` case does
    // — the same shape the "consumer producer... still draws a band" test above already installs.
    it("a write to a segmented row's start/end is refused, and dragging its rail bar moves every child (ADR 0013)", () => {
      expect(() => crewDataset().entries.update('req-1', { start: '2026-01-05' })).toThrow(
        DerivedFieldNotWritableError,
      );

      const container = document.createElement('div');
      document.body.append(container);
      const dataset = crewDataset();
      const gantt = new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
        variants: [
          {
            name: 'rail',
            when: (entry) => entry.hasChildren,
            bars: (entry, variant) => [
              {
                id: barId(entry.id, 99),
                entryId: entry.id,
                variant,
                label: entry.name,
                start: entry.start!,
                end: entry.end!,
              },
            ],
          },
        ],
      });

      const railBar = container.querySelector<HTMLElement>(
        `.fg-bar[data-bar-id="${barId(entryId('req-1'), 99)}"]`,
      )!;
      const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
      timeline.setPointerCapture = vi.fn();
      timeline.releasePointerCapture = vi.fn();
      const original = document.elementFromPoint.bind(document);
      document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? railBar : original(x, y));

      const before = [entryId('d1'), entryId('d2')].map((id) => datesOf(dataset.entries.get(id)!));

      timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
      timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5005, clientY: 5, pointerId: 1 }));
      timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5005, clientY: 5, pointerId: 1 }));

      const after = [entryId('d1'), entryId('d2')].map((id) => datesOf(dataset.entries.get(id)!));
      // Every child moved, and by one shared delta — the same translation ADR 0013 gives any
      // rolling-up parent's drag; nothing about being a segmented row changes the mechanism.
      const deltas = after.map((d, i) => Number(d.start) - Number(before[i]!.start));
      expect(deltas.every((delta) => delta > 0)).toBe(true);
      expect(new Set(deltas).size).toBe(1);

      document.elementFromPoint = original;
      gantt.destroy();
      container.remove();
    });

    // Box: "dataset.entries.update('d1', { parentId: 'req-2' }) moves a bar to another row, keeping
    // its id, its data and its Selection place, in one undo step."
    it("moving a bar to another row's parentId keeps its id, its data and its Selection place (one undo step)", async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = crewDataset();
      dataset.entries.add({ id: 'req-2', name: 'Roofing crew', props: { showDaysOnRow: true } });
      const gantt = new Gantt({
        container,
        dataset,
        gridColumns: ['name', { field: 'hours' }],
        rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
      });
      const paint = (): Promise<unknown> => new Promise((resolve) => requestAnimationFrame(resolve));
      await paint();

      gantt.selectedEntryIds = [entryId('d1')];

      const changes: ChangeSet[] = [];
      dataset.on('change', ({ changeSet }) => {
        changes.push(changeSet);
      });

      dataset.entries.update('d1', { parentId: 'req-2' });
      await paint();

      expect(changes).toHaveLength(1);
      const d1 = dataset.entries.get('d1')!;
      expect(d1.id).toBe(entryId('d1'));
      expect(d1.read('hours')).toBe(8);
      expect(d1.parent()?.id).toBe(entryId('req-2'));
      // The write never touched the Selection: the id it named is still selected under its new row.
      expect(gantt.selectedEntryIds).toEqual([entryId('d1')]);

      const req1Cell = container.querySelector<HTMLElement>(
        '.fg-row[data-entry-id="req-1"] [data-field="hours"]',
      )!;
      const req2Cell = container.querySelector<HTMLElement>(
        '.fg-row[data-entry-id="req-2"] [data-field="hours"]',
      )!;
      // Both row totals moved in the same undo step: req-1 lost d1's 8h, req-2 gained it.
      expect(req1Cell.textContent).toBe('4');
      expect(req2Cell.textContent).toBe('8');

      expect(dataset.canUndo).toBe(true);
      dataset.undo();
      await paint();
      expect(dataset.entries.get('d1')?.parent()?.id).toBe(entryId('req-1'));

      gantt.destroy();
      container.remove();
    });

    // Box: "A test pins that a bar's printed value and its row total are the same at day, week and
    // year zoom." C5 pinned bar labels across zoom (`layout/frame.test.ts`); the row total was not.
    it("a bar's printed value and its row total read the same at day, week and year zoom", () => {
      const container = document.createElement('div');
      document.body.append(container);
      const dataset = crewDataset();
      const gantt = new Gantt({
        container,
        dataset,
        gridColumns: ['name', { field: 'hours' }],
        rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
        barLabels: { field: 'hours' },
      });

      for (const preset of ['day', 'week', 'year'] as const) {
        gantt.preset = preset;
        const d1Bar = container.querySelector<HTMLElement>(
          `.fg-bar[data-bar-id="${barId(entryId('d1'), 0)}"] .fg-bar-label`,
        )!;
        const totalCell = container.querySelector<HTMLElement>(
          '.fg-row[data-entry-id="req-1"] [data-field="hours"]',
        )!;
        expect(d1Bar.textContent).toBe('8');
        expect(totalCell.textContent).toBe('12');
      }

      gantt.destroy();
      container.remove();
    });
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
  it('gantt.selectedEntryIds = [id] is live and loose in, branded out', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.selectedEntryIds = [sampleEntries[0]!.id];
    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('selectedEntries resolves the Selection through the bound dataset, in the order set', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    // #212: `selectedEntries` reads back in the same order `selectedEntryIds` was assigned.
    gantt.selectedEntryIds = [entryId(sampleEntries[1]!.id), entryId(sampleEntries[0]!.id)];
    expect(gantt.selectedEntries).toEqual([
      dataset.entries.get(sampleEntries[1]!.id),
      dataset.entries.get(sampleEntries[0]!.id),
    ]);

    gantt.destroy();
  });

  it('selectedEntries skips ids no longer in the store and re-reads field edits', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id), entryId(sampleEntries[1]!.id)];

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

    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id)];

    expect(before).toEqual([{ from: [], to: [entryId(sampleEntries[0]!.id)] }]);
    expect(after).toEqual([{ from: [], to: [entryId(sampleEntries[0]!.id)] }]);
    expect(datasetChanges).toEqual([]);

    gantt.destroy();
  });

  it('beforeSelectionChange returning false vetoes the change: selection stays put', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id)];

    gantt.on('beforeSelectionChange', () => false);
    gantt.selectedEntryIds = [entryId(sampleEntries[1]!.id)];

    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('a non-empty-click, non-Escape assignment with an identical set is a no-op (no events)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id)];

    const after: unknown[] = [];
    gantt.on('selectionChange', (p) => {
      after.push(p);
    });
    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id)];

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

describe('Gantt entryActivate (#434)', () => {
  /** `detail` is the click count a real browser stamps on its `click` event — 1 for a click on its
   *  own, 2 for the second click of a physical double-click (never on `pointerup`: a real browser
   *  never counts clicks there, only `entry-gestures.ts`'s own `onClick` reads it). `clickBar`
   *  dispatches both, the same order a real browser does — `pointerup` first, so `selectFromHit`
   *  names the activation candidate, then `click` on the bar itself, bubbling to confirm it — and
   *  defaults `detail` to 1 so a lone call reads as an ordinary click. */
  function clickBar(container: HTMLElement, bar: HTMLElement, detail = 1): void {
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));
    document.elementFromPoint = original;
    bar.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  }

  function dblclickBar(bar: HTMLElement): void {
    bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
  }

  it('a plain click activates the bar’s own Entry (cause "click", target "bar")', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    clickBar(container, container.querySelector<HTMLElement>('.fg-bar')!);

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'click', target: 'bar' },
    ]);

    gantt.destroy();
  });

  it('Enter on a focused bar activates it (cause "key")', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    container.querySelector<HTMLElement>('.fg-bar')!.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'key', target: 'bar' },
    ]);

    gantt.destroy();
    container.remove();
  });

  it('default mode (pointerActivation: "click"): a physical double-click activates once, not three times', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    // What a real double-click sends: two `click`-ish pointerups (detail 1, then 2), then the
    // browser's own `dblclick`. Only the first click may activate here — see `dblclickBar` above.
    clickBar(container, bar, 1);
    clickBar(container, bar, 2);
    dblclickBar(bar);

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'click', target: 'bar' },
    ]);

    gantt.destroy();
  });

  it('double-click mode (pointerActivation: "dblclick"): a single click does not activate', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, pointerActivation: 'dblclick' });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    clickBar(container, container.querySelector<HTMLElement>('.fg-bar')!);

    expect(activations).toEqual([]);

    gantt.destroy();
  });

  it('double-click mode (pointerActivation: "dblclick"): a double-click activates exactly once (cause "dblclick")', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, pointerActivation: 'dblclick' });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    clickBar(container, bar, 1);
    clickBar(container, bar, 2);
    dblclickBar(bar);

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'dblclick', target: 'bar' },
    ]);

    gantt.destroy();
  });

  // #434: a writable grid cell's double-click used to assume `canWrite` alone meant "an editor
  // handles it" — with no `inlineEditing()` installed there is no editor, and the double-click did
  // nothing. The fix asks one shared question instead (`#editorTakesFocusedCell`): does
  // `freegantt.editFocusedCell` take this cell? With no `inlineEditing()`, core's own inert
  // placeholder always declines, so this cell falls through to `entryActivate` the same way an
  // unwritable cell already did.
  it('double-click mode, no inlineEditing() installed: a writable grid cell still activates (#434 F4)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, pointerActivation: 'dblclick' });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    const cell = container.querySelector<HTMLElement>('.fg-row-label[data-field="name"]')!;
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'dblclick', target: 'gridCell' },
    ]);

    gantt.destroy();
  });

  it('Enter still activates in double-click mode (cause "key")', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, pointerActivation: 'dblclick' });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    container.querySelector<HTMLElement>('.fg-bar')!.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'key', target: 'bar' },
    ]);

    gantt.destroy();
    container.remove();
  });

  it('I14: { select: false, activate: true } still activates on a plain click that selects nothing', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { select: false, activate: true } });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    clickBar(container, container.querySelector<HTMLElement>('.fg-bar')!);

    expect(gantt.selectedEntryIds).toEqual([]);
    expect(activations).toEqual([
      { entry: dataset.entries.get(sampleEntries[0]!.id), cause: 'click', target: 'bar' },
    ]);

    gantt.destroy();
  });

  it('{ activate: false } refuses a click, leaving the default select untouched', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { activate: false } });
    const activations: unknown[] = [];
    gantt.on('entryActivate', (p) => {
      activations.push(p);
    });

    clickBar(container, container.querySelector<HTMLElement>('.fg-bar')!);

    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);
    expect(activations).toEqual([]);

    gantt.destroy();
  });
});

/** One plain Entry and one that draws two bars — the smallest dataset that tells "the Segment the
 *  pointer named" from "every Segment the row owns". Module-scoped: the Delete-key describe block
 *  below shares this fixture with the Segment-selection tests, rather than re-declaring it. */
/** One plain Entry, and one parent Entry segmented by its own two children — the smallest dataset
 *  that tells "the bar the pointer named" from "every bar the segmented row owns" (ADR 0010, ADR
 *  0025, #421). Module-scoped: the Delete-key describe block below shares this fixture with the
 *  selection tests, rather than re-declaring it. */
const SEGMENTED_ENTRIES = [
  { id: 'plain', name: 'Plain', start: '2026-09-01', end: '2026-09-03' },
  { id: 'split', name: 'Split' },
  { id: 'split-a', name: 'Split A', parentId: 'split', start: '2026-09-01', end: '2026-09-03' },
  { id: 'split-b', name: 'Split B', parentId: 'split', start: '2026-09-05', end: '2026-09-09' },
];

function makeSegmentedGantt(): { container: HTMLElement; gantt: Gantt; dataset: Dataset } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: SEGMENTED_ENTRIES, timeZone: 'UTC' });
  return {
    container,
    gantt: new Gantt({
      container,
      dataset,
      rowSource: { source: 'entries', childrenAsSegments: true },
    }),
    dataset,
  };
}

describe('Gantt selection over a segmented row’s bars (ADR 0010, ADR 0025, #421)', () => {
  /** Points `elementFromPoint` at one node, the way every other pointer test in this file does. */
  function clickTimelineOn(container: HTMLElement, node: HTMLElement): void {
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? node : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));
    document.elementFromPoint = original;
  }

  it('a timeline click selects the bar’s own child Entry', () => {
    const { container, gantt } = makeSegmentedGantt();
    const second = container.querySelector<HTMLElement>('.fg-bar[data-bar-id="split-b:0"]')!;

    clickTimelineOn(container, second);

    expect(gantt.selectedEntryIds).toEqual([entryId('split-b')]);
    const first = container.querySelector<HTMLElement>('.fg-bar[data-bar-id="split-a:0"]')!;
    expect(second.dataset['state']).toBe('selected');
    expect(first.dataset['state'] ?? '').toBe('');

    gantt.destroy();
    container.remove();
  });

  it('a grid-pane click selects every child Entry the segmented row owns', () => {
    const { container, gantt } = makeSegmentedGantt();
    const row = container.querySelector<HTMLElement>('.fg-row[data-entry-id="split"]')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));

    row.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, bubbles: true }));
    document.elementFromPoint = original;

    expect(gantt.selectedEntryIds).toContain(entryId('split-a'));
    expect(gantt.selectedEntryIds).toContain(entryId('split-b'));

    gantt.destroy();
    container.remove();
  });

  it('ctrl-click collects children across two rows', () => {
    const { container, gantt } = makeSegmentedGantt();
    const plain = container.querySelector<HTMLElement>('.fg-bar[data-bar-id="plain:0"]')!;

    clickTimelineOn(container, container.querySelector<HTMLElement>('.fg-bar[data-bar-id="split-a:0"]')!);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? plain : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, ctrlKey: true }));
    document.elementFromPoint = original;

    expect(gantt.selectedEntryIds).toContain(entryId('plain'));
    expect(gantt.selectedEntryIds).toContain(entryId('split-a'));

    gantt.destroy();
    container.remove();
  });

  /** Shift-ranges from the `plain` row to the child bar named `childId`, and reports what ends up
   *  selected. */
  function shiftRangeFromPlainTo(container: HTMLElement, childId: string): void {
    const plainBar = container.querySelector<HTMLElement>('.fg-bar[data-bar-id="plain:0"]')!;
    clickTimelineOn(container, plainBar);
    const original = document.elementFromPoint.bind(document);
    const target = container.querySelector<HTMLElement>(`.fg-bar[data-bar-id="${childId}:0"]`)!;
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? target : original(x, y));
    container
      .querySelector<HTMLElement>('.fg-timeline-pane')!
      .dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5, shiftKey: true }));
    document.elementFromPoint = original;
  }

  it('a shift-range ends on the child bar it landed on, not the end of that row', () => {
    const { container, gantt } = makeSegmentedGantt();

    shiftRangeFromPlainTo(container, 'split-a');

    // The Selection holds Entry ids, so the range steps over the segmented row's own children.
    // `split-b` draws after `split-a` on the same row, so the range stops before it.
    expect(gantt.selectedEntryIds).toContain(entryId('plain'));
    expect(gantt.selectedEntryIds).toContain(entryId('split-a'));
    expect(gantt.selectedEntryIds).not.toContain(entryId('split-b'));

    gantt.destroy();
    container.remove();
  });

  it('a shift-range that reaches the last child bar of a row takes the whole row', () => {
    const { container, gantt } = makeSegmentedGantt();

    shiftRangeFromPlainTo(container, 'split-b');

    expect(gantt.selectedEntryIds).toContain(entryId('plain'));
    expect(gantt.selectedEntryIds).toContain(entryId('split-a'));
    expect(gantt.selectedEntryIds).toContain(entryId('split-b'));

    gantt.destroy();
    container.remove();
  });

  it('Mod+Arrow steps the Selection between the bars of one segmented row', () => {
    const { container, gantt } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('split-a')];

    const step = (key: string): void => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
    };

    step('ArrowRight');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-b')]);

    // The row has no third child bar, so the chord clamps rather than leaving the row.
    step('ArrowRight');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-b')]);

    step('ArrowLeft');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-a')]);

    gantt.destroy();
    container.remove();
  });

  it('a Mod+Arrow step never also nudges the entry it reselected', () => {
    const { container, gantt } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('split-a')];
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

  // #230: the Mod+Arrow test above drives the chord, not the two commands it binds, and it never
  // presses the low-end clamp or a one-child row. This pins both commands directly, both clamps.
  it('freegantt.selectNextEntry/selectPreviousEntry step within a row and clamp at both ends', () => {
    const { container, gantt } = makeSegmentedGantt();
    // The segmented row's own list is [split, split-a, split-b] (the segmented parent, then its
    // children in draw order) — `split` is the row's first steppable entry.
    gantt.selectedEntryIds = [entryId('split')];

    // Already at the row's first entry: stepping back clamps rather than leaving the row.
    gantt.commands.run('freegantt.selectPreviousEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('split')]);

    gantt.commands.run('freegantt.selectNextEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-a')]);

    gantt.commands.run('freegantt.selectNextEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-b')]);

    // Already at the row's last entry: stepping forward clamps too.
    gantt.commands.run('freegantt.selectNextEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-b')]);

    gantt.commands.run('freegantt.selectPreviousEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('split-a')]);

    // A row that draws one bar (the 'plain' entry) has nowhere to step, either direction.
    gantt.selectedEntryIds = [entryId('plain')];
    gantt.commands.run('freegantt.selectNextEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('plain')]);
    gantt.commands.run('freegantt.selectPreviousEntry');
    expect(gantt.selectedEntryIds).toEqual([entryId('plain')]);

    gantt.destroy();
    container.remove();
  });
});

describe('Gantt Delete key (ADR 0010, #212)', () => {
  const pressDelete = (container: HTMLElement): void => {
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  };

  it("Delete un-dates the selected child Entry's bar, and its sibling stays drawn", () => {
    // ADR 0012's two intents, carried through the Segment retirement: a Delete on a *bar* clears
    // the span it draws and leaves the record; a Delete on a grid row or cell removes the record.
    // A segment bar takes the first door, exactly as a Segment delete used to drop one drawn
    // stretch and leave the Entry.
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('split-a')];

    pressDelete(container);

    const cleared = dataset.entries.get('split-a');
    expect(cleared).toBeDefined();
    expect(cleared?.start).toBeUndefined();
    expect(cleared?.end).toBeUndefined();
    expect(dataset.entries.get('split-b')?.start).toBeDefined();

    gantt.destroy();
    container.remove();
  });

  it("deleting a plain Entry's bar keeps the row dateless, and one undo restores it (ADR 0012)", () => {
    // "`removeSegments` of the last Segment keeps the Entry and clears start and end" — ADR 0012.
    // A plain Entry draws one bar, so this is that case with no Segment left in it: the row stays,
    // dateless, and the whole clear undoes in one press.
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('plain')];

    pressDelete(container);

    const cleared = dataset.entries.get('plain');
    expect(cleared).toBeDefined();
    expect(cleared?.start).toBeUndefined();
    expect(cleared?.end).toBeUndefined();

    dataset.undo();

    const restored = dataset.entries.get('plain');
    expect(restored).toBeDefined();
    expect(restored?.start).toBeDefined();
    expect(restored?.end).toBeDefined();

    gantt.destroy();
    container.remove();
  });

  it('the Delete key and gantt.commands.run() invoke the one registered command (D-S5-14)', () => {
    // The context menu's own item click also reaches `command.run(ctx)` with no second `run` of its
    // own (`extensions/features/context-menu.ts`) — this pins that the chord and a direct
    // `commands.run(id)` call, the menu's own mechanism, land on that same registered command and
    // produce the identical mutation, not two implementations that could drift apart.
    const viaKey = makeSegmentedGantt();
    viaKey.gantt.selectedEntryIds = [entryId('split-a')];
    pressDelete(viaKey.container);
    const afterKey = viaKey.dataset.entries.get('split-a');

    const viaCommand = makeSegmentedGantt();
    viaCommand.gantt.selectedEntryIds = [entryId('split-a')];
    viaCommand.gantt.commands.run('freegantt.deleteSelection');
    const afterCommand = viaCommand.dataset.entries.get('split-a');

    expect(afterKey).toEqual(afterCommand);

    viaKey.gantt.destroy();
    viaKey.container.remove();
    viaCommand.gantt.destroy();
    viaCommand.container.remove();
  });

  it('Delete does nothing while the keydown target is editable (issue #137 F7)', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('split-a')];

    const input = document.createElement('input');
    container.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(dataset.entries.get('split-a')).toBeDefined();

    gantt.destroy();
    container.remove();
  });

  it('nothing selected: Delete has no target and removes nothing', () => {
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedEntryIds = [];

    pressDelete(container);

    expect(dataset.entries.get('split-a')).toBeDefined();
    expect(dataset.entries.get('split-b')).toBeDefined();
    expect(dataset.entries.get('plain')).toBeDefined();

    gantt.destroy();
    container.remove();
  });

  it('a beforeChange refusal is a no-op: no error escapes, and the Entry survives', () => {
    // A cancel is a normal outcome, not a fault (`api/attemptMutation`'s own rule). `view/` cannot
    // import `api/`, so `freegantt.deleteSelection` repeats that one swallow inline — this pins it.
    const { container, gantt, dataset } = makeSegmentedGantt();
    gantt.selectedEntryIds = [entryId('split-a')];
    dataset.on('beforeChange', () => false);

    expect(() => pressDelete(container)).not.toThrow();
    expect(dataset.entries.get('split-a')).toBeDefined();

    gantt.destroy();
    container.remove();
  });
});
describe('Gantt capabilities / capability hot path (S3.2, D-S3-9, [S3-A3]/[S3-A5])', () => {
  it('a resize-incapable entry renders no handle on hover ([S3-A5])', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { resize: false } });

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

  it('gantt.selectedEntryIds still accepts a select-incapable Entry — the setter does not consult can("select") (D-S3-9)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { select: false } });

    gantt.selectedEntryIds = [entryId(sampleEntries[0]!.id)];
    expect(gantt.selectedEntryIds).toEqual([entryId(sampleEntries[0]!.id)]);

    gantt.destroy();
  });

  it('a select-incapable bar refuses a pointer click', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { select: false } });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(gantt.selectedEntryIds).toEqual([]);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('reassigning capabilities re-resolves the affordance ids without a new pointer move', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5 }));
    expect(bar.hasAttribute('data-movable')).toBe(true);

    gantt.capabilities = { move: false };
    expect(bar.hasAttribute('data-movable')).toBe(false);

    document.elementFromPoint = original;
    gantt.destroy();
  });

  // #195: `gantt.capabilities = { resize: false }` is the whole config, so a page that
  // flips one gesture with it drops every other rule it holds. These six cover the two verbs that
  // write one gesture instead.
  it('setCapabilityRule writes one gesture and leaves every other rule standing (#195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, capabilities: { move: false, select: false } });

    gantt.setCapabilityRule('resize', false);

    expect(gantt.capabilities).toEqual({ move: false, select: false, resize: false });

    gantt.destroy();
  });

  it('setCapabilityRule never mutates the object the consumer assigned (#187, #195)', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const assigned = { move: false };
    const gantt = new Gantt({ container, dataset, capabilities: assigned });

    gantt.setCapabilityRule('resize', false);

    expect(assigned).toEqual({ move: false });
    expect(gantt.capabilities).not.toBe(assigned);

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
      variants: [{ name: 'milestone', when: (entry) => entry.id === 'm1', capabilities: { resize: false } }],
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
    expect(gantt.capabilities).toEqual({});

    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('capabilities.resize offers the gesture and still cannot write a derived date (#256)', () => {
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
    const gantt = new Gantt({ container, dataset, capabilities: { resize: true } });

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
    const gantt = new Gantt({ container, dataset, capabilities: { move: false, resize: false } });

    gantt.clearCapabilityRule('resize');
    expect(gantt.capabilities).toEqual({ move: false });

    const before = gantt.capabilities;
    gantt.clearCapabilityRule('select');
    expect(gantt.capabilities).toBe(before);

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

  it("an 'api' start cannot be dragged, even when capabilities.edit answers true", () => {
    const container = document.createElement('div');
    const dataset = new Dataset({
      entries: sampleEntries,
      timeZone: 'UTC',
      fields: [{ key: 'start', editable: 'api' }],
    });
    const gantt = new Gantt({ container, dataset, capabilities: { edit: () => true } });

    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    stubPointerCapture(timeline);
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);

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

    dataset.entries.update(id, { start: before.start });
    expect(dataset.entries.get(id)!.start).toBe(before.start);

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
    // Hover the bar first: resizableEntryId only resolves once something is hovered or
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
    // plugin owns that pair of registrations for the ids it matches
    // (`harness/plugins/milestone-kind.ts` is the real one; this inlines the smallest version of it).
    const gantt = new Gantt({
      container,
      dataset,
      variants: [{ name: 'milestone', when: (entry) => entry.id === 'm1', capabilities: { resize: false } }],
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
    // S5.11: `attachKeyboardEditing` scopes to the timeline pane now, not the whole
    // container — a bar's nudge is that pane's own job.
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;

    const id = entryId(sampleEntries[0]!.id);
    const before = datesOf(dataset.entries.get(id)!);
    gantt.selectedEntryIds = [id];

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
    gantt.selectedEntryIds = [id];

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
    // S5.11: `view/roving-focus.ts` owns row-to-row movement now — a grid-pane arrow key,
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
    gantt.snap = { unit: 'day', increment: 1 };

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
    // Held paint is the snapped commit draft, not the last unsnapped pointer preview.
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
    scroll: ScrollAxis;
    scale: TimeScaleModel;
    timeline: HTMLElement;
  } {
    const container = document.createElement('div');
    const scroll = new ScrollAxis();
    const scale = new TimeScaleModel({ fit: 'preset', preset: 'day' });
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, scale, scroll: { x: scroll } });
    FakeResizeObserver.instances.at(-1)!.fire({ width: 300, height: 100 });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0 }) as DOMRect;
    return { container, gantt, dataset, scroll, scale, timeline };
  }

  it('[S3-A7] ctrl+wheel zooms, anchored; shift+wheel pans; Mod+Home/End pan; dataset.on("change") never fires', () => {
    // S5.11: bare `PageDown`/`Home`/`End` moved off the timeline this slice — the grid
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
      expect(a.scroll.state.position).not.toBe(b.scroll.state.position);

      const xBeforePan = a.scroll.state.position;
      a.timeline.dispatchEvent(wheel({ shiftKey: true, deltaY: 80 }));
      expect(a.scroll.state.position).toBe(xBeforePan + 80);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position).toBe(0);

      a.container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(a.scroll.state.position).toBe(a.scroll.state.max);

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
      const scroll = new ScrollAxis();
      const scale = new TimeScaleModel({ fit: 'preset', preset: 'day' });
      const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
      const gantt = new Gantt({
        container,
        dataset,
        scale,
        scroll: { x: scroll },
        viewportGestures: false,
      });
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
      const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
      timeline.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0 }) as DOMRect;

      const pxBefore = scale.scale.pxPerMs;
      const presetBefore = gantt.preset.id;
      const xBefore = scroll.state.position;
      timeline.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 0 }));
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      expect(gantt.preset.id).toBe(presetBefore);
      expect(scale.scale.pxPerMs).toBe(pxBefore);
      expect(scroll.state.position).toBe(xBefore);

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
    const scroll = new ScrollAxis();
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      scroll: { y: scroll },
      rowSource: { source: 'entries', tree: true },
    });
    FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
    scroll.panTo(80);
    const yBefore = scroll.state.position;
    const bar = container.querySelector<HTMLElement>('.fg-bar')!;
    const barId = bar.dataset['barId'];

    gantt.rowSource = { source: 'group', groupBy: (entry: Entry) => entry.name };
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(container.querySelector(`[data-bar-id="${barId}"]`)).toBe(bar);
    expect(scroll.state.position).toBe(yBefore);

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

  it('a custom source’s resolve() is cached — reassigning rowSource is the refresh path (docs)', async () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    let label = 'first';
    const gantt = new Gantt({
      container,
      dataset,
      rowSource: {
        source: 'custom',
        resolve: ({ entries }: { entries: readonly Entry[] }) => [
          { id: 'h', label },
          { id: 'r0', entryIds: [entries[0]!.id] },
        ],
      },
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('[data-row-id="h"]')?.textContent).toContain('first');

    // resolve() closes over `label`, which is page state — changing it alone changes nothing,
    // because resolve() runs again only when `rowSource` itself is a new object.
    label = 'second';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('[data-row-id="h"]')?.textContent).toContain('first');

    // The documented refresh path: reassign `gantt.rowSource` (docs/07-row-source-updates.md).
    gantt.rowSource = { ...gantt.rowSource };
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(container.querySelector('[data-row-id="h"]')?.textContent).toContain('second');

    gantt.destroy();
  });

  it('filterRows replaces filter and keeps the current sort (#495 follow-up)', () => {
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', sort: { field: 'name' } },
    });

    gantt.filterRows((entry: Entry) => entry.id === sampleEntries[0]!.id);

    expect(gantt.rowSource).toMatchObject({ source: 'entries', sort: { field: 'name' } });
    expect(typeof (gantt.rowSource as { filter?: unknown }).filter).toBe('function');

    gantt.filterRows(undefined);
    expect((gantt.rowSource as { filter?: unknown }).filter).toBeUndefined();
    expect(gantt.rowSource).toMatchObject({ sort: { field: 'name' } });

    gantt.destroy();
  });

  it('sortRows replaces sort and keeps the current filter (#495 follow-up)', () => {
    const dataset = new Dataset({ entries: sampleEntries, timeZone: 'UTC' });
    const filter = (entry: Entry) => entry.id === sampleEntries[0]!.id;
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', filter },
    });

    gantt.sortRows({ field: 'name' });

    expect(gantt.rowSource).toMatchObject({ source: 'entries', sort: { field: 'name' }, filter });

    gantt.sortRows(undefined);
    expect((gantt.rowSource as { sort?: unknown }).sort).toBeUndefined();
    expect(gantt.rowSource).toMatchObject({ filter });

    gantt.destroy();
  });

  it('filterRows and sortRows throw CustomRowSourceNotFilterableOrSortableError on a custom source (#495 follow-up)', () => {
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: {
        source: 'custom',
        resolve: ({ entries }: { entries: readonly Entry[] }) =>
          entries.map((entry) => ({ id: String(entry.id), entryIds: [entry.id] })),
      },
    });

    expect(() => gantt.filterRows(undefined)).toThrow(CustomRowSourceNotFilterableOrSortableError);
    expect(() => gantt.sortRows(undefined)).toThrow(CustomRowSourceNotFilterableOrSortableError);

    gantt.destroy();
  });
});

describe('Gantt scroll re-clamp when the row count shrinks', () => {
  it('never resets to 0, and a caller re-clamp brings it back inside bounds (D-S1.5-2)', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const container = document.createElement('div');
    const scroll = new ScrollAxis();
    const dataset = new Dataset({ timeZone: 'UTC', entries: sampleEntries });
    const gantt = new Gantt({ container, dataset, scroll: { y: scroll } });
    FakeResizeObserver.instances[0]!.fire({ width: 300, height: 100 });
    scroll.panTo(scroll.state.max);
    const yBefore = scroll.state.position;
    expect(yBefore).toBeGreaterThan(0);

    for (const entry of sampleEntries.slice(0, sampleEntries.length - 3)) {
      dataset.entries.remove(entry.id);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // A shrink never rewrites `position` by itself — it stays exactly where the
    // caller last asked, even past the new, smaller `max`, until something re-clamps it.
    expect(scroll.state.position).toBe(yBefore);
    expect(scroll.state.position).not.toBe(0);

    scroll.panTo(scroll.state.position);
    expect(scroll.state.position).toBeGreaterThan(0);
    expect(scroll.state.position).toBeLessThanOrEqual(scroll.state.max);

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

  // #195: adding one plugin at runtime used to mean restating the installed set —
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
    gantt.selectedEntryIds = [a!.id, b!.id];

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
    // S5.11: `Mod+A` replaces the old exemplar `ArrowRight` here — plain `ArrowRight` is
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

    expect(() => capturedCtx!.variants.add({ name: 'buffer', capabilities: { resize: false } })).toThrow(
      RegistrationClosedError,
    );
    expect(() => capturedCtx!.view.registerGridColumn({ field: 'name' })).toThrow(RegistrationClosedError);

    gantt.destroy();
  });
});

describe('Gantt.convenienceChords (#262)', () => {
  function keydown(key: string, extra: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  }

  it('false leaves every convenience chord inert; the command still runs through commands.run', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, convenienceChords: false });

    dataset.entries.update(sampleEntries[0]!.id, { name: 'renamed' });
    expect(dataset.canUndo).toBe(true);
    const notFired = container.dispatchEvent(keydown('z', { ctrlKey: true }));
    expect(notFired).toBe(true); // unmatched: nothing preventedDefault
    expect(dataset.canUndo).toBe(true); // the chord did not run undo

    // The command itself still answers — the app's own UI (a toolbar button) still works.
    gantt.commands.run('freegantt.undo');
    expect(dataset.canUndo).toBe(false);

    gantt.destroy();
  });

  it('a per-command map turns undo off while redo still fires on its own chord', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset, convenienceChords: { 'freegantt.undo': false } });

    dataset.entries.update(sampleEntries[0]!.id, { name: 'renamed' });
    container.dispatchEvent(keydown('z', { ctrlKey: true }));
    expect(dataset.canUndo).toBe(true); // Mod+Z stayed silent

    container.dispatchEvent(keydown('z', { ctrlKey: true, shiftKey: true }));
    // Nothing to redo yet (undo never ran), so this is a true no-op — canRedo stays false, which is
    // itself proof Mod+Shift+Z still reached the command (an inert chord would have thrown nothing
    // either way, so the next assertion is the one that actually distinguishes the two).
    expect(dataset.canRedo).toBe(false);

    gantt.commands.run('freegantt.undo');
    expect(dataset.canUndo).toBe(false);
    expect(dataset.canRedo).toBe(true);
    container.dispatchEvent(keydown('z', { ctrlKey: true, shiftKey: true }));
    expect(dataset.canRedo).toBe(false); // Mod+Shift+Z (redo) ran

    gantt.destroy();
  });

  it('an obligation chord still fires with every convenience chord off', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({
      container,
      dataset,
      convenienceChords: false,
      selectedEntryIds: [sampleEntries[0]!.id],
    });

    // Escape (`freegantt.clearSelection`) is an obligation chord — [S5-A4]/WCAG 2.1.1 — so
    // `convenienceChords: false` does not touch it.
    expect(gantt.selectedEntryIds).toEqual([sampleEntries[0]!.id]);
    container.dispatchEvent(keydown('Escape'));
    expect(gantt.selectedEntryIds).toEqual([]);

    // Mod+A (`selectAll`) is a convenience chord, and stays silent under the same config.
    container.dispatchEvent(keydown('a', { ctrlKey: true }));
    expect(gantt.selectedEntryIds).toEqual([]);

    gantt.destroy();
  });

  it('pins convenienceCommandIds against the shell: every id in the list stays silent under convenienceChords: false, and an obligation chord (Escape) still fires', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });

    // Mirrors the chord `view/gantt-shell.ts`'s `#registerCoreCommands` binds each id to — the
    // pairing this test exists to pin. `freegantt.clearSelection` is the control: it is not a
    // convenience id, and its own chord must fire no matter what `convenienceChords` says.
    const CHORD_OF: Record<
      (typeof convenienceCommandIds)[number] | 'freegantt.clearSelection',
      KeyboardEventInit
    > = {
      'freegantt.undo': { key: 'z', ctrlKey: true },
      'freegantt.redo': { key: 'z', ctrlKey: true, shiftKey: true },
      'freegantt.selectAll': { key: 'a', ctrlKey: true },
      'freegantt.deleteSelection': { key: 'Delete' },
      'freegantt.zoomIn': { key: '=', ctrlKey: true },
      'freegantt.zoomOut': { key: '-', ctrlKey: true },
      'freegantt.panToToday': { key: '0', ctrlKey: true },
      'freegantt.panRight': { key: 'ArrowRight', altKey: true },
      'freegantt.panLeft': { key: 'ArrowLeft', altKey: true },
      'freegantt.panToStart': { key: 'Home', ctrlKey: true },
      'freegantt.panToEnd': { key: 'End', ctrlKey: true },
      'freegantt.clearSelection': { key: 'Escape' },
    };
    const watchedIds = [...convenienceCommandIds, 'freegantt.clearSelection'] as const;

    const runCounts: Partial<Record<(typeof watchedIds)[number], number>> = {};
    const spy: ChromePlugin = {
      id: 'test.convenience-chord-spy',
      view(ctx) {
        for (const id of watchedIds) {
          runCounts[id] = 0;
          ctx.commands.register({ id, label: id, run: () => (runCounts[id] = (runCounts[id] ?? 0) + 1) });
        }
        return () => {};
      },
    };
    const gantt = new Gantt({ container, dataset, convenienceChords: false, plugins: [spy] });

    for (const id of convenienceCommandIds) {
      container.dispatchEvent(keydown(CHORD_OF[id].key!, CHORD_OF[id]));
    }
    for (const id of convenienceCommandIds) expect(runCounts[id]).toBe(0);

    container.dispatchEvent(
      keydown(CHORD_OF['freegantt.clearSelection'].key!, CHORD_OF['freegantt.clearSelection']),
    );
    expect(runCounts['freegantt.clearSelection']).toBe(1);

    gantt.destroy();
  });

  it('is live: the next keystroke reads a reassigned convenienceChords, no remount', () => {
    const container = document.createElement('div');
    const dataset = new Dataset({ entries: sampleEntries.slice(0, 2), timeZone: 'UTC' });
    const gantt = new Gantt({ container, dataset });

    gantt.convenienceChords = false;
    container.dispatchEvent(keydown('a', { ctrlKey: true }));
    expect(gantt.selectedEntryIds).toEqual([]);

    gantt.convenienceChords = {};
    container.dispatchEvent(keydown('a', { ctrlKey: true }));
    expect(gantt.selectedEntryIds).toEqual(sampleEntries.slice(0, 2).map((entry) => entry.id));

    gantt.destroy();
  });
});

describe('Gantt.interaction.registerKeyHandler out-of-container dismissal (issue #137 F1)', () => {
  it('a chord registered through ctx.interaction.registerKeyHandler still fires for a key event whose target sits outside the container', () => {
    // A popup opened from a trigger that lives outside the Gantt's own container (a toolbar button
    // in the consumer's own page, say) has no path through the container's own bubble-phase listener — this is
    // exactly the second regression the QC review found: the old document-wide capture listener
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
      id: 'demo.gridCellRenderer',
      view(ctx: PluginContext) {
        ctx.view.registerRenderer('gridCell', () => ({ text: 'from the plugin' }));
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

    // While the plugin is installed, its override wins — core's own select-all never runs.
    gantt.commands.run('freegantt.selectAll');
    expect(hijacked).toBe(1);
    expect(gantt.selectedEntryIds).toEqual([]);

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
      // consumer's, and the plugin leaving must not take it away.
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

  // #189: the plugin owns its own column's geometry, the way the consumer owns theirs. The
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
        // payload truthfully reports no change to the consumer's columns, so the plugin
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
    // Nothing the consumer saves carries it — the rule working, not a regression.
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
// hook, so every drag re-reads whatever occupies that hook. This suite proves the arrow
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
   *  onto — `data/edit-extension.test.ts` is where composition order is asserted. */
  function extenderPlugin(cascade: EditExtender): DataPlugin {
    return {
      id: 'test.extender',
      data(ctx) {
        ctx.edits.setExtender(() => cascade);
      },
    };
  }

  /** Moves `x` — never grabbed — whenever a move on `a` is proposed. Absolute instants, so no
   *  arithmetic on an `Instant` happens outside `time/` (I10).
   *
   *  The target stays inside the Dataset's own range on purpose (#436). A cascade
   *  that lands past `range.end` paints no bar at all, so there is no ghost geometry to assert —
   *  `previewOffsets` reports no offset for a side `barSpan` dropped, rather than forming a delta
   *  from the dropped sentinel and teleporting the node to `x ≈ 0`, collapsed, mid-drag. */
  const cascadeOntoX: EditExtender = ({ proposed }) => {
    const moved = proposed.get(entryId('a'));
    if (!moved || moved.start === undefined) return new Map();
    return new Map([
      [entryId('x'), { start: instant('2026-09-03T00:00:00Z'), end: instant('2026-09-04T00:00:00Z') }],
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

    const barA = container.querySelector<HTMLElement>('[data-bar-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-bar-id="x:0"]')!;
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    timeline.setPointerCapture = vi.fn();
    timeline.releasePointerCapture = vi.fn();
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? barA : original(x, y));

    timeline.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1 }));
    timeline.dispatchEvent(new PointerEvent('pointermove', { clientX: 55, clientY: 5, pointerId: 1 }));
    // The preview coalesces on the pipeline's own rAF, not synchronously per pointermove.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(barA.dataset['state']).toContain('dragging');
    expect(barX.dataset['state'] ?? '').toContain('ghost');

    timeline.dispatchEvent(new PointerEvent('pointerup', { clientX: 55, clientY: 5, pointerId: 1 }));
    document.elementFromPoint = original;
    gantt.destroy();
  });

  it('ghosts nothing while the hook stands empty, so the assertion above reads the occupant and not a default', async () => {
    const { gantt, container } = buildGantt();

    const barA = container.querySelector<HTMLElement>('[data-bar-id="a:0"]')!;
    const barX = container.querySelector<HTMLElement>('[data-bar-id="x:0"]')!;
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

describe('the Selection follows the Dataset when a segmented row’s child goes away (#212, ADR 0010, ADR 0025, #421)', () => {
  function ganttOverTwoChildren(): { gantt: Gantt; dataset: Dataset } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'e1', name: 'Framing' },
        { id: 's1', parentId: 'e1', name: 'Framing 1', start: '2026-01-01', end: '2026-01-03' },
        { id: 's2', parentId: 'e1', name: 'Framing 2', start: '2026-01-05', end: '2026-01-07' },
      ],
    });
    return {
      gantt: new Gantt({
        container,
        dataset,
        rowSource: { source: 'entries', childrenAsSegments: true },
      }),
      dataset,
    };
  }

  it('drops a selected child Entry the Dataset removed, and keeps the rest', () => {
    const { gantt, dataset } = ganttOverTwoChildren();
    gantt.selectedEntryIds = [entryId('s1'), entryId('s2')];
    dataset.entries.remove('s1');
    expect(gantt.selectedEntryIds).toEqual([entryId('s2')]);
    gantt.destroy();
  });

  it('reports the drop as one selectionChange, with no cancelable before pair', () => {
    const { gantt, dataset } = ganttOverTwoChildren();
    gantt.selectedEntryIds = [entryId('s1'), entryId('s2')];
    const changes: { from: readonly string[]; to: readonly string[] }[] = [];
    const vetoes = vi.fn((): false => false);
    gantt.on('selectionChange', (e) => {
      changes.push({ from: [...e.from], to: [...e.to] });
    });
    gantt.on('beforeSelectionChange', vetoes);
    dataset.entries.remove('s1');
    expect(changes).toEqual([{ from: ['s1', 's2'], to: ['s2'] }]);
    // A veto cannot bring back a child Entry the Dataset no longer holds, so it is never asked.
    expect(vetoes).not.toHaveBeenCalled();
    expect(gantt.selectedEntryIds).toEqual([entryId('s2')]);
    gantt.destroy();
  });

  it('never hands a dead EntryId to a mutation, so a second Delete is a no-op', () => {
    const { gantt, dataset } = ganttOverTwoChildren();
    gantt.selectedEntryIds = [entryId('s1')];
    // A bar Delete un-dates (ADR 0012), so the id it acts on never dies. The grid-row door does
    // remove the record, and that is the case this pins: the Selection has to let the id go rather
    // than hand a dead one to the next command.
    dataset.entries.remove('s1');
    expect(dataset.entries.get('s1')).toBeUndefined();
    expect(gantt.selectedEntryIds).toEqual([]);
    // Before #212 closed this, the Selection still held the removed id and this second run threw
    // out of a keystroke.
    expect(() => gantt.commands.run('freegantt.deleteSelection')).not.toThrow();
    gantt.destroy();
  });

  it('drops the children of a parent Entry the Dataset removed outright', () => {
    const { gantt, dataset } = ganttOverTwoChildren();
    gantt.selectedEntryIds = [entryId('s1'), entryId('s2')];
    dataset.entries.remove('e1');
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

  it('collapseStateOf answers each state, a hidden descendant, a stale id, and a grouping header', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
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
          id: 'leaf',
          name: 'leaf',
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

    // Leaf: cannot expand.
    expect(gantt.collapseStateOf('leaf')).toBe('leaf');

    // Expandable, not collapsed.
    expect(gantt.collapseStateOf('p')).toBe('expanded');

    // Expandable, collapsed — and the child it now hides still answers from the row tree, not the
    // frame (#424).
    gantt.collapse('p');
    expect(gantt.collapseStateOf('p')).toBe('collapsed');
    expect(gantt.collapseStateOf('c')).toBe('leaf');

    // No such row: a removed entry's id, answered right after the write, with no frame painted in
    // between (#424).
    dataset.entries.remove('leaf');
    expect(gantt.collapseStateOf('leaf')).toBeUndefined();

    // A stale id that never named a row.
    expect(gantt.collapseStateOf('never-existed')).toBeUndefined();

    // A grouping header row answers by the same rule as any other row, at once.
    gantt.rowSource = { source: 'group', groupBy: (item: Entry) => item.read('category') as string };
    expect(gantt.collapseStateOf('group:group')).toBe('expanded');
    gantt.collapse('group:group');
    expect(gantt.collapseStateOf('group:group')).toBe('collapsed');

    gantt.destroy();
  });

  it('collapseStateOf answers a synchronous add and reparent, with no frame painted in between (#424)', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        { id: 'leaf', name: 'leaf', start: '2026-01-01', end: '2026-01-02' },
        { id: 'other', name: 'other', start: '2026-01-03', end: '2026-01-04' },
      ],
    });
    const gantt = new Gantt({
      container: document.createElement('div'),
      dataset,
      rowSource: { source: 'entries', tree: true },
    });

    // Leaf, before it gets a child.
    expect(gantt.collapseStateOf('leaf')).toBe('leaf');

    // Adding a child under a leaf turns its parent expandable — and expanded — at once.
    dataset.entries.add({
      id: 'child',
      name: 'child',
      start: '2026-01-05',
      end: '2026-01-06',
      parentId: 'leaf',
    });
    expect(gantt.collapseStateOf('leaf')).toBe('expanded');

    // Reparenting the child under `other` turns `leaf` back into a plain leaf, and `other`
    // expandable, at once.
    dataset.entries.update('child', { parentId: 'other' });
    expect(gantt.collapseStateOf('leaf')).toBe('leaf');
    expect(gantt.collapseStateOf('other')).toBe('expanded');

    gantt.destroy();
  });

  it('reveal lands on a row two writes added, right after a collapseStateOf read of it, with no frame painted in between (#424 review item 1)', () => {
    // #424 review item 1: `collapseStateOf` calls `FrameLayout.ensureRowPlan`, which used to update
    // `#plan` alone and leave `#memory` — the height index `rowTop` reads, the `rowById` map
    // `barsForEntry` reads — behind. Two writes with no frame between them move the replanned row
    // count two past what `#memory` was last built for, so a stale index cannot even answer in
    // bounds. `reveal` right after `collapseStateOf` is the real caller this broke:
    // `#expandAndFindRow` found the new row at once (no reason left to flush a frame), then
    // `#revealRect` read `rowTop`/`barsForEntry` off the stale memory.
    //
    // The row's own `rowTop` cannot prove this alone: with every row the library's own uniform
    // height, a stale height index still answers `topAt(i)` correctly from row count
    // alone (`row-height-index.ts`'s `heightAt` never bounds-checks `i`). `barsForEntry` is the one
    // answer a stale `#memory` truly cannot fake — a `rowById` map still built for one row holds no
    // Bars for row 'c' at all (`FrameMemory.rowMemory`'s `#noRow` fallback), so `reveal`'s x falls
    // back to entry 'c's own `[start, end)` span instead of the fixed-width box its own `milestone`
    // variant draws. The x this test checks is that fixed box's own left edge, reachable no other
    // way — `rowTop` alone would pass whether `#memory` was in step or not.
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    try {
      const container = document.createElement('div');
      const scrollX = new ScrollAxis();
      const scrollY = new ScrollAxis();
      const dataset = new Dataset({
        timeZone: 'UTC',
        // A timed end (midnight, explicit) stores exactly as written (#421-adjacent): keeps this
        // test's geometry exact arithmetic, unlike a date-only end, which always means through
        // that day.
        entries: [{ id: 'a', name: 'a', start: '2026-01-01', end: '2026-01-02T00:00:00Z' }],
      });
      const gantt = new Gantt({
        container,
        dataset,
        scroll: { x: scrollX, y: scrollY },
        rowSource: { source: 'entries', tree: true },
        // A fixed range and density, not `fitDataset`/`fit: 'pane'` (both library defaults): so this
        // test's own pixel arithmetic below never depends on the measured pane, or on which entries
        // had already arrived the one time the range was last resolved.
        range: { start: '2026-01-01', end: '2026-01-10' },
        fit: 0.001,
        // Row 'c' alone draws a 20,000px fixed box instead of the plain span-following bar every
        // other row draws — wide and far enough from its own `[start, end)` span's geometry that no
        // floating-point noise could paper over the two answers landing on the same pixel.
        variants: [{ name: 'milestone', when: (entry) => entry.id === 'c', bars: fixedWidthBar(20_000) }],
      });
      // A pane far short of row 'c's target, on both axes, so `reveal` has to move the scroll on
      // both — an already-visible target would pass this test whether `#memory` was in step or not.
      FakeResizeObserver.instances[0]!.fire({ width: 300, height: 40 });

      // Two writes, no frame painted between either of them and the read below. Timed ends, so
      // both store exactly as written — the geometry below is exact arithmetic on them.
      dataset.entries.add({ id: 'b', name: 'b', start: '2026-01-03', end: '2026-01-04T00:00:00Z' });
      dataset.entries.add({ id: 'c', name: 'c', start: '2026-01-05', end: '2026-01-06T00:00:00Z' });

      expect(gantt.collapseStateOf('c')).toBe('leaf');

      // `scroll.panTo` receives the raw target `reveal` computes, before `ScrollAxis` clamps it to
      // its own content-driven max — a spy reads that raw target. Reading the clamped
      // `scroll.state.position` instead would not work here: `max` only grows on a painted frame,
      // and this test's whole point is that no frame paints between the writes and the reveal.
      const panToX = vi.spyOn(scrollX, 'panTo');
      const panToY = vi.spyOn(scrollY, 'panTo');

      gantt.reveal(entryId('c'));

      // Row 'c' is the third row (rowHeight 36, the library default): top 72, bottom 108. The pane
      // is 40px tall, so "nearest edge" pans exactly enough to bring the bottom edge into view —
      // 108 - 40 = 68.
      expect(panToY).toHaveBeenLastCalledWith(68);

      // Row 'c's own span is [Jan 5, Jan 6) — at `pxPerMs: 0.001` off a Jan 1 range start, x 345,600
      // to x 432,000. The `milestone` variant's 20,000px box centres on that span's own midpoint
      // (388,800): x 378,800 to x 398,800. The 300px pane's nearest edge pans exactly enough to
      // bring the box's trailing edge into view — 398,800 - 300 = 398,500. A stale `#memory` answers
      // `[]` for this row's Bars, and `reveal` falls back to the plain span above instead: nearest
      // edge lands on 432,000 - 300 = 431,700, a different pixel entirely.
      expect(panToX).toHaveBeenLastCalledWith(398_500);

      gantt.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
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

  // #489 owner ruling: `gantt.preset = '<id>'` also finds a preset in this Gantt's own
  // `zoomPresets`, not only the shipped table — the red test the ruling closes: before it,
  // this threw UnknownPresetError even though the id had just been spliced into zoomPresets.
  it("preset = resolves a custom id spliced into this Gantt's own zoomPresets, with no error (#489)", () => {
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

      const sixHour = {
        id: 'sixHour',
        tickUnit: 'hour' as const,
        tickIncrement: 6,
        headers: [{ unit: 'hour' as const, increment: 6, format: () => 'x' }],
        preferredTickWidthPx: 48,
        minTickWidthPx: 40,
      };
      gantt.zoomPresets = [...gantt.zoomPresets, sixHour];

      gantt.preset = 'sixHour';

      expect(gantt.preset).toBe(sixHour);

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
