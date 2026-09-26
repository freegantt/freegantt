// view/ — ctrl/⌘+wheel anchored zoom and shift+wheel pan (S3.7). Writes no dataset.
// Lives here, not in interaction/: those controllers own data gestures. I12: this file never
// reads element scroll; it asks the context to zoom and pan through the bound Viewport.
// Wheel zoom steps `zoomIn`/`zoomOut` (the same ladder the toolbar uses). Continuous `zoomBy`
// stays on the imperative surface; it stretches ticks without changing the preset.

export interface WheelNavigationAttachment {
  detach(): void;
}

export interface WheelNavigationContext {
  wheelZoomEnabled(): boolean;
  wheelPanEnabled(): boolean;
  zoomIn(offsetX: number): void;
  zoomOut(offsetX: number): void;
  panBy(dx: number, dy: number): void;
}

/** One mouse-wheel notch is typically 100 CSS px (`deltaMode === 0`). That is one preset step. */
const WHEEL_PX_PER_PRESET_STEP = 100;

/** `WheelEvent.deltaMode === 1` (DOM_DELTA_LINE). One line ≈ 16 CSS px. */
const WHEEL_LINE_PX = 16;
/** `WheelEvent.deltaMode === 2` (DOM_DELTA_PAGE). Used only to keep pan in px. */
const WHEEL_PAGE_PX = 800;

function deltaPx(e: WheelEvent, axis: 'x' | 'y'): number {
  const delta = axis === 'x' ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) return delta * WHEEL_LINE_PX;
  if (e.deltaMode === 2) return delta * WHEEL_PAGE_PX;
  return delta;
}

export interface WheelNavigationOptions {
  /** The pane whose rect anchors a ctrl/⌘+wheel zoom's offsetX. Default `pane` — pass the
   *  timeline pane explicitly when `pane` is the grid pane, whose own x-axis is not time and so
   *  cannot anchor a time-scale zoom. */
  anchorPane?: HTMLElement;
  /** #126: `pane` has no native *vertical* scroll of its own (the grid pane) and so
   *  needs a plain, unmodified wheel's vertical component forwarded into `ctx.panBy` — the
   *  timeline pane does not set this: it is a real native scroller, and a plain wheel there is
   *  already the browser's own `scroll` event (`scroll-attachment.ts`), so forwarding it too would
   *  double-handle the same gesture. A pure horizontal delta (deltaY === 0) is left alone even
   *  when this is `true`: the grid pane is its own real horizontal scroller, so plain
   *  horizontal wheel already reaches it as the browser's native `scroll` event. Default `false`. */
  forwardPlainWheel?: boolean;
}

export function attachWheelNavigation(
  pane: HTMLElement,
  ctx: WheelNavigationContext,
  options: WheelNavigationOptions = {},
): WheelNavigationAttachment {
  const anchorPane = options.anchorPane ?? pane;
  const forwardPlainWheel = options.forwardPlainWheel ?? false;
  let zoomRemainderPx = 0;

  function onWheel(e: WheelEvent): void {
    if ((e.ctrlKey || e.metaKey) && ctx.wheelZoomEnabled()) {
      e.preventDefault();
      const offsetX = e.clientX - anchorPane.getBoundingClientRect().left;
      const dy = deltaPx(e, 'y');
      if (dy === 0) return;
      if (zoomRemainderPx !== 0 && Math.sign(dy) !== Math.sign(zoomRemainderPx)) {
        zoomRemainderPx = 0;
      }
      zoomRemainderPx += dy;
      while (zoomRemainderPx <= -WHEEL_PX_PER_PRESET_STEP) {
        ctx.zoomIn(offsetX);
        zoomRemainderPx += WHEEL_PX_PER_PRESET_STEP;
      }
      while (zoomRemainderPx >= WHEEL_PX_PER_PRESET_STEP) {
        ctx.zoomOut(offsetX);
        zoomRemainderPx -= WHEEL_PX_PER_PRESET_STEP;
      }
      return;
    }
    zoomRemainderPx = 0;
    if (e.shiftKey && ctx.wheelPanEnabled()) {
      e.preventDefault();
      const alongX = deltaPx(e, 'x');
      ctx.panBy(alongX !== 0 ? alongX : deltaPx(e, 'y'), 0);
      return;
    }
    if (forwardPlainWheel && ctx.wheelPanEnabled()) {
      const dy = deltaPx(e, 'y');
      if (dy === 0) return;
      e.preventDefault();
      ctx.panBy(0, dy);
    }
  }

  pane.addEventListener('wheel', onWheel, { passive: false });

  return {
    detach(): void {
      pane.removeEventListener('wheel', onWheel);
    },
  };
}
