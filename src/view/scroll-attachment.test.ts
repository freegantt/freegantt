import { describe, expect, it } from 'vitest';
import { attachScroll } from './scroll-attachment.js';
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
  function paneOn(scroll: { x: ScrollAxis }): { element: HTMLElement; reserve: () => void } {
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
