import { describe, expect, it } from 'vitest';
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
    expect(paneLayout.panes.grid).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.splitter).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.timeline).toBeInstanceOf(HTMLElement);

    paneLayout.destroy();
  });

  it('[S1-A8] setHeaderBandCount renders one empty .fg-band per band in the spacer (D-S1.12-9)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const spacer = container.querySelector<HTMLElement>('.fg-grid-spacer')!;
    expect(spacer.querySelector('.fg-grid-header')).not.toBeNull();
    expect(spacer.querySelectorAll('.fg-band')).toHaveLength(0);

    paneLayout.setHeaderBandCount(2);
    expect(spacer.querySelectorAll('.fg-band')).toHaveLength(2);
    expect(spacer.querySelector('.fg-grid-header')).not.toBeNull();

    // A no-op when the count is unchanged — it must not remount the bands.
    const bandBefore = spacer.firstElementChild;
    paneLayout.setHeaderBandCount(2);
    expect(spacer.firstElementChild).toBe(bandBefore);

    paneLayout.setHeaderBandCount(1);
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

  it('gridWidth never goes below minGridWidth', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container, gridWidth: 200, minGridWidth: 120 });

    paneLayout.gridWidth = 40;

    expect(paneLayout.gridWidth).toBe(120);
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

  it('destroy() clears the container', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    paneLayout.destroy();
    expect(container.children.length).toBe(0);
  });
});
