// interaction/ — the keyboard half of direct manipulation (plans/s3-direct-manipulation/
// s3.5-keyboard-parity-and-async-veto.md; rescoped S5.11). One keydown listener,
// attached to the timeline pane alone: `ArrowLeft`/`ArrowRight` nudge the picked bar
// (`ctx.session().nudge()`, D-GH-1), and `Shift+ArrowLeft`/`Shift+ArrowRight` resize it. Moving the
// pick between bars, and between rows in the grid pane, is `view/roving-focus.ts`'s job now — this
// file only edits. `interaction/` never resolves a pixel or a snap unit itself: `session().nudge()`
// does that math in `view/`.

import type { Detachable, EntryGesture, EntryGestureContext } from '../view/index.js';

/** `attachKeyboardEditing` refuses off the same `ctx.session()` the pointer path
 *  arms through (I14) — an incapable or already-`pending` grab silently no-ops, same as a
 *  pointer grab on an incapable bar. */
export function attachKeyboardEditing(container: HTMLElement, ctx: EntryGestureContext): Detachable {
  function onKeyDown(e: KeyboardEvent): void {
    const grabbed = ctx.selection.entryIds()[0];
    if (grabbed === undefined) return; // nothing picked — no bar to nudge

    // #212: `Mod+Arrow` steps the Selection between the Entries of one row, and the keymap owns it
    // (`freegantt.selectNextEntry`). A nudge never reads a chord the keymap already answered.
    if (e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const gesture: EntryGesture = e.shiftKey ? { kind: 'resize', edge: 'end' } : { kind: 'move' };
    const session = ctx.session(grabbed, gesture);
    if (!session) return;
    void session.nudge(direction, e.altKey ? { suspendSnap: true } : undefined);
  }

  container.addEventListener('keydown', onKeyDown);

  return {
    detach(): void {
      container.removeEventListener('keydown', onKeyDown);
    },
  };
}
