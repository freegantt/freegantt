import { describe, expect, it } from 'vitest';
import { resolveViewportGestures } from './viewport-gestures.js';
import { attachWheelNavigation } from './wheel-navigation.js';
import type { WheelNavigationContext } from './wheel-navigation.js';

function pane(left = 10): HTMLElement {
  const node = document.createElement('div');
  node.getBoundingClientRect = () =>
    ({
      left,
      top: 0,
      right: left + 300,
      bottom: 100,
      width: 300,
      height: 100,
      x: left,
      y: 0,
    }) as DOMRect;
  document.body.append(node);
  return node;
}

function makeCtx(overrides: Partial<WheelNavigationContext> = {}): {
  ctx: WheelNavigationContext;
  zoomIns: number[];
  zoomOuts: number[];
  pans: [number, number][];
} {
  const zoomIns: number[] = [];
  const zoomOuts: number[] = [];
  const pans: [number, number][] = [];
  const ctx: WheelNavigationContext = {
    wheelZoomEnabled: () => true,
    wheelPanEnabled: () => true,
    zoomIn: (offsetX) => {
      zoomIns.push(offsetX);
    },
    zoomOut: (offsetX) => {
      zoomOuts.push(offsetX);
    },
    panBy: (dx, dy) => {
      pans.push([dx, dy]);
    },
    ...overrides,
  };
  return { ctx, zoomIns, zoomOuts, pans };
}

function wheel(props: {
  deltaY?: number;
  deltaX?: number;
  clientX?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}): WheelEvent {
  // happy-dom's WheelEvent is not a MouseEvent: ctrlKey/shiftKey/clientX from the init dict
  // are dropped. A real browser WheelEvent inherits them. Tests pin the fields the handler reads.
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: props.deltaY ?? 0,
    deltaX: props.deltaX ?? 0,
  });
  Object.defineProperty(event, 'ctrlKey', { value: props.ctrlKey ?? false });
  Object.defineProperty(event, 'shiftKey', { value: props.shiftKey ?? false });
  Object.defineProperty(event, 'metaKey', { value: props.metaKey ?? false });
  Object.defineProperty(event, 'clientX', { value: props.clientX ?? 0 });
  return event;
}

describe('resolveViewportGestures', () => {
  it('defaults every gesture on', () => {
    expect(resolveViewportGestures(undefined)).toEqual({
      wheelZoom: true,
      wheelPan: true,
      keyboardPan: true,
    });
    expect(resolveViewportGestures({})).toEqual({
      wheelZoom: true,
      wheelPan: true,
      keyboardPan: true,
    });
    expect(resolveViewportGestures(true)).toEqual({
      wheelZoom: true,
      wheelPan: true,
      keyboardPan: true,
    });
  });

  it('false turns every gesture off; a missing flag stays on', () => {
    expect(resolveViewportGestures(false)).toEqual({
      wheelZoom: false,
      wheelPan: false,
      keyboardPan: false,
    });
    expect(resolveViewportGestures({ wheelZoom: false })).toEqual({
      wheelZoom: false,
      wheelPan: true,
      keyboardPan: true,
    });
  });
});

describe('attachWheelNavigation (S3.7, D-S3-14)', () => {
  it('ctrl+wheel zooms in one preset step, anchored at clientX minus the pane left', () => {
    const node = pane();
    const { ctx, zoomIns, zoomOuts, pans } = makeCtx();
    attachWheelNavigation(node, ctx);

    const event = wheel({ ctrlKey: true, deltaY: -100, clientX: 60 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(zoomIns).toEqual([50]);
    expect(zoomOuts).toEqual([]);
    expect(pans).toEqual([]);
    node.remove();
  });

  it("#126: an explicit anchorPane anchors ctrl+wheel zoom on its rect, not the listening pane's", () => {
    const grid = pane(0);
    const timeline = pane(100);
    const { ctx, zoomIns } = makeCtx();
    attachWheelNavigation(grid, ctx, { anchorPane: timeline });

    grid.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 150 }));

    // 150 - timeline.left(100) = 50, not 150 - grid.left(0) = 150.
    expect(zoomIns).toEqual([50]);
    grid.remove();
    timeline.remove();
  });

  it('metaKey (⌘) zooms out the same way as ctrlKey', () => {
    const node = pane();
    const { ctx, zoomIns, zoomOuts } = makeCtx();
    attachWheelNavigation(node, ctx);

    node.dispatchEvent(wheel({ metaKey: true, deltaY: 100, clientX: 10 }));

    expect(zoomOuts).toEqual([0]);
    expect(zoomIns).toEqual([]);
    node.remove();
  });

  it('small wheel deltas accumulate to one preset step', () => {
    const node = pane();
    const { ctx, zoomIns } = makeCtx();
    attachWheelNavigation(node, ctx);

    node.dispatchEvent(wheel({ ctrlKey: true, deltaY: -40, clientX: 10 }));
    expect(zoomIns).toEqual([]);
    node.dispatchEvent(wheel({ ctrlKey: true, deltaY: -60, clientX: 10 }));
    expect(zoomIns).toEqual([0]);
    node.remove();
  });

  it('a large delta steps more than one preset', () => {
    const node = pane();
    const { ctx, zoomOuts } = makeCtx();
    attachWheelNavigation(node, ctx);

    node.dispatchEvent(wheel({ ctrlKey: true, deltaY: 250, clientX: 10 }));

    expect(zoomOuts).toEqual([0, 0]);
    node.remove();
  });

  it('shift+wheel pans horizontally by deltaY when deltaX is 0', () => {
    const node = pane();
    const { ctx, zoomIns, zoomOuts, pans } = makeCtx();
    attachWheelNavigation(node, ctx);

    const event = wheel({ shiftKey: true, deltaY: 40, clientX: 20 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pans).toEqual([[40, 0]]);
    expect(zoomIns).toEqual([]);
    expect(zoomOuts).toEqual([]);
    node.remove();
  });

  it('ctrl+shift+wheel zooms rather than pans', () => {
    const node = pane();
    const { ctx, zoomIns, pans } = makeCtx();
    attachWheelNavigation(node, ctx);

    node.dispatchEvent(wheel({ ctrlKey: true, shiftKey: true, deltaY: -100, clientX: 10 }));

    expect(zoomIns).toHaveLength(1);
    expect(pans).toEqual([]);
    node.remove();
  });

  it('a plain wheel writes nothing (native scroll owns it)', () => {
    const node = pane();
    const { ctx, zoomIns, zoomOuts, pans } = makeCtx();
    attachWheelNavigation(node, ctx);

    const event = wheel({ deltaY: 80 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(zoomIns).toEqual([]);
    expect(zoomOuts).toEqual([]);
    expect(pans).toEqual([]);
    node.remove();
  });

  it('#126: forwardPlainWheel pans by deltaY when nothing else claims the event', () => {
    const node = pane();
    const { ctx, pans } = makeCtx();
    attachWheelNavigation(node, ctx, { forwardPlainWheel: true });

    const event = wheel({ deltaY: 80 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(pans).toEqual([[0, 80]]);
    node.remove();
  });

  it('#126: forwardPlainWheel still lets shift+wheel and ctrl+wheel take priority', () => {
    const node = pane();
    const { ctx, zoomIns, pans } = makeCtx();
    attachWheelNavigation(node, ctx, { forwardPlainWheel: true });

    node.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 10 }));
    expect(zoomIns).toEqual([0]);
    expect(pans).toEqual([]);

    node.dispatchEvent(wheel({ shiftKey: true, deltaY: 40 }));
    expect(pans).toEqual([[40, 0]]);
    node.remove();
  });

  it("#126: forwardPlainWheel leaves a pure horizontal wheel to the grid pane's own native scroller", () => {
    const node = pane();
    const { ctx, pans } = makeCtx();
    attachWheelNavigation(node, ctx, { forwardPlainWheel: true });

    const event = wheel({ deltaX: 40 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    node.remove();
  });

  it('#126: forwardPlainWheel respects wheelPanEnabled() === false', () => {
    const node = pane();
    const { ctx, pans } = makeCtx({ wheelPanEnabled: () => false });
    attachWheelNavigation(node, ctx, { forwardPlainWheel: true });

    const event = wheel({ deltaY: 80 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(pans).toEqual([]);
    node.remove();
  });

  it('wheelZoomEnabled false leaves ctrl+wheel to the browser', () => {
    const node = pane();
    const { ctx, zoomIns } = makeCtx({ wheelZoomEnabled: () => false });
    attachWheelNavigation(node, ctx);

    const event = wheel({ ctrlKey: true, deltaY: -100, clientX: 10 });
    node.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(zoomIns).toEqual([]);
    node.remove();
  });

  it('detach() stops further zoom and pan', () => {
    const node = pane();
    const { ctx, zoomIns, zoomOuts, pans } = makeCtx();
    const attachment = attachWheelNavigation(node, ctx);
    attachment.detach();

    node.dispatchEvent(wheel({ ctrlKey: true, deltaY: -100, clientX: 10 }));
    node.dispatchEvent(wheel({ shiftKey: true, deltaY: 40 }));

    expect(zoomIns).toEqual([]);
    expect(zoomOuts).toEqual([]);
    expect(pans).toEqual([]);
    node.remove();
  });
});
