import { describe, expect, it } from 'vitest';
import { attachScroll } from './scroll-attachment.js';
import { Viewport } from '../layout/index.js';
import type { DatasetBinding } from '../layout/index.js';
import { entryId, segmentId } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';

// view/ has no import edge to time/ (plans/01 §1) — instant() lives there. Date.parse on a
// Z-offset string is deterministic regardless of the local machine's zone, unlike `new Date(str)`
// on a zoneless string (#27), so this is not the thing I10 exists to ban.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

function entry(id: string, start: string, end: string): Entry {
  const startInstant = instant(start);
  const endInstant = instant(end);
  return {
    id: entryId(id),
    name: id,
    start: startInstant,
    end: endInstant,
    kind: 'span',
    segments: [{ id: segmentId(`${id}-1`), start: startInstant, end: endInstant }],
    props: {},
  };
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

    viewport.scroll.panTo({ x: 250, y: 300 });
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

    expect(viewport.scroll.state.position).toEqual({ x: 40, y: 60 });
  });

  it('writePosition is the only thing that writes the element — it is not automatic (D-S1.5-7)', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, () => {});
    handle.setContentSize({ width: 1000, height: 1000 });
    handle.setPaneSize({ width: 100, height: 100 });
    const element = el();
    const attachment = attachScroll(element, viewport);

    viewport.scroll.panTo({ y: 50 });
    // The model changed, but nothing writes the element until the caller says so.
    expect(element.scrollTop).toBe(0);

    attachment.writePosition();
    expect(element.scrollTop).toBe(50);
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
    expect(viewport.scroll.state.position.x).toBe(0);
  });
});
