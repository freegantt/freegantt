// view/ — the DOM-facing counterpart to layout/viewport/viewport.ts (plans/01 §8.2). The only file
// allowed to touch element scroll (I12) — eslint/rules/no-scroll-outside-scroll-model.cjs is scoped
// to exempt this file and no other.
//
// Owns no binding (S1.7, D-S1.7-1): Viewport already binds scale and scroll in one place. This file
// only reads viewport.visible (already locally clamped, D-S1.7-2) and writes/reads the element.

import type { Viewport } from '../layout/index.js';

export interface ScrollAttachment {
  /** Write the viewport's clamped position into the element. Called by `GanttShell.render()`
   *  AFTER `backend.sync()` — the content layer must be the new size before a position write is
   *  meaningful (D-S1.5-7, now visible in the shell instead of hidden in a reaction). */
  writePosition(): void;
  detach(): void;
}

/** Tolerates the fractional `scrollTop`/`scrollLeft` Chrome and Safari return under fractional
 * device-pixel ratios, and filters redundant writes (D-S1.5-6, §3.3). */
const EPSILON = 1;

/** `element` is the timeline pane: the single native scroller (D-D). The grid pane never scrolls —
 * it follows by transform, which is why there is no second scroller to fall a frame behind. */
export function attachScroll(element: HTMLElement, viewport: Viewport): ScrollAttachment {
  function target(): { x: number; y: number } {
    // Already the locally clamped position (D-S1.7-2) — this file recomputes nothing.
    const { x, y } = viewport.visible;
    return { x, y };
  }

  function writePosition(): void {
    const to = target();
    if (Math.abs(element.scrollLeft - to.x) >= EPSILON) element.scrollLeft = to.x;
    if (Math.abs(element.scrollTop - to.y) >= EPSILON) element.scrollTop = to.y;
  }

  // element -> model: only when the element differs from the clamped target by >= epsilon, or a
  // model-driven write (which lands exactly on target) would bounce back into another panTo (D-S1.5-6).
  function onNativeScroll(): void {
    const to = target();
    if (Math.abs(element.scrollLeft - to.x) < EPSILON && Math.abs(element.scrollTop - to.y) < EPSILON) {
      return;
    }
    viewport.scroll.panTo({ x: element.scrollLeft, y: element.scrollTop });
  }

  element.addEventListener('scroll', onNativeScroll);

  return {
    writePosition,
    detach() {
      element.removeEventListener('scroll', onNativeScroll);
    },
  };
}
