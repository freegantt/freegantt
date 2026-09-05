import { describe, expect, it, vi } from 'vitest';
import { PaneLayout } from './pane-layout.js';
import { DomOverlay } from './overlay.js';

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
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
    const overlay = new DomOverlay(container, paneLayout.panes.overlay);

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
    const overlay = new DomOverlay(container, paneLayout.panes.overlay);
    overlay.present(document.createElement('div'));

    paneLayout.destroy();
    expect(container.contains(paneLayout.panes.overlay)).toBe(false);
    overlay.destroy();
  });

  it('render() builds a live node from an ElementDescription through the reconciler (I13)', () => {
    const container = el();
    const paneLayout = new PaneLayout({ container });
    const overlay = new DomOverlay(container, paneLayout.panes.overlay);

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
