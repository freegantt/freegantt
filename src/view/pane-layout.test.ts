import { describe, expect, it } from 'vitest';
import { PaneLayout } from './pane-layout.js';

// getComputedStyle only resolves custom properties on elements connected to the document (jsdom).
function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('PaneLayout', () => {
  it('creates a grid pane, a splitter and a timeline pane inside the host', () => {
    const host = el();
    const paneLayout = new PaneLayout({ host });

    expect(host.querySelector('.fg-grid-pane')).not.toBeNull();
    expect(host.querySelector('.fg-splitter')).not.toBeNull();
    expect(host.querySelector('.fg-timeline-pane')).not.toBeNull();
    expect(paneLayout.panes.grid).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.splitter).toBeInstanceOf(HTMLElement);
    expect(paneLayout.panes.timeline).toBeInstanceOf(HTMLElement);

    paneLayout.destroy();
  });

  it('the grid pane carries a header spacer sized from --fg-header-height', () => {
    const host = el();
    host.style.setProperty('--fg-header-height', '30px');
    const paneLayout = new PaneLayout({ host });

    const spacer = host.querySelector<HTMLElement>('.fg-grid-spacer')!;
    expect(spacer.style.height).toBe('30px');

    paneLayout.destroy();
  });

  it('the default grid width comes from --fg-grid-pane-width and falls back to 160', () => {
    const withToken = el();
    withToken.style.setProperty('--fg-grid-pane-width', '240px');
    const paneLayoutA = new PaneLayout({ host: withToken });
    expect(paneLayoutA.gridWidth).toBe(240);
    paneLayoutA.destroy();

    const withoutToken = el();
    const paneLayoutB = new PaneLayout({ host: withoutToken });
    expect(paneLayoutB.gridWidth).toBe(160);
    paneLayoutB.destroy();
  });

  it('a constructor gridWidth option overrides the CSS property', () => {
    const host = el();
    host.style.setProperty('--fg-grid-pane-width', '240px');
    const paneLayout = new PaneLayout({ host, gridWidth: 300 });
    expect(paneLayout.gridWidth).toBe(300);
    paneLayout.destroy();
  });

  it('setting gridWidth moves the boundary and remounts no element', () => {
    const host = el();
    const paneLayout = new PaneLayout({ host });
    const gridPaneBefore = host.querySelector('.fg-grid-pane');

    paneLayout.gridWidth = 220;

    expect(paneLayout.gridWidth).toBe(220);
    const gridPane = host.querySelector<HTMLElement>('.fg-grid-pane')!;
    expect(gridPane).toBe(gridPaneBefore);
    expect(gridPane.style.width).toBe('220px');

    paneLayout.destroy();
  });

  it('gridWidth never goes below minGridWidth', () => {
    const host = el();
    const paneLayout = new PaneLayout({ host, gridWidth: 200, minGridWidth: 120 });

    paneLayout.gridWidth = 40;

    expect(paneLayout.gridWidth).toBe(120);
    paneLayout.destroy();
  });

  it('measureTimelinePane() reports the timeline pane, not the host', () => {
    const host = el();
    const paneLayout = new PaneLayout({ host });

    Object.defineProperty(paneLayout.panes.timeline, 'clientWidth', { value: 500, configurable: true });
    Object.defineProperty(paneLayout.panes.timeline, 'clientHeight', { value: 300, configurable: true });
    Object.defineProperty(host, 'clientWidth', { value: 999, configurable: true });

    expect(paneLayout.measureTimelinePane()).toEqual({ width: 500, height: 300 });

    paneLayout.destroy();
  });

  it('destroy() clears the host', () => {
    const host = el();
    const paneLayout = new PaneLayout({ host });
    paneLayout.destroy();
    expect(host.children.length).toBe(0);
  });
});
