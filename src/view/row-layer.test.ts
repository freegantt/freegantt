import { describe, expect, it, vi } from 'vitest';
import { PaneLayout } from './pane-layout.js';
import { DomRowLayer } from './row-layer.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('DomRowLayer (#158)', () => {
  it('present() mounts beside the rows and the disposer removes the node', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const rowLayer = new DomRowLayer(paneLayout.panes.grid, paneLayout);

    const editor = document.createElement('div');
    const unmount = rowLayer.present(editor);

    // Inside the layer the pane's own scroll transform moves — not the overlay, and not a row.
    expect(editor.parentElement).toBe(container.querySelector('.fg-rows'));
    expect(container.querySelector('.fg-overlay')!.contains(editor)).toBe(false);

    unmount();
    expect(editor.isConnected).toBe(false);
    container.remove();
  });

  it('bounds reads the row layer through PaneLayout, which owns every rect read in view/ (I9)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const spy = vi.spyOn(paneLayout, 'rowLayerBounds');
    const rowLayer = new DomRowLayer(paneLayout.panes.grid, paneLayout);

    void rowLayer.bounds;

    expect(spy).toHaveBeenCalledTimes(1);
    container.remove();
  });
});
