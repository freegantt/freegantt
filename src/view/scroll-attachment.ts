// view/ — the DOM-facing counterpart to layout/viewport/viewport.ts (plans/01 §8.2). The only file
// allowed to touch element scroll (I12) — eslint/rules/no-scroll-outside-scroll-attachment.cjs is scoped
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
  /** Hold this pane's width steady when it shares an axis, so a neighbour's scrollbar cannot move
   *  the date under a given screen x. Called by `GanttShell.render()` beside `writePosition`. */
  reserveScrollbarGutter(): void;
  detach(): void;
}

/** Tolerates the fractional `scrollTop`/`scrollLeft` Chrome and Safari return under fractional
 * device-pixel ratios, and filters redundant writes (D-S1.5-6, §3.3). */
const EPSILON = 1;

/** `view/styles.ts` turns this into `scrollbar-gutter: stable` (#440). */
const SHARED_AXIS_CLASS = 'fg-shared-axis';

/** `element` is the timeline pane: the single native scroller (D-D). The grid pane never scrolls —
 * it follows by transform, which is why there is no second scroller to fall a frame behind. */
export function attachScroll(element: HTMLElement, viewport: Viewport): ScrollAttachment {
  // What `writePosition` itself last pushed into the element — not the model's current target,
  // which may already have moved on to something newer (#131). A model-driven write's own 'scroll'
  // event does not always arrive before the next one: Firefox can deliver it late enough to land
  // after a fresher `panTo` already changed the target, while Chromium/Edge deliver it before. Read
  // that late echo against the live target and it looks like a user grabbing the scrollbar and
  // dragging it back to the old spot — `onNativeScroll` then "honours" it, panning the model
  // straight back to a position nothing asked for. Read it against what this attachment itself last
  // wrote instead, and the echo carries no information: it is confirming a write already accounted
  // for, not reporting a new one.
  let lastWritten: { x: number; y: number } | undefined;

  function target(): { x: number; y: number } {
    // Already the locally clamped position (D-S1.7-2) — this file recomputes nothing.
    const { x, y } = viewport.visible;
    return { x, y };
  }

  function writePosition(): void {
    const to = target();
    if (Math.abs(element.scrollLeft - to.x) >= EPSILON) element.scrollLeft = to.x;
    if (Math.abs(element.scrollTop - to.y) >= EPSILON) element.scrollTop = to.y;
    lastWritten = to;
  }

  // Why two panes on one axis drift apart at the far edge, and why CSS answers it (issue #440).
  //
  // A `ScrollAxis` shares one position, and each bound Gantt clamps it to its own `content - pane`
  // (D-S1.5-1). `TimeScaleModel` already fits density to the narrowest bound pane, so the contents
  // match; the panes do not, because an `overflow: auto` pane that happens to overflow vertically
  // loses its scrollbar's width from `clientWidth`. The narrower pane then has the *larger* maximum,
  // and at the end of the timeline the two panes sit ~15px apart.
  //
  // Neither bound is the fix. The loosest is what ships today and leaves the gap. The tightest would
  // align them by making the last scrollbar's width of content unreachable in the narrow pane, which
  // trades a cosmetic gap for invisible data — and it would delete D-S1.5-1's designed fallback,
  // where the short chart pins and the tall one keeps going (S1.5 README U3). So the divergence goes
  // at its source: every pane on a shared x axis reserves the gutter whether it needs one or not,
  // the widths agree, and one maximum serves both.
  //
  // A lone Gantt keeps its full width, because nothing can disagree with it. A shared *y* axis gets
  // nothing here either: `scrollbar-gutter` reserves the inline-end gutter, which is the vertical
  // scrollbar's. Measured on Chromium 2026-09-19 — `stable` left `clientHeight` untouched. Two panes
  // on a shared y axis can still drift through a horizontal scrollbar changing their heights. That
  // is a different mechanism, and this property does not reach it.
  let gutterReserved: boolean | undefined;

  function reserveScrollbarGutter(): void {
    const shared = viewport.scroll.x.state.bindingCount > 1;
    if (shared === gutterReserved) return;
    gutterReserved = shared;
    element.classList.toggle(SHARED_AXIS_CLASS, shared);
  }

  // element -> model: only when the element differs from the clamped target by >= epsilon, or a
  // model-driven write (which lands exactly on target) would bounce back into another panTo (D-S1.5-6).
  // Also skipped when the element merely still shows what this attachment itself last wrote — see
  // `lastWritten` above.
  function onNativeScroll(): void {
    if (
      lastWritten !== undefined &&
      Math.abs(element.scrollLeft - lastWritten.x) < EPSILON &&
      Math.abs(element.scrollTop - lastWritten.y) < EPSILON
    ) {
      return;
    }
    const to = target();
    if (Math.abs(element.scrollLeft - to.x) < EPSILON && Math.abs(element.scrollTop - to.y) < EPSILON) {
      return;
    }
    // One batch, one notification, even though each axis moves through its own `ScrollAxis` (D-S6-1).
    viewport.batch(() => {
      viewport.scroll.x.panTo(element.scrollLeft);
      viewport.scroll.y.panTo(element.scrollTop);
    });
  }

  element.addEventListener('scroll', onNativeScroll);

  return {
    writePosition,
    reserveScrollbarGutter,
    detach() {
      element.removeEventListener('scroll', onNativeScroll);
    },
  };
}
