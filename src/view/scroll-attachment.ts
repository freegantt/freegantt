// view/ — the DOM-facing counterpart to layout/viewport/scroll-model.ts (plans/01 §8.2). The only
// file allowed to touch element scroll (I12) — eslint/rules/no-scroll-outside-scroll-model.cjs is
// scoped to exempt this file and no other.

import type { Size } from '../model/index.js';
import { ScrollModel } from '../layout/index.js';

export interface ScrollAttachment {
  /** Post-render extents (`frame.contentWidth`/`contentHeight`). No-ops when unchanged. */
  setContent(size: Size): void;
  /** Measured pane box — pushed by the pane-size attachment (#8). */
  setPane(size: Size): void;
  detach(): void;
}

/** Tolerates the fractional `scrollTop`/`scrollLeft` Chrome and Safari return under fractional
 * device-pixel ratios, and filters redundant writes (D-S1.5-6, §3.3). */
const EPSILON = 1;

/** `element` is the timeline pane: the single native scroller (D-D). The grid pane never scrolls —
 * it follows by transform, which is why there is no second scroller to fall a frame behind.
 *
 * Owns the binding: it binds on attach and unbinds on `detach()`, so element, model and reaction
 * are wired in exactly one place. `onChange` is the host's render — it runs *before* the element
 * is written (D-S1.5-7).
 *
 * `setContent`/`setPane` deliberately mirror `ScrollBindingHandle`: callers hold one object, not
 * two. Do not "simplify" the duplication away. */
export function attachScroll(
  element: HTMLElement,
  scroll: ScrollModel,
  onChange: () => void,
): ScrollAttachment {
  let content: Size = { width: 0, height: 0 };
  let pane: Size = { width: 0, height: 0 };

  // D-S1.5-6: the shared position can sit beyond what this element can show (another, taller-content
  // Gantt is scrolled further). Compare against — and write — what THIS element should be showing,
  // never the raw shared position, or a pinned chart destroys the shared value every frame.
  function mine(): { x: number; y: number } {
    const state = scroll.state;
    const myMaxX = Math.max(0, content.width - pane.width);
    const myMaxY = Math.max(0, content.height - pane.height);
    return {
      x: Math.min(state.position.x, myMaxX),
      y: Math.min(state.position.y, myMaxY),
    };
  }

  function writeElement(): void {
    const target = mine();
    if (Math.abs(element.scrollLeft - target.x) >= EPSILON) element.scrollLeft = target.x;
    if (Math.abs(element.scrollTop - target.y) >= EPSILON) element.scrollTop = target.y;
  }

  function onModelChange(): void {
    // D-S1.5-7: render first — it sizes the content layer — then write the element, or the write
    // lands against a stale content size and the browser clamps it for no reason.
    onChange();
    writeElement();
  }

  const handle = scroll.bind({ content, pane }, onModelChange);

  function onNativeScroll(): void {
    const target = mine();
    if (
      Math.abs(element.scrollLeft - target.x) < EPSILON &&
      Math.abs(element.scrollTop - target.y) < EPSILON
    ) {
      return;
    }
    scroll.panTo({ x: element.scrollLeft, y: element.scrollTop });
  }

  element.addEventListener('scroll', onNativeScroll);

  return {
    setContent(size) {
      if (content.width === size.width && content.height === size.height) return;
      content = size;
      handle.setContent(size);
    },
    setPane(size) {
      if (pane.width === size.width && pane.height === size.height) return;
      pane = size;
      handle.setPane(size);
    },
    detach() {
      element.removeEventListener('scroll', onNativeScroll);
      handle.unbind();
    },
  };
}
