// interaction/ — the low-level pointer-drag primitive `entry-gestures.ts` drives (plans/03 §S3,
// D-S3-5): threshold, pointer capture, Escape-cancel, and touch long-press (D-S3-21). Knows nothing
// about entries, drafts or gestures — `start`/`move`/`commit`/`cancel` are plain callbacks, so this
// file stays reusable for any future drag (resize, S3.4) over the same shape.
//
// Owns no DOM listeners of its own: `entry-gestures.ts` feeds it every pointer/keyboard event from
// its own one pointer stream (the file comment there explains why — a pointerdown that becomes a
// drag must never also change the selection).

/** A mouse/pen drag arms once movement crosses `DRAG_THRESHOLD_PX`; a touch drag arms only after
 *  `LONG_PRESS_MS` holds still, so a finger can still scroll a dense chart (D-S3-21). */
const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 400;

export interface PointerGestureCallbacks {
  /** Called once, when the gesture arms. Returning `false` refuses arming — the caller's own
   *  pointerup still runs its click path, exactly as if no drag had been attempted. */
  start(e: PointerEvent): boolean;
  /** Called on every pointer move once armed, with horizontal travel in px since arming's origin. */
  move(e: PointerEvent, dxPx: number): void;
  /** Called once, on pointerup, only when the gesture was armed. */
  commit(e: PointerEvent, dxPx: number): void;
  /** Called once, on Escape or pointercancel, only when the gesture was armed. */
  cancel(): void;
}

export interface PointerGestureController {
  /** Feed a pointerdown that might start this gesture. */
  down(e: PointerEvent): void;
  /** Feed a pointermove for the same pointer. */
  move(e: PointerEvent): void;
  /** Feed a pointerup. Returns `true` when this was a drag (armed and now committed) — the caller
   *  should skip its own click handling for this event. */
  up(e: PointerEvent): boolean;
  /** Feed an Escape keydown. Returns `true` when a drag was in progress and is now cancelled — the
   *  caller should skip its own Escape handling (e.g. clearing the selection) for this event. */
  escape(): boolean;
  /** Feed a `pointercancel` for the same pointer (a touch interrupt, a drag into a scrollbar) — the
   *  one cancel path `start`/`move`/`commit`/`cancel`'s own doc comment already promises but that,
   *  before this method, nothing fed. Same shape as `escape()`: releases capture, forgets state, and
   *  calls `cancel()` only when a drag was actually armed. An unarmed or unrelated pointer is a
   *  no-op. */
  pointercancel(e: PointerEvent): void;
  /** Releases capture and forgets in-flight state, without calling `cancel`. */
  detach(): void;
}

export function createPointerGesture(
  pane: HTMLElement,
  callbacks: PointerGestureCallbacks,
): PointerGestureController {
  let pointerId: number | undefined;
  let originX = 0;
  let armed = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEvent: PointerEvent | undefined;

  function clearLongPress(): void {
    if (longPressTimer !== undefined) clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }

  function reset(): void {
    pointerId = undefined;
    armed = false;
    lastEvent = undefined;
    clearLongPress();
  }

  function arm(e: PointerEvent): boolean {
    if (!callbacks.start(e)) return false;
    armed = true;
    pane.setPointerCapture(e.pointerId);
    return true;
  }

  return {
    down(e: PointerEvent): void {
      if (pointerId !== undefined) return; // one gesture at a time
      pointerId = e.pointerId;
      originX = e.clientX;
      lastEvent = e;
      if (e.pointerType === 'touch') {
        longPressTimer = setTimeout(() => {
          if (lastEvent) arm(lastEvent);
        }, LONG_PRESS_MS);
      }
    },

    move(e: PointerEvent): void {
      if (pointerId === undefined || e.pointerId !== pointerId) return;
      lastEvent = e;
      const dxPx = e.clientX - originX;
      if (!armed) {
        if (e.pointerType === 'touch') return; // waits for the long-press timer instead
        if (Math.abs(dxPx) < DRAG_THRESHOLD_PX) return;
        if (!arm(e)) {
          reset();
          return;
        }
      }
      callbacks.move(e, dxPx);
    },

    up(e: PointerEvent): boolean {
      if (pointerId === undefined || e.pointerId !== pointerId) return false;
      const dxPx = e.clientX - originX;
      const wasArmed = armed;
      if (wasArmed) pane.releasePointerCapture(pointerId);
      reset();
      if (wasArmed) callbacks.commit(e, dxPx);
      return wasArmed;
    },

    escape(): boolean {
      if (!armed || pointerId === undefined) {
        reset();
        return false;
      }
      pane.releasePointerCapture(pointerId);
      reset();
      callbacks.cancel();
      return true;
    },

    pointercancel(e: PointerEvent): void {
      if (pointerId === undefined || e.pointerId !== pointerId) return;
      const wasArmed = armed;
      if (wasArmed) pane.releasePointerCapture(pointerId);
      reset();
      if (wasArmed) callbacks.cancel();
    },

    detach(): void {
      if (armed && pointerId !== undefined) pane.releasePointerCapture(pointerId);
      reset();
    },
  };
}
