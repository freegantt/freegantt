// view/ — ctrl/⌘+wheel anchored zoom and shift+wheel pan (S3.7, D-S3-14). Writes no dataset.
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

export function attachWheelNavigation(
  pane: HTMLElement,
  ctx: WheelNavigationContext,
): WheelNavigationAttachment {
  let zoomRemainderPx = 0;

  function onWheel(e: WheelEvent): void {
    if ((e.ctrlKey || e.metaKey) && ctx.wheelZoomEnabled()) {
      e.preventDefault();
      const offsetX = e.clientX - pane.getBoundingClientRect().left;
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
    }
  }

  pane.addEventListener('wheel', onWheel, { passive: false });

  return {
    detach(): void {
      pane.removeEventListener('wheel', onWheel);
    },
  };
}
