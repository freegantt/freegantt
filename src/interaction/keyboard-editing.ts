// interaction/ — the keyboard half of direct manipulation (plans/s3-direct-manipulation/
// s3.5-keyboard-parity-and-async-veto.md, D-S3-13). One keydown listener, gated on the current
// selection: with something selected, arrows edit the entry (`ctx.session().nudge()`, D-GH-1) or move
// the selection between rows; with nothing selected, arrows are S3.7's to bind (viewport pan) — this
// file only implements the "something selected" column of D-S3-13's table. `interaction/` never
// resolves a pixel or a snap unit itself: `session().nudge()` does that math in `view/`.

import type { EntryId } from '../model/index.js';
import { itemId } from '../model/index.js';
import type { Detachable, EntryGesture, EntryGestureContext } from '../view/index.js';

function canSelect(ctx: EntryGestureContext, id: EntryId): boolean {
  const entry = ctx.entryFor(itemId(id));
  return entry !== undefined && ctx.can('select', entry);
}

/** D-S3-13: `↑`/`↓` move the selection to the nearest `select`-capable row in `direction` over
 *  `selectableEntriesInRowOrder()`; a row with no capable neighbour that way leaves the selection untouched — same
 *  "incapable rows are skipped, not blocking" shape `entry-gestures.ts`'s shift-click range already
 *  uses. */
function moveSelectionRow(ctx: EntryGestureContext, current: EntryId, direction: 1 | -1): void {
  const order = ctx.selection.selectableEntriesInRowOrder();
  let index = order.indexOf(current) + direction;
  while (index >= 0 && index < order.length) {
    const candidate = order[index]!;
    if (canSelect(ctx, candidate)) {
      // #212: a row step names an Entry, and the Selection holds Segments, so it selects every
      // Segment that Entry draws — the same set a grid-row click writes.
      ctx.selection.propose(ctx.selection.segmentIdsOfEntries([candidate]));
      return;
    }
    index += direction;
  }
}

/** D-S3-13, D-S3-9: `attachKeyboardEditing` refuses off the same `ctx.session()` the pointer path
 *  arms through (I14) — an incapable or already-`pending` (D-S3-17) grab silently no-ops, same as a
 *  pointer grab on an incapable bar. */
export function attachKeyboardEditing(container: HTMLElement, ctx: EntryGestureContext): Detachable {
  function onKeyDown(e: KeyboardEvent): void {
    const grabbed = ctx.selection.entryIds()[0];
    if (grabbed === undefined) return; // D-S3-13: nothing selected — S3.7 owns the pan bindings

    // #212: `Mod+Arrow` steps the Selection between the Segments of one row, and the keymap owns it
    // (`freegantt.selectNextSegment`). A nudge never reads a chord the keymap already answered.
    if (e.ctrlKey || e.metaKey) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelectionRow(ctx, grabbed, e.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (e.key === '*' || (e.key === '8' && e.shiftKey)) {
      ctx.expandAllRows?.();
      e.preventDefault();
      return;
    }

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const treeDirection = e.key === 'ArrowRight' ? 'right' : 'left';
    if (ctx.tryTreeArrow?.(treeDirection)) {
      e.preventDefault();
      return;
    }

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
