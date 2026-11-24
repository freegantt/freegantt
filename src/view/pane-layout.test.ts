import { describe, expect, it, vi } from 'vitest';
import { PaneLayout } from './pane-layout.js';

// getComputedStyle only resolves custom properties on elements connected to the document (jsdom).
function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('PaneLayout', () => {
  it('creates a grid pane, a splitter and a timeline pane inside the container', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });

    expect(container.querySelector('.fg-grid-pane')).not.toBeNull();
    expect(container.querySelector('.fg-splitter')).not.toBeNull();
    expect(container.querySelector('.fg-timeline-pane')).not.toBeNull();
    expect(paneLayout.panes.rows).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.splitter).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.timeline).toBeInstanceOf(HTMLElement);

    paneLayout.destroy();
  });

  it('setHeaderBands renders one empty .fg-band per band in the spacer', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const spacer = container.querySelector<HTMLElement>('.fg-grid-spacer')!;
    expect(spacer.querySelector('.fg-grid-header')).not.toBeNull();
    expect(spacer.querySelectorAll('.fg-band')).toHaveLength(0);

    paneLayout.setHeaderBands([undefined, undefined]);
    expect(spacer.querySelectorAll('.fg-band')).toHaveLength(2);
    expect(spacer.querySelector('.fg-grid-header')).not.toBeNull();

    // A no-op when the stack is unchanged — it must not remount the bands.
    const bandBefore = spacer.firstElementChild;
    paneLayout.setHeaderBands([undefined, undefined]);
    expect(spacer.firstElementChild).toBe(bandBefore);

    // A band with its own height mirrors it, so the grid header and the timeline header agree.
    paneLayout.setHeaderBands([30, 36]);
    const bands = spacer.querySelectorAll<HTMLElement>('.fg-band');
    expect(Array.from(bands).map((band) => band.style.getPropertyValue('--fg-band-height'))).toEqual([
      '30px',
      '36px',
    ]);

    paneLayout.setHeaderBands([undefined]);
    expect(spacer.querySelectorAll('.fg-band')).toHaveLength(1);

    paneLayout.destroy();
  });

  it('the default grid width comes from --fg-grid-pane-width and falls back to 160', () => {
    const withToken = el();
    withToken.style.setProperty('--fg-grid-pane-width', '240px');
    const paneLayoutA = new PaneLayout({ container: withToken });
    expect(paneLayoutA.gridWidth).toBe(240);
    paneLayoutA.destroy();

    const withoutToken = el();
    const paneLayoutB = new PaneLayout({ container: withoutToken });
    expect(paneLayoutB.gridWidth).toBe(160);
    paneLayoutB.destroy();
  });

  it('a constructor gridWidth option overrides the CSS property', () => {
    const container = el();
    container.style.setProperty('--fg-grid-pane-width', '240px');
    const paneLayout = new PaneLayout({ container, gridWidth: 300 });
    expect(paneLayout.gridWidth).toBe(300);
    paneLayout.destroy();
  });

  it('setting gridWidth moves the boundary and remounts no element', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const gridPaneBefore = container.querySelector('.fg-grid-pane');

    paneLayout.gridWidth = 220;

    expect(paneLayout.gridWidth).toBe(220);
    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane).toBe(gridPaneBefore);
    expect(gridPane.style.width).toBe('220px');

    paneLayout.destroy();
  });

  it('a written gridWidth is honoured as given — minGridWidth does not clamp it (#127)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container, gridWidth: 200, minGridWidth: 120 });

    paneLayout.gridWidth = 40;

    expect(paneLayout.gridWidth).toBe(40);
    paneLayout.destroy();
  });

  it('minGridWidth defaults to 40 and is readable back', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    expect(paneLayout.minGridWidth).toBe(40);
    paneLayout.destroy();
  });

  it('minGridWidth is a live setter — it stores the floor without touching the current gridWidth itself', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container, gridWidth: 200 });

    paneLayout.minGridWidth = 120;

    expect(paneLayout.minGridWidth).toBe(120);
    expect(paneLayout.gridWidth).toBe(200);
    paneLayout.destroy();
  });

  it('#126: contentWidth writes --fg-grid-content-width onto the grid pane', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;

    paneLayout.contentWidth = 240;

    expect(getComputedStyle(gridPane).getPropertyValue('--fg-grid-content-width').trim()).toBe('240px');
    paneLayout.destroy();
  });

  it('measureTimelinePane() reports the timeline pane, not the container', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });

    Object.defineProperty(paneLayout.panes.timeline, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(paneLayout.panes.timeline, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(container, 'clientWidth', { value: 999, configurable: true });

    expect(paneLayout.measureTimelinePane()).toEqual({ width: 500, height: 300 });

    paneLayout.destroy();
  });

  describe('publishTimelinePaneBox()', () => {
    function stubTimelineBox(
      paneLayout: PaneLayout,
      box: { left: number; width: number; clientLeft?: number },
    ) {
      const { timeline, fullWidthRowLayer } = paneLayout.panes;
      Object.defineProperty(timeline, 'clientWidth', { value: box.width, configurable: true });
      Object.defineProperty(timeline, 'clientLeft', { value: box.clientLeft ?? 0, configurable: true });
      timeline.getBoundingClientRect = () => ({ left: 10 + box.left }) as DOMRect;
      fullWidthRowLayer.getBoundingClientRect = () => ({ left: 10 }) as DOMRect;
    }

    it('writes the visible left edge and the client width on the full-width row layer', () => {
      const paneLayout = new PaneLayout({ container: el() });
      stubTimelineBox(paneLayout, { left: 164, width: 500 });

      paneLayout.publishTimelinePaneBox();

      const layer = paneLayout.panes.fullWidthRowLayer;
      expect(layer.style.getPropertyValue('--fg-timeline-pane-left')).toBe('164px');
      expect(layer.style.getPropertyValue('--fg-timeline-pane-width')).toBe('500px');
      paneLayout.destroy();
    });

    it('counts a left border of the timeline pane into the left edge', () => {
      const paneLayout = new PaneLayout({ container: el() });
      stubTimelineBox(paneLayout, { left: 164, width: 498, clientLeft: 1 });

      paneLayout.publishTimelinePaneBox();

      const layer = paneLayout.panes.fullWidthRowLayer;
      expect(layer.style.getPropertyValue('--fg-timeline-pane-left')).toBe('165px');
      paneLayout.destroy();
    });

    it('writes nothing while the box is unchanged, and writes again when it changes', () => {
      const paneLayout = new PaneLayout({ container: el() });
      const layer = paneLayout.panes.fullWidthRowLayer;
      const write = vi.spyOn(layer.style, 'setProperty');
      stubTimelineBox(paneLayout, { left: 164, width: 500 });

      paneLayout.publishTimelinePaneBox();
      paneLayout.publishTimelinePaneBox();
      expect(write).toHaveBeenCalledTimes(2);

      stubTimelineBox(paneLayout, { left: 164, width: 480 });
      paneLayout.publishTimelinePaneBox();
      expect(write).toHaveBeenCalledTimes(4);
      expect(layer.style.getPropertyValue('--fg-timeline-pane-width')).toBe('480px');
      paneLayout.destroy();
    });
  });

  it('destroy() clears the container', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    paneLayout.destroy();
    expect(container.children.length).toBe(0);
  });
});
