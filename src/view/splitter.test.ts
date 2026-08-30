import { describe, expect, it, vi } from 'vitest';
import { attachSplitter } from './splitter.js';
import type { SplitterContext } from './splitter.js';

// happy-dom's pointer-capture methods are not layout-backed; stubbed here the same way other DOM
// suites in this repo stub browser primitives happy-dom does not implement (pane-size-attachment.test.ts).
function stubPointerCapture(el: HTMLElement): { releasePointerCapture: ReturnType<typeof vi.fn> } {
  el.setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  el.releasePointerCapture = releasePointerCapture;
  return { releasePointerCapture };
}

function down(x: number): PointerEvent {
  return new PointerEvent('pointerdown', { clientX: x, pointerId: 1 });
}
function move(x: number): PointerEvent {
  return new PointerEvent('pointermove', { clientX: x, pointerId: 1 });
}
function up(x: number): PointerEvent {
  return new PointerEvent('pointerup', { clientX: x, pointerId: 1 });
}

describe('attachSplitter', () => {
  it('previews widths during a drag and commits on pointerup', () => {
    const handle = document.createElement('div');
    stubPointerCapture(handle);
    const previews: number[] = [];
    const commits: number[] = [];
    const hooks: SplitterContext = {
      readGridWidth: () => 200,
      previewGridWidth: (px) => previews.push(px),
      commitGridWidth: (px) => commits.push(px),
    };
    const attachment = attachSplitter(handle, hooks);

    handle.dispatchEvent(down(100));
    handle.dispatchEvent(move(140));
    handle.dispatchEvent(up(150));

    expect(previews).toEqual([240]);
    expect(commits).toEqual([250]);

    attachment.detach();
  });

  it('Escape restores the width at drag start and commits nothing (U5)', () => {
    const handle = document.createElement('div');
    stubPointerCapture(handle);
    const previews: number[] = [];
    const commits: number[] = [];
    const hooks: SplitterContext = {
      readGridWidth: () => 200,
      previewGridWidth: (px) => previews.push(px),
      commitGridWidth: (px) => commits.push(px),
    };
    const attachment = attachSplitter(handle, hooks);

    handle.dispatchEvent(down(100));
    handle.dispatchEvent(move(140));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    handle.dispatchEvent(up(150));

    expect(previews).toEqual([240, 200]);
    expect(commits).toEqual([]);

    attachment.detach();
  });

  it('detach() releases pointer capture and removes every listener', () => {
    const handle = document.createElement('div');
    const { releasePointerCapture } = stubPointerCapture(handle);
    const previews: number[] = [];
    const commits: number[] = [];
    const hooks: SplitterContext = {
      readGridWidth: () => 200,
      previewGridWidth: (px) => previews.push(px),
      commitGridWidth: (px) => commits.push(px),
    };
    const attachment = attachSplitter(handle, hooks);

    handle.dispatchEvent(down(100));
    attachment.detach();
    expect(releasePointerCapture).toHaveBeenCalled();

    handle.dispatchEvent(move(200));
    handle.dispatchEvent(up(200));

    expect(previews).toEqual([]);
    expect(commits).toEqual([]);
  });
});
