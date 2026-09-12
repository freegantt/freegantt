import { describe, expect, it, vi } from 'vitest';
import { attachKeyboardEditing } from './keyboard-editing.js';
import type { EntryGesture, EntryGestureContext, EntryGestureSession } from '../view/index.js';
import { entryId, entryIdOfItem, segmentId } from '../model/index.js';
import type { Entry, EntryId, Instant, ItemId, SegmentId } from '../model/index.js';
import { EntryStore } from '../data/index.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');
const ORDER: readonly EntryId[] = [A, B, C];

/** The fake's own Segment naming (#212): Entry `a` draws one Segment, `a-0`. */
function segmentOf(id: EntryId): SegmentId {
  return segmentId(`${id}-0`);
}

function toInstant(ms: number): Instant {
  return ms as unknown as Instant;
}

/** The rows a gesture reads, built through the real store. `interaction/` may reach `data/`, and the
 *  store is the one place a live `Entry` is built (ADR 0017). */
let minted = 0;
const rows = new EntryStore(
  ORDER.map((id) => ({
    id,
    name: id,
    start: toInstant(0),
    end: toInstant(1),
    segments: [{ id: segmentOf(id), start: toInstant(0), end: toInstant(1) }],
    props: {},
  })),
  { timeZone: 'UTC', dateOnlyEnd: 'inclusive', mintSegmentId: () => segmentId(`minted-${++minted}`) },
);

function entryFor(id: EntryId): Entry {
  return rows.get(id)!;
}

function key(type: 'keydown', props: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, ...props });
}

interface ContextOptions {
  /** Row ids `can('select', ...)` refuses — everything else defaults capable. */
  incapableRows?: readonly EntryId[];
  /** `ctx.session()` returns `undefined` for these grabbed ids — simulates an incapable grab or a
   *  pending (D-S3-17) arm-lock refusal. */
  refuseSession?: readonly EntryId[];
}

function makeContext(
  selectionInit: readonly EntryId[],
  options: ContextOptions = {},
): {
  ctx: EntryGestureContext;
  proposals: (readonly SegmentId[])[];
  sessions: [EntryId, EntryGesture][];
  nudges: [1 | -1, boolean | undefined][];
} {
  const { incapableRows = [], refuseSession = [] } = options;
  let selection: readonly SegmentId[] = selectionInit.map(segmentOf);
  const proposals: (readonly SegmentId[])[] = [];
  const sessions: [EntryId, EntryGesture][] = [];
  const nudges: [1 | -1, boolean | undefined][] = [];

  const ctx: EntryGestureContext = {
    hitTest: () => undefined,
    entryFor: (item: ItemId) => {
      const id = entryIdOfItem(item);
      return ORDER.includes(id) ? entryFor(id) : undefined;
    },
    can: (capability, entry) => (capability === 'select' ? !incapableRows.includes(entry.id) : true),
    setHovered: () => {},
    setHoveredRow: () => {},
    contentXAtPaneOffset: (offsetX) => offsetX,
    selection: {
      selectableEntriesInRowOrder: () => ORDER,
      selectableSegmentsInRowOrder: () => ORDER.flatMap((id) => ctx.selection.segmentIdsOfEntries([id])),
      // `hitTest` always misses in this fake (this file drives keyboard chords, never a pointer
      // hit), so `selectableSegmentsOf` never runs — it exists only to satisfy the interface.
      selectableSegmentsOf: () => [],
      segmentIdsOfEntries: (ids) => ids.map(segmentOf),
      segmentIdsForItem: (item) => [segmentOf(entryIdOfItem(item))],
      segmentIds: () => selection,
      entryIds: () => ORDER.filter((id) => selection.includes(segmentOf(id))),
      propose: (next) => {
        selection = next;
        proposals.push(next);
      },
    },
    session: (grabbed, gesture): EntryGestureSession | undefined => {
      if (refuseSession.includes(grabbed)) return undefined;
      sessions.push([grabbed, gesture]);
      return {
        preview: () => {},
        commit: () => Promise.resolve(true),
        nudge: (direction, opts) => {
          nudges.push([direction, opts?.suspendSnap]);
          return Promise.resolve(true);
        },
        cancel: () => {},
      };
    },
  };
  return { ctx, proposals, sessions, nudges };
}

describe('attachKeyboardEditing (S3.5, D-S3-13)', () => {
  it('does nothing on any arrow key when nothing is selected — S3.7 owns the pan bindings', () => {
    const container = document.createElement('div');
    const { ctx, proposals, sessions } = makeContext([]);
    attachKeyboardEditing(container, ctx);

    container.dispatchEvent(key('keydown', { key: 'ArrowRight' }));
    container.dispatchEvent(key('keydown', { key: 'ArrowUp' }));

    expect(proposals).toEqual([]);
    expect(sessions).toEqual([]);
  });

  it('ArrowRight nudges the selected entry forward by one step', () => {
    const container = document.createElement('div');
    const { ctx, sessions, nudges } = makeContext([A]);
    attachKeyboardEditing(container, ctx);

    container.dispatchEvent(key('keydown', { key: 'ArrowRight' }));

    expect(sessions).toEqual([[A, { kind: 'move' }]]);
    expect(nudges).toEqual([[1, undefined]]);
  });

  it('ArrowLeft nudges the selected entry backward by one step', () => {
    const container = document.createElement('div');
    const { ctx, nudges } = makeContext([A]);
    attachKeyboardEditing(container, ctx);

    container.dispatchEvent(key('keydown', { key: 'ArrowLeft' }));

    expect(nudges).toEqual([[-1, undefined]]);
  });

  it('Shift+ArrowRight resizes the end edge forward', () => {
    const container = document.createElement('div');
    const { ctx, sessions, nudges } = makeContext([A]);
    attachKeyboardEditing(container, ctx);

    container.dispatchEvent(key('keydown', { key: 'ArrowRight', shiftKey: true }));

    expect(sessions).toEqual([[A, { kind: 'resize', edge: 'end' }]]);
    expect(nudges).toEqual([[1, undefined]]);
  });

  it('Alt+ArrowRight nudges with suspendSnap', () => {
    const container = document.createElement('div');
    const { ctx, nudges } = makeContext([A]);
    attachKeyboardEditing(container, ctx);

    container.dispatchEvent(key('keydown', { key: 'ArrowRight', altKey: true }));

    expect(nudges).toEqual([[1, true]]);
  });

  it('an incapable or pending grab (ctx.session() undefined) no-ops silently', () => {
    const container = document.createElement('div');
    const { ctx, nudges } = makeContext([A], { refuseSession: [A] });
    attachKeyboardEditing(container, ctx);

    expect(() => container.dispatchEvent(key('keydown', { key: 'ArrowRight' }))).not.toThrow();
    expect(nudges).toEqual([]);
  });

  it('preventDefault fires for a handled key, not for an unrelated one', () => {
    const container = document.createElement('div');
    const { ctx } = makeContext([A]);
    attachKeyboardEditing(container, ctx);

    const handled = key('keydown', { key: 'ArrowRight' });
    const handledSpy = vi.spyOn(handled, 'preventDefault');
    container.dispatchEvent(handled);
    expect(handledSpy).toHaveBeenCalled();

    const unrelated = key('keydown', { key: 'a' });
    const unrelatedSpy = vi.spyOn(unrelated, 'preventDefault');
    container.dispatchEvent(unrelated);
    expect(unrelatedSpy).not.toHaveBeenCalled();
  });

  it('detach() removes the listener', () => {
    const container = document.createElement('div');
    const { ctx, nudges } = makeContext([A]);
    const attachment = attachKeyboardEditing(container, ctx);

    attachment.detach();
    container.dispatchEvent(key('keydown', { key: 'ArrowRight' }));

    expect(nudges).toEqual([]);
  });
});
