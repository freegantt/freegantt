import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rowId } from '../model/index.js';
import type { RowId } from '../model/index.js';
import { RowDetails } from './row-details.js';
import type { RowDetailsPorts } from './row-details.js';

// happy-dom does no layout, so a fake observer and a fake measure stand in for the browser. The
// fake measure reads the height a test wrote on the wrapper's own content.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets = new Set<Element>();
  readonly #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
  }
  report(target: Element, blockSize: number): void {
    const entry = { target, borderBoxSize: [{ blockSize, inlineSize: 0 }] } as unknown as ResizeObserverEntry;
    this.#callback([entry], this);
  }
}

interface Harness {
  readonly details: RowDetails;
  readonly layer: HTMLElement;
  readonly ports: RowDetailsPorts & {
    tops: Map<string, number | undefined>;
    window: { top: number; height: number };
  };
  readonly paintNow: ReturnType<typeof vi.fn>;
  readonly requestPaint: ReturnType<typeof vi.fn>;
  readonly panBy: ReturnType<typeof vi.fn>;
  readonly focusRow: ReturnType<typeof vi.fn>;
  readonly revealRange: ReturnType<typeof vi.fn>;
  readonly measure: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  const layer = document.createElement('div');
  document.body.append(layer);
  const tops = new Map<string, number | undefined>();
  const window = { top: 0, height: 300 };
  const paintNow = vi.fn();
  const requestPaint = vi.fn();
  const panBy = vi.fn();
  const focusRow = vi.fn();
  const revealRange = vi.fn();
  const measure = vi.fn((wrapper: HTMLElement) => Number(wrapper.dataset['measured'] ?? 0));
  const ports = {
    layer,
    rowIdOf: (id: string) => rowId(id),
    rowDetailTop: (id: RowId) => tops.get(id),
    measure,
    visibleWindow: () => window,
    panBy,
    revealRange,
    paintNow,
    requestPaint,
    focusRow,
    tops,
    window,
  };
  const details = new RowDetails(ports, FakeResizeObserver);
  return { details, layer, ports, paintNow, requestPaint, panBy, focusRow, revealRange, measure };
}

/** A detail's content, with the height the fake measure answers for its wrapper. */
function panel(measured: number): HTMLElement {
  const content = document.createElement('section');
  content.dataset['measured'] = String(measured);
  return content;
}

function wrapperOf(h: Harness, id: string): HTMLElement {
  return h.layer.querySelector<HTMLElement>(`.fg-row-detail[data-row-id="${id}"]`)!;
}

/** The fake measure reads the wrapper, so copy the content's number onto it. */
function present(h: Harness, id: string, measured: number, top: number | 'nowhere' = 100): () => void {
  h.ports.tops.set(id, top === 'nowhere' ? undefined : top);
  const dispose = h.details.present(id, panel(measured));
  wrapperOf(h, id).dataset['measured'] = String(measured);
  return dispose;
}

beforeEach(() => {
  FakeResizeObserver.instances.length = 0;
});

describe('RowDetails', () => {
  it('wraps the content in a wrapper under the layer, placed at the Row detail top', () => {
    const h = harness();
    present(h, 't1', 80, 64);
    const wrapper = wrapperOf(h, 't1');
    expect(wrapper.parentElement).toBe(h.layer);
    expect(wrapper.firstElementChild?.tagName).toBe('SECTION');
    expect(wrapper.hidden).toBe(false);
    expect(wrapper.style.transform).toBe('translateY(64px)');
  });

  it('hides the wrapper of a Row with no place, and shows it where the Row returns', () => {
    const h = harness();
    present(h, 't1', 80, 'nowhere');
    expect(wrapperOf(h, 't1').hidden).toBe(true);
    h.ports.tops.set('t1', 96);
    h.details.placeAll();
    expect(wrapperOf(h, 't1').hidden).toBe(false);
    expect(wrapperOf(h, 't1').style.transform).toBe('translateY(96px)');
  });

  it('writes no style when a Row stays where it was', () => {
    const h = harness();
    present(h, 't1', 80, 64);
    const wrapper = wrapperOf(h, 't1');
    const write = vi.spyOn(wrapper.style, 'transform', 'set');
    h.details.placeAll();
    h.details.placeAll();
    expect(write).not.toHaveBeenCalled();
  });

  it('reads 500 new wrappers in one batch, and stores them as one new map', () => {
    const h = harness();
    for (let i = 0; i < 500; i++) present(h, `t${i}`, 40 + (i % 3), i * 10);
    expect(h.measure).not.toHaveBeenCalled();
    const before = h.details.heights;
    h.details.measurePending();
    expect(h.measure).toHaveBeenCalledTimes(500);
    expect(h.details.heights).not.toBe(before);
    expect(h.details.heights.size).toBe(500);
    expect(h.paintNow).not.toHaveBeenCalled();
  });

  it('measurePending reads nothing when nothing is pending (P3)', () => {
    const h = harness();
    present(h, 't1', 80);
    h.details.measurePending();
    h.measure.mockClear();
    const heights = h.details.heights;
    h.details.measurePending();
    h.details.measurePending();
    expect(h.measure).not.toHaveBeenCalled();
    expect(h.details.heights).toBe(heights);
  });

  it('a Gantt that never presents a detail creates no observer and keeps one empty map (P2)', () => {
    const h = harness();
    h.details.measurePending();
    h.details.placeAll();
    const empty = h.details.heights;
    h.details.measurePending();
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect(h.measure).not.toHaveBeenCalled();
    expect(h.details.heights).toBe(empty);
    expect(empty.size).toBe(0);
  });

  it('asks for a frame when content is presented, so the first paint reserves the room', () => {
    const h = harness();
    present(h, 't1', 80);
    expect(h.requestPaint).toHaveBeenCalledTimes(1);
  });

  it('a size the observer reports makes a new map and paints one frame now', () => {
    const h = harness();
    present(h, 't1', 80);
    h.details.measurePending();
    const before = h.details.heights;
    FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 120);
    expect(h.details.heights).not.toBe(before);
    expect(h.details.heights.get(rowId('t1'))).toBe(120);
    expect(h.paintNow).toHaveBeenCalledTimes(1);
  });

  it('a size equal to the held height changes nothing and paints nothing', () => {
    const h = harness();
    present(h, 't1', 80);
    h.details.measurePending();
    const before = h.details.heights;
    FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 80);
    expect(h.details.heights).toBe(before);
    expect(h.paintNow).not.toHaveBeenCalled();
  });

  it('ignores the zero size of a hidden wrapper, and keeps the last measured height', () => {
    const h = harness();
    present(h, 't1', 80, 64);
    h.details.measurePending();
    h.ports.tops.set('t1', undefined);
    h.details.placeAll();
    FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 0);
    expect(h.details.heights.get(rowId('t1'))).toBe(80);
    expect(h.paintNow).not.toHaveBeenCalled();
  });

  it('a visible detail that shrinks to nothing takes no room', () => {
    const h = harness();
    present(h, 't1', 80);
    h.details.measurePending();
    FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 0);
    expect(h.details.heights.size).toBe(0);
  });

  it('a second present for the Row replaces the first, and the old disposer does nothing', () => {
    const h = harness();
    const first = present(h, 't1', 80);
    const old = wrapperOf(h, 't1');
    present(h, 't1', 50);
    expect(old.isConnected).toBe(false);
    expect(h.layer.querySelectorAll('.fg-row-detail')).toHaveLength(1);
    first();
    expect(h.layer.querySelectorAll('.fg-row-detail')).toHaveLength(1);
  });

  it('a disposer removes the wrapper once, takes the room back and asks for a frame', () => {
    const h = harness();
    const dispose = present(h, 't1', 80);
    h.details.measurePending();
    h.requestPaint.mockClear();
    dispose();
    dispose();
    expect(h.layer.querySelectorAll('.fg-row-detail')).toHaveLength(0);
    expect(h.details.heights.size).toBe(0);
    expect(h.requestPaint).toHaveBeenCalledTimes(1);
  });

  it('closing a detail stops observing it, and the last close drops the observer', () => {
    const h = harness();
    const closeOne = present(h, 't1', 80);
    const closeTwo = present(h, 't2', 80);
    const observer = FakeResizeObserver.instances[0]!;
    const wrapperOne = wrapperOf(h, 't1');
    expect(observer.targets.has(wrapperOne)).toBe(true);
    closeOne();
    expect(observer.targets.has(wrapperOne)).toBe(false);
    closeTwo();
    expect(observer.targets.size).toBe(0);
  });

  it('closing with focus inside the detail puts focus on its Row first', () => {
    const h = harness();
    const dispose = present(h, 't1', 80);
    const input = document.createElement('textarea');
    wrapperOf(h, 't1').append(input);
    input.focus();
    h.focusRow.mockImplementation(() => {
      // The wrapper is still in the page when focus moves, so focus never falls to the body.
      expect(wrapperOf(h, 't1')).not.toBeNull();
    });
    dispose();
    expect(h.focusRow).toHaveBeenCalledWith(rowId('t1'));
  });

  it('closing with focus elsewhere moves no focus', () => {
    const h = harness();
    const dispose = present(h, 't1', 80);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    dispose();
    expect(h.focusRow).not.toHaveBeenCalled();
  });

  it('destroying the Gantt moves no focus', () => {
    const h = harness();
    present(h, 't1', 80);
    const input = document.createElement('textarea');
    wrapperOf(h, 't1').append(input);
    input.focus();
    h.details.destroy();
    expect(h.focusRow).not.toHaveBeenCalled();
    expect(h.layer.querySelectorAll('.fg-row-detail')).toHaveLength(0);
  });

  describe('keeping the visible rows still', () => {
    function settled(top: number): Harness {
      const h = harness();
      h.ports.window.top = 500;
      present(h, 't1', 80, top);
      h.details.measurePending();
      h.paintNow.mockClear();
      return h;
    }

    it('a detail fully above the window that grows pans the content by the growth', () => {
      const h = settled(100);
      FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 130);
      expect(h.panBy).toHaveBeenCalledWith(50);
      expect(h.paintNow).toHaveBeenCalledTimes(2);
    });

    it('a detail fully above the window that shrinks pans the content back', () => {
      const h = settled(100);
      FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 30);
      expect(h.panBy).toHaveBeenCalledWith(-50);
    });

    it('a detail that is partly in the window pans nothing', () => {
      const h = settled(450);
      FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 130);
      expect(h.panBy).not.toHaveBeenCalled();
      expect(h.paintNow).toHaveBeenCalledTimes(1);
    });

    it('a detail below the window pans nothing', () => {
      const h = settled(900);
      FakeResizeObserver.instances[0]!.report(wrapperOf(h, 't1'), 130);
      expect(h.panBy).not.toHaveBeenCalled();
    });
  });

  describe('focus that enters a detail outside the window', () => {
    it('scrolls the detail into view', () => {
      const h = harness();
      h.ports.window.top = 500;
      present(h, 't1', 80, 100);
      h.details.measurePending();
      wrapperOf(h, 't1').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(h.revealRange).toHaveBeenCalledWith(100, 80);
    });

    it('leaves a detail that is already in view alone', () => {
      const h = harness();
      present(h, 't1', 80, 100);
      h.details.measurePending();
      wrapperOf(h, 't1').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(h.revealRange).not.toHaveBeenCalled();
    });
  });
});
