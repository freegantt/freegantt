import { describe, expect, it, vi } from 'vitest';
import { PaneLayout } from './pane-layout.js';
import { ContainerResize, DomMountLayer } from './mount-layer.js';

function mountContainer(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

// happy-dom does no layout (pane-size-attachment.test.ts's own reasoning) — this fake mirrors that
// file's ResizeObserverCtor test seam so ContainerResize can be driven synchronously.
type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly targets: Element[] = [];
  #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    this.targets.length = 0;
  }
  fire(): void {
    this.#callback([], this as unknown as ResizeObserver);
  }
}

describe('the overlay layer (S5.3, D-S5-8)', () => {
  it('present() mounts above both panes, and the disposer removes the node', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomMountLayer(
      paneLayout.panes.overlay,
      () => paneLayout.overlayBounds(),
      new ContainerResize(container),
    );

    const node = document.createElement('div');
    const unmount = overlay.present(node);

    expect(paneLayout.panes.overlay.contains(node)).toBe(true);
    // The overlay layer is appended last — after the grid pane, splitter and timeline pane.
    expect(container.lastElementChild).toBe(paneLayout.panes.overlay);

    unmount();
    expect(paneLayout.panes.overlay.contains(node)).toBe(false);
    container.remove();
  });

  it('bounds reads the layer a caller mounted into, not the container', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomMountLayer(
      paneLayout.panes.overlay,
      () => paneLayout.overlayBounds(),
      new ContainerResize(container),
    );

    // A popup sits at the layer's origin, so the layer's own box is what its transform counts from.
    expect(overlay.bounds).toEqual(paneLayout.overlayBounds());
    container.remove();
  });
});

describe('the row layer (#158)', () => {
  it('present() mounts beside the rows, and the disposer removes the node', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    const rowLayer = new DomMountLayer(
      paneLayout.panes.rows,
      () => paneLayout.rowLayerBounds(),
      new ContainerResize(container),
    );

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

  it('the layer that moves is the one a mounted editor measures against', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    const rowLayer = new DomMountLayer(
      paneLayout.panes.rows,
      () => paneLayout.rowLayerBounds(),
      new ContainerResize(container),
    );

    // `paneBounds().grid` is the pane's own fixed box; the row layer is the box that scrolls under
    // it. Positioning against the wrong one is exactly what #158 was.
    expect(rowLayer.bounds).not.toBe(paneLayout.paneBounds().grid);
    expect(rowLayer.bounds).toEqual(paneLayout.rowLayerBounds());
    container.remove();
  });
});

describe('ContainerResize (issue #137 F9)', () => {
  it('notifies subscribers on a container resize and stops once the last one unsubscribes', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    FakeResizeObserver.instances.length = 0;
    const overlay = new DomMountLayer(
      paneLayout.panes.overlay,
      () => paneLayout.overlayBounds(),
      new ContainerResize(container, FakeResizeObserver as unknown as typeof ResizeObserver),
    );

    const listener = vi.fn();
    const off = overlay.onResize(listener);
    expect(FakeResizeObserver.instances).toHaveLength(1);

    FakeResizeObserver.instances[0]!.fire();
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    expect(FakeResizeObserver.instances[0]!.targets).toHaveLength(0);
    container.remove();
  });

  // #168: the resize signal belongs to whatever a caller mounted into. Both layers hand out the
  // same one, and one observer serves them both.
  it('serves both layers from one observer', () => {
    const container = mountContainer();
    const paneLayout = new PaneLayout({ container });
    FakeResizeObserver.instances.length = 0;
    const resize = new ContainerResize(container, FakeResizeObserver as unknown as typeof ResizeObserver);
    const overlay = new DomMountLayer(paneLayout.panes.overlay, () => paneLayout.overlayBounds(), resize);
    const rowLayer = new DomMountLayer(paneLayout.panes.rows, () => paneLayout.rowLayerBounds(), resize);

    const onOverlay = vi.fn();
    const onRows = vi.fn();
    overlay.onResize(onOverlay);
    rowLayer.onResize(onRows);
    expect(FakeResizeObserver.instances).toHaveLength(1);

    FakeResizeObserver.instances[0]!.fire();
    expect(onOverlay).toHaveBeenCalledTimes(1);
    expect(onRows).toHaveBeenCalledTimes(1);

    resize.destroy();
    expect(FakeResizeObserver.instances[0]!.targets).toHaveLength(0);
    container.remove();
  });
});
