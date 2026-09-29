// interaction/ — the low-level pointer-drag primitive `entry-gestures.ts` drives (plans/03 §S3,
// threshold, pointer capture, Escape-cancel, and touch long-press). Knows nothing
// about entries, drafts or gestures — `start`/`move`/`commit`/`cancel` are plain callbacks, so this
// file stays reusable for any future drag (resize, S3.4) over the same shape.
//
// Owns no DOM listeners of its own: `entry-gestures.ts` feeds it every pointer/keyboard event from
// its own one pointer stream (the file comment there explains why — a pointerdown that becomes a
// drag must never also change the selection).

/** A mouse/pen drag arms once movement crosses `DRAG_THRESHOLD_PX`; a touch drag arms only after
 *  `LONG_PRESS_MS` holds still, so a finger can still scroll a dense chart. */
const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 400;

/** Which screen direction a drag committed to at the moment it armed — the larger of `|dx|` and
 *  `|dy|` at that instant wins, a tie picking `'x'`. Decided once and held for the rest of the
 *  drag (#425 owner ruling: "if you start dragging vertically it only allows vertical, and vice
 *  versa"); nothing here re-picks it as the pointer keeps moving. A plain primitive, not an object
 *  per move (I5) — this file knows only screen axes, never which one a caller reads as "time" or
 *  "row". */
export type DragAxis = 'x' | 'y';

function axisFor(dxPx: number, dyPx: number): DragAxis {
  return Math.abs(dyPx) > Math.abs(dxPx) ? 'y' : 'x';
}

/** Is this button event the primary (left-click, touch, pen) one? A right-click and a middle-click
 *  are not (#199/#205). Only a primary button may arm a drag. */
export function isPrimaryButton(e: Pick<PointerEvent, 'button'>): boolean {
  return e.button === 0;
}

export interface PointerGestureCallbacks {
  /** Called once, when the gesture arms. Returning `false` refuses arming — the caller's own
   *  pointerup still runs its click path, exactly as if no drag had been attempted. */
  start(e: PointerEvent): boolean;
  /** Called on every pointer move once armed, with travel in px since arming's origin, each axis,
   *  and the `DragAxis` this drag locked at arm time. */
  move(e: PointerEvent, dxPx: number, dyPx: number, axis: DragAxis): void;
  /** Called once, on pointerup, only when the gesture was armed. */
  commit(e: PointerEvent, dxPx: number, dyPx: number, axis: DragAxis): void;
  /** Called once, on Escape or pointercancel, only when the gesture was armed. */
  cancel(): void;
}

export interface PointerGestureOptions {
  /** Which travel a mouse/pen drag arms on. `'x'` (the default) — the original single-axis rule,
   *  still what a column resize/reorder wants: a mostly-vertical move over a header grip must not
   *  nudge a width or a reorder. `'xy'` arms on travel over either axis, so a row-axis drag (#425)
   *  can arm on a straight-down pull. Touch's long-press arms on time alone, never on travel, so
   *  this option has no touch reading. */
  arm?: 'x' | 'xy';
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
  options: PointerGestureOptions = {},
): PointerGestureController {
  const arm2D = options.arm === 'xy';
  let pointerId: number | undefined;
  let originX = 0;
  let originY = 0;
  let armed = false;
  /** The `DragAxis` this drag locked at arm time. Unread before `armed` is `true`; the value left
   *  over from the previous drag is harmless because nothing consults it until the next `arm()`
   *  overwrites it. */
  let axis: DragAxis = 'x';
  /** True from a touch arm with no travel yet (a still long-press) until the first post-arm move
   *  that has travel picks the real axis. `axisFor(0, 0)` ties to `'x'`, which would wrongly lock a
   *  later straight-down drag onto the time axis — so a still arm defers the pick instead of
   *  guessing. */
  let axisPending = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEvent: PointerEvent | undefined;

  function clearLongPress(): void {
    if (longPressTimer !== undefined) clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }

  function reset(): void {
    pointerId = undefined;
    armed = false;
    axisPending = false;
    lastEvent = undefined;
    clearLongPress();
  }

  /** Arms on `e`, locking `axis` to the travel from `origin` to `at` — `at` is `e` itself for a
   *  mouse/pen arm, and the last-known position for a touch arm, which fires off a timer instead of
   *  a move event. A touch arm with no travel at all defers the pick to `move()`, below. */
  function arm(e: PointerEvent, at: PointerEvent): boolean {
    if (!callbacks.start(e)) return false;
    const dx = at.clientX - originX;
    const dy = at.clientY - originY;
    axisPending = dx === 0 && dy === 0;
    if (!axisPending) axis = axisFor(dx, dy);
    armed = true;
    pane.setPointerCapture(e.pointerId);
    return true;
  }

  return {
    down(e: PointerEvent): void {
      if (pointerId !== undefined) return; // one gesture at a time
      pointerId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      lastEvent = e;
      if (e.pointerType === 'touch') {
        longPressTimer = setTimeout(() => {
          if (lastEvent) arm(lastEvent, lastEvent);
        }, LONG_PRESS_MS);
      }
    },

    move(e: PointerEvent): void {
      if (pointerId === undefined || e.pointerId !== pointerId) return;
      lastEvent = e;
      const dxPx = e.clientX - originX;
      const dyPx = e.clientY - originY;
      if (!armed) {
        if (e.pointerType === 'touch') return; // waits for the long-press timer instead
        const travelPx = arm2D ? Math.hypot(dxPx, dyPx) : Math.abs(dxPx);
        if (travelPx < DRAG_THRESHOLD_PX) return;
        if (!arm(e, e)) {
          reset();
          return;
        }
      } else if (axisPending && (dxPx !== 0 || dyPx !== 0)) {
        axis = axisFor(dxPx, dyPx);
        axisPending = false;
      }
      callbacks.move(e, dxPx, dyPx, axis);
    },

    up(e: PointerEvent): boolean {
      if (pointerId === undefined || e.pointerId !== pointerId) return false;
      const dxPx = e.clientX - originX;
      const dyPx = e.clientY - originY;
      const wasArmed = armed;
      const lockedAxis = axis;
      if (wasArmed) pane.releasePointerCapture(pointerId);
      reset();
      if (wasArmed) callbacks.commit(e, dxPx, dyPx, lockedAxis);
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
