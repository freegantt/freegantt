// interaction/ — the Connect controller: a drag from a connector port on one bar edge to a port on
// another bar. It shares the pointer rules of the other gestures through `createPointerGesture`:
// the arm threshold, a touch long-press, pointer capture, and Escape to cancel. Nothing is written
// on pointer down. The drop only proposes (`ctx.propose`). The plugin that handles the drop owns
// the write (ADR 0041).
//
// Registered by the shell only while a plugin registers a connect handler, so with no handler this
// file never runs. Its listeners sit in the capture phase and end the pointer events of a port
// grab. The bar gestures in `entry-gestures.ts` then never see a pointer that grabbed a port, so a
// connect drag selects and moves nothing.

import type { BarId, EntryId } from '../model/index.js';
import { createPointerGesture, isPrimaryButton } from './pointer-gesture.js';
import type { ConnectDraft, ConnectGestureContext, Detachable } from '../view/index.js';

type Edge = 'start' | 'end';

/** The bar edge a drag grabbed. */
interface GrabbedPort {
  readonly barId: BarId;
  readonly entryId: EntryId;
  readonly edge: Edge;
}

/** Where a drop would land: another Entry's port. */
interface PortTarget {
  readonly entryId: EntryId;
  readonly edge: Edge;
}

export function attachConnect(
  pane: HTMLElement,
  container: HTMLElement,
  ctx: ConnectGestureContext,
): Detachable {
  /** Set on pointer down over a connectable port. Cleared when that pointer ends. */
  let grabbed: GrabbedPort | undefined;
  /** The drop an async `beforeConnect` handler still holds. */
  let hold: { abort(): void } | undefined;

  function portUnder(e: PointerEvent): { barId: BarId; edge: Edge } | undefined {
    const hit = ctx.hitTest({ x: e.clientX, y: e.clientY });
    if (hit?.kind !== 'bar' || hit.port === undefined) return undefined;
    return { barId: hit.barId, edge: hit.port };
  }

  /** The port the pointer sits on, unless it belongs to the Entry the drag started on. A drop on
   *  the same Entry's own edge joins nothing. */
  function targetUnder(e: PointerEvent): PortTarget | undefined {
    const port = portUnder(e);
    if (port === undefined || grabbed === undefined) return undefined;
    const entryId = ctx.entryFor(port.barId)?.id;
    if (entryId === undefined || entryId === grabbed.entryId) return undefined;
    return { entryId, edge: port.edge };
  }

  function draftAt(e: PointerEvent, pending: boolean): ConnectDraft | undefined {
    if (grabbed === undefined) return undefined;
    const target = targetUnder(e);
    return {
      fromBarId: grabbed.barId,
      fromEdge: grabbed.edge,
      cursorX: ctx.contentXAtPaneOffset(e.clientX - pane.getBoundingClientRect().left),
      cursorY: ctx.contentYAtClientY(e.clientY),
      ...(target !== undefined ? { targetEdge: target.edge } : undefined),
      pending,
    };
  }

  function endHold(): void {
    hold?.abort();
    hold = undefined;
  }

  /** Proposes the drop. A sync answer finishes now. A Promise keeps the line drawn, `pending`,
   *  until the veto settles. */
  function drop(e: PointerEvent): void {
    const from = grabbed;
    const target = targetUnder(e);
    const draft = draftAt(e, true);
    grabbed = undefined;
    if (from === undefined || target === undefined || draft === undefined) {
      ctx.paint(undefined);
      return;
    }
    const abort = new AbortController();
    const answer = ctx.propose(
      { from: { entryId: from.entryId, edge: from.edge }, to: target },
      abort.signal,
    );
    if (typeof answer === 'boolean') {
      ctx.paint(undefined);
      return;
    }
    hold = abort;
    ctx.paint(draft);
    const release = (): void => {
      if (hold !== abort) return;
      hold = undefined;
      ctx.paint(undefined);
    };
    void answer.then(release, release);
  }

  const gesture = createPointerGesture(
    pane,
    {
      start: () => grabbed !== undefined,
      move(e): void {
        ctx.paint(draftAt(e, false));
      },
      commit(e): void {
        drop(e);
      },
      cancel(): void {
        grabbed = undefined;
        ctx.paint(undefined);
      },
    },
    { arm: 'xy' },
  );

  function onPointerDown(e: PointerEvent): void {
    if (!isPrimaryButton(e)) return;
    const port = portUnder(e);
    const entry = port !== undefined ? ctx.entryFor(port.barId) : undefined;
    if (port === undefined || entry === undefined || !ctx.canConnect(entry)) return;
    endHold(); // a new drag replaces a held drop
    ctx.paint(undefined);
    grabbed = { barId: port.barId, entryId: entry.id, edge: port.edge };
    gesture.down(e);
    e.stopImmediatePropagation();
  }

  function onPointerMove(e: PointerEvent): void {
    gesture.move(e); // hover feeds on: this listener ends nothing
  }

  function onPointerUp(e: PointerEvent): void {
    if (grabbed === undefined) return;
    // A click on a port selects nothing, so this ends the pointer whether or not the drag armed.
    const armed = gesture.up(e);
    if (!armed) grabbed = undefined;
    e.stopImmediatePropagation();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (grabbed === undefined) return;
    gesture.pointercancel(e);
    grabbed = undefined;
    e.stopImmediatePropagation();
  }

  /** Escape cancels a live drag, or ends the wait on a held drop. Either way the selection stays. */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const cancelledDrag = gesture.escape();
    const cancelledHold = hold !== undefined;
    endHold();
    if (!cancelledDrag && !cancelledHold) return;
    ctx.paint(undefined);
    e.stopImmediatePropagation();
  }

  const capture = { capture: true };
  pane.addEventListener('pointerdown', onPointerDown, capture);
  pane.addEventListener('pointermove', onPointerMove, capture);
  pane.addEventListener('pointerup', onPointerUp, capture);
  pane.addEventListener('pointercancel', onPointerCancel, capture);
  container.addEventListener('keydown', onKeyDown, capture);

  return {
    detach(): void {
      gesture.detach();
      endHold();
      grabbed = undefined;
      ctx.paint(undefined);
      pane.removeEventListener('pointerdown', onPointerDown, capture);
      pane.removeEventListener('pointermove', onPointerMove, capture);
      pane.removeEventListener('pointerup', onPointerUp, capture);
      pane.removeEventListener('pointercancel', onPointerCancel, capture);
      container.removeEventListener('keydown', onKeyDown, capture);
    },
  };
}
