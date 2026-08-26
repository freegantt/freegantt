import { describe, expect, it } from 'vitest';
import { attachPaneSize } from './pane-size-attachment.js';
import type { Size } from '../model/index.js';

// happy-dom does no layout (plans/s1.7-windowed-frame/README.md, #8's Tests section), so a real
// ResizeObserver never fires here. This fake is the test seam attachPaneSize's third parameter
// exists for: it records every observed target and lets a test fire a box synchronously.
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

  unobserve(target: Element): void {
    this.targets.splice(this.targets.indexOf(target), 1);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  /** Test-only: deliver one callback tick carrying the given content-box sizes, one per box.
   *  A no-op once nothing is observed — matching a real, disconnected ResizeObserver. */
  fire(...boxes: Size[]): void {
    if (this.targets.length === 0) return;
    const entries = boxes.map(
      (box) =>
        ({
          target: this.targets[0]!,
          contentBoxSize: [{ inlineSize: box.width, blockSize: box.height }],
          contentRect: { ...box, x: 0, y: 0, top: 0, left: 0, right: box.width, bottom: box.height },
        }) as unknown as ResizeObserverEntry,
    );
    this.#callback(entries, this);
  }
}

function el(): HTMLElement {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
}

describe('attachPaneSize', () => {
  it('delivers the observed content-box size to the callback', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    const sizes: Size[] = [];
    attachPaneSize(container, (size) => sizes.push(size), FakeResizeObserver);

    FakeResizeObserver.instances[0]!.fire({ width: 400, height: 300 });

    expect(sizes).toEqual([{ width: 400, height: 300 }]);
  });

  it('coalesces several entries in one callback tick to the last box', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    const sizes: Size[] = [];
    attachPaneSize(container, (size) => sizes.push(size), FakeResizeObserver);

    FakeResizeObserver.instances[0]!.fire({ width: 100, height: 100 }, { width: 200, height: 150 });

    expect(sizes).toEqual([{ width: 200, height: 150 }]);
  });

  it('does not dedupe — an unchanged box is reported again (the models own that contract)', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    const sizes: Size[] = [];
    attachPaneSize(container, (size) => sizes.push(size), FakeResizeObserver);

    FakeResizeObserver.instances[0]!.fire({ width: 400, height: 300 });
    FakeResizeObserver.instances[0]!.fire({ width: 400, height: 300 });

    expect(sizes).toEqual([
      { width: 400, height: 300 },
      { width: 400, height: 300 },
    ]);
  });

  it('detach() stops further callbacks', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    const sizes: Size[] = [];
    const attachment = attachPaneSize(container, (size) => sizes.push(size), FakeResizeObserver);

    attachment.detach();
    FakeResizeObserver.instances[0]!.fire({ width: 400, height: 300 });

    expect(sizes).toEqual([]);
  });

  it('a container removed from the document without detach() neither throws nor leaks', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    attachPaneSize(container, () => {}, FakeResizeObserver);

    expect(() => container.remove()).not.toThrow();
    // The observer is still live (no detach() was called) — firing it after removal is exactly
    // what a real ResizeObserver can still do for a just-unmounted element, and it must not throw.
    expect(() => FakeResizeObserver.instances[0]!.fire({ width: 0, height: 0 })).not.toThrow();
  });

  it('observes exactly the container, once', () => {
    FakeResizeObserver.instances = [];
    const container = el();
    attachPaneSize(container, () => {}, FakeResizeObserver);

    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0]!.targets).toEqual([container]);
  });
});
