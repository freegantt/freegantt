// api/ — the connect gesture through a mounted Gantt: a plugin registers `ctx.view.onConnect`, the
// user hovers a bar, drags from a port to another bar's port, and drops. happy-dom has no layout, so
// `document.elementFromPoint` is the one stub. It stands in for what the pointer is over.

import { afterEach, describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import { definePlugin } from './define-plugin.js';
import type { ChromePlugin } from './index.js';
import type { Capabilities } from '../model/index.js';
import type { ConnectEnds } from '../view/index.js';

const originalElementFromPoint = document.elementFromPoint.bind(document);
afterEach(() => {
  document.elementFromPoint = originalElementFromPoint;
});

interface Mounted {
  container: HTMLElement;
  gantt: Gantt;
  timeline: HTMLElement;
  log: string[];
  connected: ConnectEnds[];
}

function mount(options: { handles?: boolean; capabilities?: Capabilities } = {}): Mounted {
  const { handles = true, capabilities } = options;
  const log: string[] = [];
  const connected: ConnectEnds[] = [];
  const plugins: ChromePlugin[] = handles
    ? [
        definePlugin({
          id: 'demo.connect',
          view(ctx) {
            ctx.view.onConnect((ends) => {
              log.push('handler');
              connected.push(ends);
            });
          },
        }),
      ]
    : [];
  const container = document.createElement('div');
  const dataset = new Dataset({
    timeZone: 'UTC',
    entries: [
      { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03' },
      { id: 'b', name: 'B', start: '2026-01-04', end: '2026-01-06' },
    ],
  });
  const gantt = new Gantt({
    container,
    dataset,
    plugins,
    ...(capabilities === undefined ? {} : { capabilities }),
  });
  gantt.on('beforeConnect', () => {
    log.push('beforeConnect');
  });
  gantt.on('connect', () => {
    log.push('connect');
  });
  const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
  timeline.setPointerCapture = () => undefined;
  timeline.releasePointerCapture = () => undefined;
  return { container, gantt, timeline, log, connected };
}

const barOf = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.fg-bar[data-bar-id^="${id}"]`)!;
const ports = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.fg-connector-port')).filter((port) => !port.hidden);
/** During a drag every connectable bar shows its ports, in bar order. `barIndex` picks the bar. */
const portAt = (container: HTMLElement, edge: 'start' | 'end', barIndex = 0): HTMLElement =>
  ports(container).filter((port) => port.dataset['edge'] === edge)[barIndex]!;

function pointer(type: string, clientX: number): PointerEvent {
  return new PointerEvent(type, { clientX, clientY: 5, pointerId: 1, bubbles: true });
}

/** The pointer is over `element` for as long as `over` returns it. */
function pointerOver(over: () => Element | null): void {
  document.elementFromPoint = () => over();
}

function hover(m: Mounted, id: string): void {
  pointerOver(() => barOf(m.container, id));
  m.timeline.dispatchEvent(pointer('pointermove', 1));
}

/** Presses A's end port, drags onto B's start port and drops. */
function dragAEndToBStart(m: Mounted): void {
  hover(m, 'a');
  const aEnd = portAt(m.container, 'end');
  pointerOver(() => aEnd);
  m.timeline.dispatchEvent(pointer('pointerdown', 2));
  pointerOver(() => barOf(m.container, 'b'));
  m.timeline.dispatchEvent(pointer('pointermove', 40)); // arms; every connectable bar shows its ports
  const bStart = portAt(m.container, 'start', 1);
  pointerOver(() => bStart);
  m.timeline.dispatchEvent(pointer('pointermove', 41));
  m.timeline.dispatchEvent(pointer('pointerup', 41));
}

describe('connect gesture — installed', () => {
  it('shows a port at each edge of the hovered bar', () => {
    const m = mount();

    hover(m, 'a');

    expect(ports(m.container).map((port) => port.dataset['edge'])).toEqual(['start', 'end']);
    m.gantt.destroy();
  });

  it('runs beforeConnect, then the handler, then connect, with the two ends', () => {
    const m = mount();

    dragAEndToBStart(m);

    expect(m.log).toEqual(['beforeConnect', 'handler', 'connect']);
    expect(m.connected).toEqual([
      { from: { entryId: 'a', edge: 'end' }, to: { entryId: 'b', edge: 'start' } },
    ]);
    m.gantt.destroy();
  });

  it('a drop on the body of another bar connects, and the drag outlines that bar', () => {
    const m = mount();
    hover(m, 'a');
    pointerOver(() => portAt(m.container, 'end'));
    m.timeline.dispatchEvent(pointer('pointerdown', 2));
    pointerOver(() => barOf(m.container, 'b'));
    m.timeline.dispatchEvent(pointer('pointermove', 40));

    const outline = m.container.querySelector<HTMLElement>('.fg-connect-target')!;
    expect(outline.hidden).toBe(false);
    expect(ports(m.container)).toHaveLength(4);

    m.timeline.dispatchEvent(pointer('pointerup', 40));
    expect(m.connected).toHaveLength(1);
    expect(m.connected[0]?.to.entryId).toBe('b');
    m.gantt.destroy();
  });

  it('a veto from beforeConnect runs no handler', () => {
    const m = mount();
    m.gantt.on('beforeConnect', () => false);

    dragAEndToBStart(m);

    expect(m.log).toEqual(['beforeConnect']);
    m.gantt.destroy();
  });

  it('draws the preview line during the drag and parks it after the drop', () => {
    const m = mount();
    hover(m, 'a');
    pointerOver(() => portAt(m.container, 'end'));
    m.timeline.dispatchEvent(pointer('pointerdown', 2));
    pointerOver(() => barOf(m.container, 'b'));
    m.timeline.dispatchEvent(pointer('pointermove', 40));

    const preview = m.container.querySelector<SVGElement>('.fg-connect-preview')!;
    expect(preview.hasAttribute('hidden')).toBe(false);

    pointerOver(() => null);
    m.timeline.dispatchEvent(pointer('pointerup', 40));
    expect(preview.hasAttribute('hidden')).toBe(true);
    m.gantt.destroy();
  });

  it('a read-only Entry shows no port, and one resolution gates the port and the drag', () => {
    const m = mount({ capabilities: { connect: (entry) => entry.id !== 'a' } });

    hover(m, 'a');
    expect(ports(m.container)).toEqual([]);

    // A press where A's port would be starts no connect drag.
    pointerOver(() => barOf(m.container, 'a'));
    m.timeline.dispatchEvent(pointer('pointerdown', 2));
    m.timeline.dispatchEvent(pointer('pointermove', 40));
    m.timeline.dispatchEvent(pointer('pointerup', 40));
    expect(m.log).toEqual([]);

    hover(m, 'b');
    expect(ports(m.container)).toHaveLength(2);
    m.gantt.destroy();
  });
});

describe('connect gesture — not installed', () => {
  it('builds no port, no preview line, and fires no event', () => {
    const m = mount({ handles: false });

    hover(m, 'a');
    pointerOver(() => barOf(m.container, 'a'));
    m.timeline.dispatchEvent(pointer('pointerdown', 2));
    m.timeline.dispatchEvent(pointer('pointermove', 40));
    m.timeline.dispatchEvent(pointer('pointerup', 40));

    expect(m.container.querySelector('.fg-connector-port')).toBeNull();
    expect(m.container.querySelector('.fg-connect-preview')).toBeNull();
    expect(m.log).toEqual([]);
    m.gantt.destroy();
  });

  it('removes the ports when the last handler goes away', () => {
    let remove: () => void = () => {};
    const container = document.createElement('div');
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03' }],
    });
    const gantt = new Gantt({
      container,
      dataset,
      plugins: [
        definePlugin({
          id: 'demo.connect',
          view(ctx) {
            remove = ctx.view.onConnect(() => {});
          },
        }),
      ],
    });
    const timeline = container.querySelector<HTMLElement>('.fg-timeline-pane')!;
    pointerOver(() => barOf(container, 'a'));
    timeline.dispatchEvent(pointer('pointermove', 1));
    expect(ports(container)).toHaveLength(2);

    remove();

    expect(ports(container)).toEqual([]);
    gantt.destroy();
  });
});
