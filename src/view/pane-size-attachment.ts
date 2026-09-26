// view/ — the DOM-facing sibling of view/scroll-attachment.ts (plans/01 §8.2, S1.7b/#8). The only
// file that observes element size. It reports a box and stops: no pixel math, no scale awareness,
// no knowledge of layout/ internals — which is what keeps I12 whole.

import type { Size } from '../model/index.js';

export interface PaneSizeAttachment {
  detach(): void;
}

/** `container` is the timeline pane (the same element `attachScroll` binds, D-D). `onPaneSize` is called
 *  with the container's content-box size once on observe, and again on every resize the browser reports.
 *
 *  `ResizeObserverCtor` is the test seam: happy-dom does no layout, so a dom test drives this with an
 *  injected fake that fires synchronously (`pane-size-attachment.test.ts`).
 *
 *  No deduping here — notify-iff-changed is the models' own contract (`ViewportHandle.setPaneSize`
 *  → `TimeScaleModel`/`ScrollAxis`). Re-implementing that check here would just be a
 *  second copy that can disagree with the first. */
export function attachPaneSize(
  container: HTMLElement,
  onPaneSize: (size: Size) => void,
  ResizeObserverCtor: typeof ResizeObserver = ResizeObserver,
): PaneSizeAttachment {
  const observer = new ResizeObserverCtor((entries) => {
    // A resize burst can deliver several entries for the same target in one callback tick; only the
    // last reflects the box the browser settled on, so earlier ones are dropped, not summed.
    const last = entries[entries.length - 1];
    if (!last) return;
    const box = last.contentBoxSize?.[0];
    onPaneSize(
      box
        ? { width: box.inlineSize, height: box.blockSize }
        : { width: last.contentRect.width, height: last.contentRect.height },
    );
  });
  observer.observe(container, { box: 'content-box' });

  return {
    detach() {
      observer.disconnect();
    },
  };
}
