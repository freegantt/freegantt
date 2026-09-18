// S6 acceptance R4 (#403): 100 mount/destroy cycles leak no nodes, listeners, or observables — and
// the case that matters is two Gantts on one shared axis, because a shared axis is the one thing
// that outlives a Gantt and so the one place a dead binding can pile up (D9, D-S6-1).
//
// The library is imported through the bare `freegantt` specifier, the door a consumer uses. A leak
// is a property of the shipped surface, not of an internal.
//
// **Every assertion here is a slope, not a total.** A count is compared against the count after an
// earlier cycle, never against an absolute number: one-time module setup (the base stylesheet,
// happy-dom's own listeners) is not a leak, and an absolute number turns every unrelated change
// into a red test, which is how a leak check gets deleted a year later.
//
// **No assertion here is about memory, and the fixtures are deliberately small.** Measured while
// writing this file: happy-dom retains about 0.2 MB per rendered entry per mount, whatever
// `destroy()` does, and two forced collections do not return it — 50 entries over 40 cycles held
// 414 MB, and a first draft of this file ran the worker out of memory. The same page in Chromium
// grows 1.4 KB per mount over 150 mounts with node and listener counts exactly flat
// (`e2e/mount-destroy.spec.ts`). So the retention is the fake DOM's, not the library's, and heap is
// a question only a real browser can answer. Small datasets keep this file inside a worker; the
// counts below are what it is actually for.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dataset, Gantt, ScrollAxis, TimeScaleModel, timeShading, daysOfWeek } from 'freegantt';
import type { ScrollAxes } from 'freegantt';
import { sampleEntryInputs } from '../../fixtures/sample-dataset.js';
// The same four plugins `[S5-A3]` treats as the acceptance object (#153): a re-implementation would
// not fail when a real plugin's disposer stops retracting something. `weekendShading()` retired
// under #404 — `timeShading()` is its shipped replacement, imported the same way every other plugin
// here is: through the bare `freegantt` specifier.
import { bufferKind } from '../../harness/plugins/buffer-kind.js';
import { riskKind } from '../../harness/plugins/risk-kind.js';
import { popupDemo } from '../../harness/plugins/popup-demo.js';

/** What one census reads. Nodes, listeners and observables are the three #403 names, plus the
 *  animation frames that keep a destroyed shell's render callback alive. */
interface LiveResources {
  listeners: number;
  observers: number;
  animationFrames: number;
  documentNodes: number;
}

interface ListenerRecord {
  target: EventTarget;
  type: string;
  listener: unknown;
  capture: boolean;
}

/** A listener added with `capture` must be removed with `capture`, so the flag is part of the
 *  record's identity — a remove that forgets it removes nothing, which is exactly the bug this
 *  census has to catch. */
function isCapture(options: boolean | EventListenerOptions | undefined): boolean {
  return typeof options === 'boolean' ? options : (options?.capture ?? false);
}

/** The prototype in `subject`'s chain that actually defines `method` — the one object a patch has
 *  to replace it on. */
function prototypeOwning(subject: object, method: string): Record<string, unknown> {
  let proto: object | null = Object.getPrototypeOf(subject) as object | null;
  while (proto) {
    if (Object.prototype.hasOwnProperty.call(proto, method)) return proto as Record<string, unknown>;
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  throw new Error(`leak census: nothing in the prototype chain defines ${method}`);
}

/** Counts what the page is still holding. Install once per test file run, read between cycles.
 *
 *  It wraps the four globals the library can hold something through: `addEventListener`,
 *  `ResizeObserver`, `MutationObserver` and `requestAnimationFrame`. Nothing here is a library
 *  seam — the point is to measure the shipped code, not a version of it built for measurement. */
function installCensus(): { read: () => LiveResources; uninstall: () => void } {
  const liveListeners: ListenerRecord[] = [];
  // Found from a real node, never from `globalThis.EventTarget`: happy-dom ships its own
  // `EventTarget` class, and the global of that name is Node's, which no node here inherits from.
  // Patching the global one counts nothing and the census reads clean through any leak — which is
  // what it did, until a deliberately leaked document listener refused to turn it red.
  const eventTargets = prototypeOwning(document, 'addEventListener');
  // `window` carries its own `addEventListener`, on the instance rather than on that prototype.
  const windowTarget = window as unknown as Record<string, unknown>;
  const realAdd = eventTargets['addEventListener'] as EventTarget['addEventListener'];
  const realRemove = eventTargets['removeEventListener'] as EventTarget['removeEventListener'];
  const realWindowAdd = windowTarget['addEventListener'] as EventTarget['addEventListener'];
  const realWindowRemove = windowTarget['removeEventListener'] as EventTarget['removeEventListener'];
  const RealResizeObserver = globalThis.ResizeObserver;
  const RealMutationObserver = globalThis.MutationObserver;
  const realRequestFrame = globalThis.requestAnimationFrame;
  const realCancelFrame = globalThis.cancelAnimationFrame;

  const connectedObservers = new Set<object>();
  const pendingFrames = new Set<number>();

  function countingAdd(real: EventTarget['addEventListener']): EventTarget['addEventListener'] {
    return function patchedAdd(
      this: EventTarget,
      type: string,
      listener: unknown,
      options?: boolean | AddEventListenerOptions,
    ): void {
      liveListeners.push({ target: this, type, listener, capture: isCapture(options) });
      real.call(this, type, listener as EventListenerOrEventListenerObject | null, options);
    } as EventTarget['addEventListener'];
  }

  function countingRemove(real: EventTarget['removeEventListener']): EventTarget['removeEventListener'] {
    return function patchedRemove(
      this: EventTarget,
      type: string,
      listener: unknown,
      options?: boolean | EventListenerOptions,
    ): void {
      const capture = isCapture(options);
      // A listener added with `capture` must be removed with `capture` to come off at all, so the
      // record only matches when the flag matches too.
      const index = liveListeners.findIndex(
        (record) =>
          record.target === this &&
          record.type === type &&
          record.listener === listener &&
          record.capture === capture,
      );
      if (index >= 0) liveListeners.splice(index, 1);
      real.call(this, type, listener as EventListenerOrEventListenerObject | null, options);
    } as EventTarget['removeEventListener'];
  }

  eventTargets['addEventListener'] = countingAdd(realAdd);
  eventTargets['removeEventListener'] = countingRemove(realRemove);
  windowTarget['addEventListener'] = countingAdd(realWindowAdd);
  windowTarget['removeEventListener'] = countingRemove(realWindowRemove);

  // An observer counts as live from its first `observe` until its `disconnect`. Constructing one and
  // never observing holds nothing, which is what `ContainerResize`'s lazy observer relies on.
  class CountingResizeObserver extends RealResizeObserver {
    override observe(target: Element, options?: ResizeObserverOptions): void {
      connectedObservers.add(this);
      super.observe(target, options);
    }

    override disconnect(): void {
      connectedObservers.delete(this);
      super.disconnect();
    }
  }

  class CountingMutationObserver extends RealMutationObserver {
    override observe(target: Node, options?: MutationObserverInit): void {
      connectedObservers.add(this);
      super.observe(target, options);
    }

    override disconnect(): void {
      connectedObservers.delete(this);
      super.disconnect();
    }
  }

  globalThis.ResizeObserver = CountingResizeObserver;
  globalThis.MutationObserver = CountingMutationObserver;

  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = realRequestFrame((time) => {
      pendingFrames.delete(handle);
      callback(time);
    });
    pendingFrames.add(handle);
    return handle;
  };

  globalThis.cancelAnimationFrame = (handle: number): void => {
    pendingFrames.delete(handle);
    realCancelFrame(handle);
  };

  return {
    read: () => ({
      listeners: liveListeners.length,
      observers: connectedObservers.size,
      animationFrames: pendingFrames.size,
      documentNodes: document.querySelectorAll('*').length,
    }),
    uninstall: () => {
      eventTargets['addEventListener'] = realAdd;
      eventTargets['removeEventListener'] = realRemove;
      windowTarget['addEventListener'] = realWindowAdd;
      windowTarget['removeEventListener'] = realWindowRemove;
      globalThis.ResizeObserver = RealResizeObserver;
      globalThis.MutationObserver = RealMutationObserver;
      globalThis.requestAnimationFrame = realRequestFrame;
      globalThis.cancelAnimationFrame = realCancelFrame;
    },
  };
}

/** A handful of entries, not the whole fixture: a leak is per mount, so it shows at any size, and a
 *  small dataset is what keeps the fake DOM's own retention (see the header) out of the way. */
function newDataset(): Dataset {
  return new Dataset({ entries: sampleEntryInputs.slice(0, 5), timeZone: 'UTC' });
}

/** Mounts a Gantt in a container attached to the page, runs `use`, then destroys both. Attached and
 *  not detached: a node count means nothing for a container the document never held. */
function mountAndDestroy(options: { scale?: TimeScaleModel; scroll?: ScrollAxes } = {}): void {
  const container = document.createElement('div');
  document.body.append(container);
  const gantt = new Gantt({
    container,
    dataset: newDataset(),
    ...(options.scale ? { scale: options.scale } : {}),
    ...(options.scroll ? { scroll: options.scroll } : {}),
  });
  gantt.destroy();
  container.remove();
}

/** The same mount and destroy, with plugins installed and a selection made — so a plugin's own
 *  disposers, a variant's stylesheet rule and the decoration pass all run and all have to retract.
 *  #403 names these as suspects, and a cycle that mounts a bare Gantt never reaches them. */
function mountWithPluginsAndDestroy(): void {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = newDataset();
  const gantt = new Gantt({
    container,
    dataset,
    plugins: [bufferKind(), riskKind(), timeShading([{ covers: daysOfWeek(6, 7) }]), popupDemo()],
  });
  gantt.selectedEntryIds = [dataset.entries.all[0]!.id];
  gantt.destroy();
  container.remove();
}

const CYCLES = 100;

describe('[S6-R4] mount/destroy leaks nothing over 100 cycles (#403)', () => {
  let census: ReturnType<typeof installCensus>;

  beforeEach(() => {
    census = installCensus();
  });

  afterEach(() => {
    census.uninstall();
    document.body.replaceChildren();
  });

  it('a single Gantt returns every count to its one-cycle baseline', () => {
    // #403 Q2: the baseline is taken after the first pair, never before the first mount. The base
    // stylesheet and the document's own one-time wiring land during cycle 1 and stay for the life
    // of the page — that is shared setup, not a leak.
    mountAndDestroy();
    const baseline = census.read();

    for (let i = 0; i < CYCLES; i++) mountAndDestroy();

    expect(census.read()).toEqual(baseline);
  });

  it('a Gantt with four plugins and a selection returns to its baseline', () => {
    mountWithPluginsAndDestroy();
    const baseline = census.read();

    for (let i = 0; i < CYCLES; i++) mountWithPluginsAndDestroy();

    expect(census.read()).toEqual(baseline);
  });

  it('two Gantts sharing one TimeScaleModel and both scroll axes return to their baseline', () => {
    const scale = new TimeScaleModel({ fit: 'preset' });
    const scroll: ScrollAxes = { x: new ScrollAxis(), y: new ScrollAxis() };
    const mountPair = (): void => {
      mountAndDestroy({ scale, scroll });
      mountAndDestroy({ scale, scroll });
    };

    mountPair();
    const baseline = census.read();

    for (let i = 0; i < CYCLES; i++) mountPair();

    expect(census.read()).toEqual(baseline);
  });
});

/** A binding on a shared axis is invisible to the DOM census above: it holds no node, no listener
 *  and no observer. `ScrollAxis.state.max` is what makes it observable — it is the loosest bound any
 *  *bound* Gantt needs, so it is a fan-in over the live bindings and nothing else. A binding left
 *  behind by a destroyed Gantt keeps claiming room in it.
 *
 *  D-S6-1 (#405) makes one axis the shared unit, so each axis is asked separately — which is what
 *  "one binding set, one lifetime" has to mean if it means anything. The pairs below share both
 *  axes, so both get asked; the last test mounts the first consumer's own shape instead, x shared
 *  with y private. */
describe('[S6-R4] a destroyed Gantt leaves nothing bound to a shared axis (#403, D-S6-1)', () => {
  function mountOn(scale: TimeScaleModel, scroll: ScrollAxes): { gantt: Gantt; container: HTMLElement } {
    const container = document.createElement('div');
    document.body.append(container);
    return { gantt: new Gantt({ container, dataset: newDataset(), scale, scroll }), container };
  }

  /** Where the first bar sits and how wide it is. A repaint is the only proof a surviving Gantt
   *  still follows the shared model — the model itself cannot say who is listening. Width as well
   *  as place: the first bar starts at the range start, so a zoom re-sizes it without moving it. */
  function firstBarPlacement(container: HTMLElement): string {
    const bar = container.querySelector<HTMLElement>('.fg-bar');
    return bar ? `${bar.style.transform} ${bar.style.width}` : '';
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('both destroyed: each shared axis claims no room at all, in either destroy order', () => {
    for (const order of ['first-mounted-first', 'last-mounted-first'] as const) {
      const scale = new TimeScaleModel({ fit: 'preset' });
      const scroll: ScrollAxes = { x: new ScrollAxis(), y: new ScrollAxis() };
      const a = mountOn(scale, scroll).gantt;
      const b = mountOn(scale, scroll).gantt;

      // The instrument has to be able to see a leak before its silence means anything: a bound pair
      // claims room, so a binding left behind would keep claiming it.
      expect(scroll.x!.state.max).toBeGreaterThan(0);

      if (order === 'first-mounted-first') {
        a.destroy();
        b.destroy();
      } else {
        b.destroy();
        a.destroy();
      }

      expect(scroll.x!.state.max).toBe(0);
      expect(scroll.y!.state.max).toBe(0);
    }
  });

  it('one destroyed: the survivor still bounds the shared axis, zooms and paints', async () => {
    const scale = new TimeScaleModel({ fit: 'preset' });
    const scroll: ScrollAxes = { x: new ScrollAxis(), y: new ScrollAxis() };
    const a = mountOn(scale, scroll).gantt;
    const survivor = mountOn(scale, scroll);
    const boundMax = scroll.x!.state.max;

    a.destroy();

    // B alone bounds the model now, and it is the same bound: the two panes hold the same dataset,
    // so A was never the looser of the two.
    expect(scroll.x!.state.max).toBe(boundMax);

    // A pan past the end clamps to what the *bound* Gantts allow. It lands on B's own bound, so B
    // is what the model is still asking. A leaked A binding would have answered here too.
    scroll.x!.panTo(Number.MAX_SAFE_INTEGER);
    expect(scroll.x!.state.position).toBe(boundMax);

    // A scroll moves the pane, not the bar — the timeline pane is the native scroller and a bar
    // keeps its place in content space (D-S1.8-1). A zoom is what re-places the bar, and a repaint
    // lands on the next animation frame.
    const beforeZoom = firstBarPlacement(survivor.container);
    survivor.gantt.zoomIn();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(firstBarPlacement(survivor.container)).not.toBe(beforeZoom);
    expect(survivor.container.querySelectorAll('.fg-bar').length).toBeGreaterThan(0);

    survivor.gantt.destroy();
  });

  it('a fresh pair on the same models reports what the first pair reported', () => {
    const scale = new TimeScaleModel({ fit: 'preset' });
    const scroll: ScrollAxes = { x: new ScrollAxis(), y: new ScrollAxis() };

    const first = [mountOn(scale, scroll), mountOn(scale, scroll)];
    const firstMax = { x: scroll.x!.state.max, y: scroll.y!.state.max };
    const firstPlace = firstBarPlacement(first[0]!.container);
    for (const mounted of first) mounted.gantt.destroy();

    const second = [mountOn(scale, scroll), mountOn(scale, scroll)];
    expect({ x: scroll.x!.state.max, y: scroll.y!.state.max }).toEqual(firstMax);
    expect(firstBarPlacement(second[0]!.container)).toBe(firstPlace);
    for (const mounted of second) mounted.gantt.destroy();
  });

  it('the consumer shape — x shared, y private — leaves the shared x clean (D-S6-1)', () => {
    // `plans/handoff/2026-09-15-crm-filament-labor.md` §1: two panes, one shared time axis, one
    // shared horizontal scroll. Private y is the library's own ruling (#405), and it is the shape
    // that consumer mounts and destroys on every visit.
    const scale = new TimeScaleModel({ fit: 'preset' });
    const sharedX = new ScrollAxis();
    const top = mountOn(scale, { x: sharedX });
    const bottom = mountOn(scale, { x: sharedX });

    expect(sharedX.state.max).toBeGreaterThan(0);

    top.gantt.destroy();
    bottom.gantt.destroy();

    expect(sharedX.state.max).toBe(0);
  });
});
