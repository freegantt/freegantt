// interaction/ — a grid row drag that reorders or re-parents its Entry (#602). Its own pointer
// stream over the row layer, separate from the bar drag `entry-gestures.ts` runs over the timeline
// pane, so a row grab and a bar grab never race for the same `createPointerGesture` instance.
//
// A reorder writes no date (D2): it drafts the tree only, so an undated Entry — a new task, a
// parent with no dated child — still reorders, and one locked dated descendant never refuses it.

import type { Entry } from '../model/index.js';
import { createPointerGesture } from './pointer-gesture.js';
import type { EntryGestureContext, EntryGestureSession, EntryHit } from '../view/index.js';

/** A control inside a cell keeps its own pointer — a checkbox, a button, an inline editor's own
 *  input. Grabbing here would steal its click. */
const CONTROL_SELECTOR = 'input, textarea, select, button, a[href], [contenteditable="true"]';

function isPrimaryButton(e: Pick<PointerEvent, 'button'>): boolean {
  return e.button === 0;
}

function startedOnControl(e: PointerEvent): boolean {
  return e.target instanceof Element && e.target.closest(CONTROL_SELECTOR) !== null;
}

/** A grid row drag that moves an Entry to another place in the tree. No grip: the whole row is
 *  the handle, past the same 4 px/400 ms threshold a bar drag arms on. */
export interface RowReorderDrag {
  /** Feed a row-layer pointerdown. Grabs the row under the pointer when it may reorder. */
  down(e: PointerEvent): void;
  /** Feed a row-layer pointermove. */
  move(e: PointerEvent): void;
  /** `true` when this pointerup ended a drag — the caller skips its click path. */
  up(e: PointerEvent): boolean;
  /** `true` when an armed drag cancelled — the caller skips its own Escape handling. */
  escape(): boolean;
  /** Feed a row-layer pointercancel. */
  pointercancel(e: PointerEvent): void;
  detach(): void;
}

export function createRowReorderDrag(
  rowLayer: HTMLElement,
  ctx: EntryGestureContext,
  selectGrabbedRow: (hit: EntryHit) => void,
): RowReorderDrag {
  /** The row hit and its subject, set on a pointerdown that may reorder; cleared once the pointer
   *  stream for that grab ends (commit, cancel, or a pointerdown that grabs nothing). */
  let grabbedHit: EntryHit | undefined;
  let subject: Entry | undefined;
  /** What `ctx.session()` armed for this drag — defined only between a successful `start()` and the
   *  matching `commit`/`cancel`. */
  let session: EntryGestureSession | undefined;

  function clearGrab(): void {
    grabbedHit = undefined;
    subject = undefined;
  }

  const drag = createPointerGesture(
    rowLayer,
    {
      start(): boolean {
        if (subject === undefined || grabbedHit === undefined) return false;
        // #211's rule, for a row: a grab on a subject the Selection does not already hold selects
        // what a click on that row would select, before the session reads it.
        if (!ctx.selection.entryIds().includes(subject.id)) selectGrabbedRow(grabbedHit);
        session = ctx.session(subject.id, { kind: 'reorder' });
        return session !== undefined;
      },
      // A reorder ignores travel: the row under the pointer decides the drop, not how far it moved.
      // No `cursorX` either — a reorder has no Cursor line.
      move(e): void {
        session!.preview(0, { contentY: ctx.contentYAtClientY(e.clientY) });
      },
      commit(e): void {
        void session!.commit(0, { contentY: ctx.contentYAtClientY(e.clientY) });
        session = undefined;
        clearGrab();
      },
      cancel(): void {
        session!.cancel();
        session = undefined;
        clearGrab();
      },
    },
    { arm: 'xy' },
  ); // a straight-down pull must arm — a bar move can lock to the row axis, a row drag never does.

  return {
    down(e: PointerEvent): void {
      clearGrab();
      if (isPrimaryButton(e) && !startedOnControl(e)) {
        const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
        // A header row has no subject, so it grabs nothing; neither does a hit on a bar — a bar
        // drag arms its own gesture, over the timeline pane's own pointer stream.
        const candidate = hit?.kind === 'row' ? ctx.subjectEntryOf(hit) : undefined;
        if (candidate !== undefined && ctx.can('reorder', candidate)) {
          grabbedHit = hit;
          subject = candidate;
        }
      }
      drag.down(e); // always, so an unarmed click still resets the pointer machine cleanly.
    },
    move(e: PointerEvent): void {
      drag.move(e);
    },
    up(e: PointerEvent): boolean {
      return drag.up(e);
    },
    escape(): boolean {
      return drag.escape();
    },
    pointercancel(e: PointerEvent): void {
      drag.pointercancel(e);
    },
    detach(): void {
      drag.detach();
    },
  };
}
