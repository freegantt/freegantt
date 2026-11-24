import { describe, expect, it } from 'vitest';
import { attachScroll, contentScrollsForWheel } from './scroll-attachment.js';
import { ScrollAxis, Viewport } from '../layout/index.js';
import type { DatasetBinding } from '../layout/index.js';
import type { Entry, Instant } from '../model/index.js';
import { entryDouble } from '../layout/entry-double.js';

// view/ has no import edge to time/ (plans/01 §1) — instant() lives there. Date.parse on a
// Z-offset string is deterministic regardless of the local machine's zone, unlike `new Date(str)`
// on a zoneless string (#27), so this is not the thing I10 exists to ban.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

function entry(id: string, start: string, end: string): Entry {
  return entryDouble({ id, start: instant(start), end: instant(end) });
}

const dataset: DatasetBinding = {
  timeZone: 'UTC',
  entries: [entry('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z')],
};

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('attachScroll', () => {
  it('a model-driven position write lands on the element', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);

    viewport.batch(() => {
      viewport.scroll.x.panTo(250);
      viewport.scroll.y.panTo(300);
    });
    attachment.writePosition();
    expect(element.scrollLeft).toBe(250);
    expect(element.scrollTop).toBe(300);
  });

  it('a native scroll event updates the model', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    attachScroll(element, viewport);

    element.scrollLeft = 40;
    element.scrollTop = 60;
    element.dispatchEvent(new Event('scroll'));

    expect(viewport.scroll.x.state.position).toBe(40);
    expect(viewport.scroll.y.state.position).toBe(60);
  });

  it('writePosition is the only thing that writes the element — it is not automatic (D-S1.5-7)', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);

    viewport.scroll.y.panTo(50);
    // The model changed, but nothing writes the element until the caller says so.
    expect(element.scrollTop).toBe(0);

    attachment.writePosition();
    expect(element.scrollTop).toBe(50);
  });

  it('a late echo of an already-superseded write does not revert a newer panTo (#131)', () => {
    // The browser's own 'scroll' event for a `writePosition()` write is not guaranteed to arrive
    // before the next `panTo` — Firefox can deliver it late enough to land after a fresher target
    // has already been set, landing here exactly as reproduced: write 0, panTo to 250 before the
    // element's own 'scroll' event for that first write is dispatched.
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);

    attachment.writePosition(); // writes 0 — the element already starts at 0, so this is a no-op write
    viewport.scroll.x.panTo(250); // a newer target, not yet reflected in the element
    // The element still reads 0 here — nothing has flushed the newer target to it yet. A caller
    // (GanttShell.render(), on a later animation frame) is the only thing that would.
    element.dispatchEvent(new Event('scroll')); // the late echo of the earlier write-to-0

    expect(viewport.scroll.x.state.position).toBe(250);
  });

  it('detach() removes the listener', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);

    attachment.detach();

    element.scrollLeft = 500;
    element.dispatchEvent(new Event('scroll'));
    // Listener removed: the native event no longer reaches the model.
    expect(viewport.scroll.x.state.position).toBe(0);
  });
});

// #440: two panes on one axis must agree about how far right they can go, and they only agree when
// they are the same width. The gutter is what makes a pane's width independent of its own rows.
describe('attachScroll reserveScrollbarGutter', () => {
  function paneOn(scroll: { x?: ScrollAxis; y?: ScrollAxis }): {
    element: HTMLElement;
    reserve: () => void;
  } {
    const viewport = new Viewport({ scroll });
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);
    return { element, reserve: () => attachment.reserveScrollbarGutter() };
  }

  it('a lone Gantt keeps its full pane width', () => {
    const pane = paneOn({ x: new ScrollAxis() });

    pane.reserve();

    expect(pane.element.classList.contains('fg-shared-axis')).toBe(false);
  });

  it('two Gantts sharing one x axis both reserve the gutter', () => {
    const shared = new ScrollAxis();
    const top = paneOn({ x: shared });
    const bottom = paneOn({ x: shared });

    top.reserve();
    bottom.reserve();

    expect(top.element.classList.contains('fg-shared-axis')).toBe(true);
    expect(bottom.element.classList.contains('fg-shared-axis')).toBe(true);
  });

  it('a pane that mounted alone reserves the gutter once a second Gantt joins its axis', () => {
    const shared = new ScrollAxis();
    const first = paneOn({ x: shared });
    first.reserve();
    expect(first.element.classList.contains('fg-shared-axis')).toBe(false);

    paneOn({ x: shared });
    first.reserve();

    expect(first.element.classList.contains('fg-shared-axis')).toBe(true);
  });

  // The gutter reserves inline space, which is the vertical scrollbar's. A shared y axis misaligns
  // through the *horizontal* scrollbar instead, so paying 15px of width there buys nothing.
  it('a shared y axis alone does not cost the pane any width', () => {
    const sharedY = new ScrollAxis();
    const top = paneOn({ y: sharedY });
    const bottom = paneOn({ y: sharedY });

    top.reserve();
    bottom.reserve();

    expect(top.element.classList.contains('fg-shared-axis')).toBe(false);
    expect(bottom.element.classList.contains('fg-shared-axis')).toBe(false);
  });

  it('gives the width back when the neighbour goes away', () => {
    const shared = new ScrollAxis();
    const survivor = paneOn({ x: shared });
    const viewport = new Viewport({ scroll: { x: shared } });
    const leaving = viewport.bind(dataset, () => {});
    survivor.reserve();
    expect(survivor.element.classList.contains('fg-shared-axis')).toBe(true);

    leaving.unbind();
    survivor.reserve();

    expect(survivor.element.classList.contains('fg-shared-axis')).toBe(false);
  });
});

describe('contentScrollsForWheel', () => {
  const style = document.createElement('style');
  style.textContent =
    '.wheel-auto { overflow-y: auto; } .wheel-hidden { overflow-y: hidden; } .wheel-visible { overflow-y: visible; }';
  document.head.append(style);

  const heights = new Map<HTMLElement, number>();
  const clientBox = (element: HTMLElement) => ({ width: 0, height: heights.get(element) ?? 0 });

  function box(scroll: {
    top?: number;
    height: number;
    client: number;
    overflow?: 'auto' | 'hidden' | 'visible';
  }): HTMLElement {
    const node = document.createElement('textarea');
    node.className = `wheel-${scroll.overflow ?? 'auto'}`;
    document.body.append(node);
    Object.defineProperty(node, 'scrollHeight', { value: scroll.height });
    heights.set(node, scroll.client);
    node.scrollTop = scroll.top ?? 0;
    return node;
  }
  function boundaryOf(...children: HTMLElement[]): HTMLElement {
    const boundary = document.createElement('div');
    document.body.append(boundary);
    boundary.append(...children);
    return boundary;
  }
  const down = { x: 0, y: 40 };
  const up = { x: 0, y: -40 };

  it('says yes for a scrollable box that is not at the edge the wheel turns toward', () => {
    const area = box({ top: 10, height: 300, client: 100 });
    const boundary = boundaryOf(area);
    expect(contentScrollsForWheel(area, boundary, down, clientBox)).toBe(true);
    expect(contentScrollsForWheel(area, boundary, up, clientBox)).toBe(true);
  });

  it('says no at the edge the wheel turns toward, so the rows take the wheel', () => {
    const atTop = box({ top: 0, height: 300, client: 100 });
    const atBottom = box({ top: 200, height: 300, client: 100 });
    const boundary = boundaryOf(atTop, atBottom);
    expect(contentScrollsForWheel(atTop, boundary, up, clientBox)).toBe(false);
    expect(contentScrollsForWheel(atBottom, boundary, down, clientBox)).toBe(false);
  });

  it('says no for a box with nothing to scroll or with overflow hidden', () => {
    const fits = box({ height: 100, client: 100 });
    const hidden = box({ height: 300, client: 100, overflow: 'hidden' });
    const boundary = boundaryOf(fits, hidden);
    expect(contentScrollsForWheel(fits, boundary, down, clientBox)).toBe(false);
    expect(contentScrollsForWheel(hidden, boundary, down, clientBox)).toBe(false);
  });

  it('says yes for a textarea whose computed overflow reads visible, as Firefox reports it', () => {
    const area = box({ top: 10, height: 300, client: 100, overflow: 'visible' });
    const boundary = boundaryOf(area);
    expect(contentScrollsForWheel(area, boundary, down, clientBox)).toBe(true);
  });

  it('says no for a div whose overflow reads visible', () => {
    const area = document.createElement('div');
    document.body.append(area);
    area.className = 'wheel-visible';
    Object.defineProperty(area, 'scrollHeight', { value: 300 });
    heights.set(area, 100);
    const boundary = boundaryOf(area);
    expect(contentScrollsForWheel(area, boundary, down, clientBox)).toBe(false);
  });

  it('looks at ancestors up to the boundary and no further', () => {
    const outside = box({ top: 10, height: 300, client: 100 });
    const inner = document.createElement('span');
    const boundary = boundaryOf(inner);
    outside.append(boundary);
    expect(contentScrollsForWheel(inner, boundary, down, clientBox)).toBe(false);
  });
});
