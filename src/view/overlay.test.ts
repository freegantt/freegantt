import { describe, expect, it, vi } from 'vitest';
import { PaneLayout } from './pane-layout.js';
import { DomOverlay } from './overlay.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

function rect(partial: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {}, ...partial };
}

// happy-dom does no layout (pane-size-attachment.test.ts's own reasoning) — this fake mirrors that
// file's ResizeObserverCtor test seam so DomOverlay's own onResize can be driven synchronously.
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

describe('DomOverlay', () => {
  it('present() mounts above both panes and the handle removes the node', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomOverlay(container, paneLayout.panes.overlay, paneLayout);

    const node = document.createElement('div');
    const handle = overlay.present(node);

    expect(paneLayout.panes.overlay.contains(node)).toBe(true);
    // The overlay layer is appended last — after the grid pane, splitter and timeline pane.
    expect(container.lastElementChild).toBe(paneLayout.panes.overlay);

    handle.detach();
    expect(paneLayout.panes.overlay.contains(node)).toBe(false);
  });

  it('destroy() clears the layer', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomOverlay(container, paneLayout.panes.overlay, paneLayout);
    overlay.present(document.createElement('div'));

    paneLayout.destroy();
    expect(container.contains(paneLayout.panes.overlay)).toBe(false);
    overlay.destroy();
  });

  it('paneBounds reports the grid and timeline pane rects independently (issue #137 F8)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomOverlay(container, paneLayout.panes.overlay, paneLayout);

    const gridPane = container.querySelector<HTMLElement>('.fg-grid-pane')!;
    gridPane.getBoundingClientRect = () =>
      rect({ left: 0, right: 160, top: 0, bottom: 400, width: 160, height: 400 });
    paneLayout.panes.timeline.getBoundingClientRect = () =>
      rect({ left: 160, right: 960, top: 0, bottom: 400, width: 800, height: 400 });

    expect(overlay.paneBounds.grid.right).toBe(160);
    expect(overlay.paneBounds.timeline.left).toBe(160);
  });

  it('render() builds a live node from an ElementDescription through the reconciler (I13)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomOverlay(container, paneLayout.panes.overlay, paneLayout);

    const node = overlay.render({ text: '<script>alert(1)</script>' });
    expect(node.textContent).toBe('<script>alert(1)</script>');
    expect(node.querySelector('script')).toBeNull();
  });

  it('onResize notifies subscribers on a container resize and stops once the last one unsubscribes', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    FakeResizeObserver.instances.length = 0;
    const overlay = new DomOverlay(
      container,
      paneLayout.panes.overlay,
      paneLayout,
      FakeResizeObserver as unknown as typeof ResizeObserver,
    );

    const listener = vi.fn();
    const off = overlay.onResize(listener);
    expect(FakeResizeObserver.instances).toHaveLength(1);

    FakeResizeObserver.instances[0]!.fire();
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    expect(FakeResizeObserver.instances[0]!.targets).toHaveLength(0);
  });
});
