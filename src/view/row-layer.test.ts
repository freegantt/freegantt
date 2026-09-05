import { describe, expect, it } from 'vitest';
import { PaneLayout } from './pane-layout.js';
import { DomRowLayer } from './row-layer.js';

function mountContainer(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('DomRowLayer (#158)', () => {
  it('present() mounts beside the rows, and the disposer removes the node', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    const rowLayer = new DomRowLayer(paneLayout.panes.grid);

    const editor = document.createElement('div');
    const unmount = rowLayer.present(editor);

    // In the layer the pane's own scroll transform moves — not the overlay, and not a row.
    expect(editor.parentElement).toBe(container.querySelector('.fg-rows'));
    expect(container.querySelector('.fg-overlay')!.contains(editor)).toBe(false);
    expect(editor.closest('.fg-row')).toBeNull();

    unmount();
    expect(editor.isConnected).toBe(false);
    container.remove();
  });

  it('the layer that moves is the one a mounted editor measures against (GanttDom.rowLayerBounds)', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });

    // `paneBounds().grid` is the pane's own fixed box; the row layer is the box that scrolls under
    // it. Positioning against the wrong one is exactly what #158 was.
    expect(paneLayout.rowLayerBounds()).not.toBe(paneLayout.paneBounds().grid);
    container.remove();
  });
});
