import { describe, expect, it, vi } from 'vitest';
import { attachEntryGestures } from './entry-gestures.js';
import type { DraftOptions, EntryGestureContext, EntryGesture } from '../view/index.js';
import { entryId, entryIdOfItem, itemId } from '../model/index.js';
import type { Entry, EntryEdits, EntryId, Instant, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');
const ORDER: readonly EntryId[] = [A, B, C];

/** `interaction/` may not import `time/` (I1) — this suite is about pointer semantics, never real
 *  dates, so a bare number stands in for an `Instant` at this one call site. */
function toInstant(ms: number): Instant {
  return ms as unknown as Instant;
}

function entryFor(id: EntryId): Entry {
  return { id, kind: 'span', name: id, start: toInstant(0), end: toInstant(1) };
}

function up(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerup', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function down(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerdown', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function move(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointermove', { clientX, clientY: 0, pointerId: 1, ...mods });
}

/** The `session()`-shaped pieces a test wants to control — everything `GesturePipeline.session()`
 *  would otherwise resolve for real (D-GH-1). Not `EntryGestureContext` members themselves: they
 *  build the fake `session` this file's `ctx.session` returns. */
interface SessionOverrides {
  entriesForGesture?: (grabbed: EntryId, capability: 'move' | 'resize') => Entry[];
  draftFor?: (gesture: EntryGesture, entries: Entry[], dxPx: number, options?: DraftOptions) => EntryEdits;
  commit?: (gesture: EntryGesture, draft: EntryEdits) => Promise<boolean>;
}

/** `hitTest` reads a fake `data-hit-x` position map instead of real layout — this suite is about
 *  pointer semantics (D-S3-10), not hit-testing, which `render/dom/index.test.ts` already covers. */
function makeContext(overrides: Partial<EntryGestureContext> & SessionOverrides = {}): {
  ctx: EntryGestureContext;
  proposals: (readonly EntryId[])[];
  proposalItemIds: (readonly ItemId[] | undefined)[];
  previews: (EntryEdits | undefined)[];
  commits: [EntryGesture, EntryEdits][];
} {
  const {
    entriesForGesture = (grabbed) => [entryFor(grabbed)],
    draftFor = () => new Map(),
    commit = () => Promise.resolve(true),
    ...ctxOverrides
  } = overrides;

  let selection: readonly EntryId[] = [];
  const proposals: (readonly EntryId[])[] = [];
  const proposalItemIds: (readonly ItemId[] | undefined)[] = [];
  const previews: (EntryEdits | undefined)[] = [];
  const commits: [EntryGesture, EntryEdits][] = [];

  const ctx: EntryGestureContext = {
    hitTest: (at) => (at.x >= 0 && at.x < ORDER.length ? { itemId: itemId(ORDER[at.x]!) } : undefined),
    entryFor: (item: ItemId) => {
      const id = entryIdOfItem(item);
      return ORDER.includes(id) ? entryFor(id) : undefined;
    },
    can: () => true,
    selectableEntriesInRowOrder: () => ORDER,
    setHovered: () => {},
    contentXAtPaneOffset: (offsetX) => offsetX,
    session: (grabbed, gesture) => {
      const entries = entriesForGesture(grabbed, gesture.kind === 'resize' ? 'resize' : 'move');
      if (entries.length === 0) return undefined;
      return {
        preview: (dxPx, options) => {
          const draft = draftFor(gesture, entries, dxPx, options);
          previews.push(draft);
        },
        commit: (dxPx, options) => {
          const draft = draftFor(gesture, entries, dxPx, options);
          previews.push(undefined);
          commits.push([gesture, draft]);
          return commit(gesture, draft);
        },
        nudge: (direction, options) => {
          const draft = draftFor(gesture, entries, direction, options);
          previews.push(undefined);
          commits.push([gesture, draft]);
          return commit(gesture, draft);
        },
        cancel: () => {
          previews.push(undefined);
        },
      };
    },
    selection: {
      get: () => selection,
      propose: (next, itemIds) => {
        selection = next;
        proposals.push(next);
        proposalItemIds.push(itemIds);
      },
    },
    ...ctxOverrides,
  };
  return { ctx, proposals, proposalItemIds, previews, commits };
}

function mockPointerCapture(el: HTMLElement): void {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
}

describe('attachEntryGestures — selection (S3.1)', () => {
  it('plain click on a bar replaces the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0));
    expect(proposals).toEqual([[A]]);

    pane.dispatchEvent(up(1));
    expect(proposals).toEqual([[A], [B]]);
  });

  it('ctrl/cmd-click toggles membership', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([A, B]);

    pane.dispatchEvent(up(0, { metaKey: true }));
    expect(proposals.at(-1)).toEqual([B]);
  });

  it('shift-click extends over row order from the last plain/ctrl click', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    pane.dispatchEvent(up(2, { shiftKey: true })); // extend to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('shift-click omits incapable entries from the range; an empty result writes nothing', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A (capable)
    pane.dispatchEvent(up(2, { shiftKey: true })); // range A..C, B dropped
    expect(proposals.at(-1)).toEqual([A, C]);
  });

  it('a click on an incapable bar leaves the selection untouched', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1)); // B, incapable
    expect(proposals).toEqual([[A]]);
  });

  it('click on empty timeline clears; Escape clears', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(99)); // no hit
    expect(proposals.at(-1)).toEqual([]);

    pane.dispatchEvent(up(1));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(proposals.at(-1)).toEqual([]);
  });

  it('detach() removes the pointer, key, and native-highlight listeners', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    const attachment = attachEntryGestures(pane, gridPane, container, ctx);
    attachment.detach();

    pane.dispatchEvent(up(0));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const secondClick = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 });
    container.dispatchEvent(secondClick);
    expect(proposals).toEqual([]);
    expect(secondClick.defaultPrevented).toBe(false);
  });

  it('a second click of a double-click does not start a native text range (the first still focuses)', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    attachEntryGestures(pane, gridPane, container, makeContext().ctx);

    const first = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 });
    const second = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 });
    container.dispatchEvent(first);
    container.dispatchEvent(second);
    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(true);

    const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
    container.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBe(true);
  });
});

// Bug hunt (S5 fixes, "grid row highlight and row click"): a row click selects the same way a bar
// click does, but never arms move/resize, and a grid miss never clears (only an empty timeline
// click does).
describe('attachEntryGestures — grid row click', () => {
  it('a click on a grid row selects the same way a bar click does', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    gridPane.dispatchEvent(up(0));
    expect(proposals).toEqual([[A]]);
  });

  it('shift-click on a grid row ranges, same as the timeline', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    gridPane.dispatchEvent(up(0)); // anchor = A
    gridPane.dispatchEvent(up(2, { shiftKey: true })); // extend to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('a miss on the grid pane does not clear the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0)); // select A off the timeline
    gridPane.dispatchEvent(up(99)); // grid miss — header row, padding, a twisty
    expect(proposals).toEqual([[A]]);
    expect(ctx.selection.get()).toEqual([A]);
  });

  it('an empty timeline click still clears, even after a grid miss', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(0));
    gridPane.dispatchEvent(up(99)); // no-op
    pane.dispatchEvent(up(99)); // timeline miss — clears
    expect(proposals.at(-1)).toEqual([]);
  });

  it('a grid-row pointerup never arms move/resize — no session() call, no drag', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    let sessionCalls = 0;
    const { ctx } = makeContext();
    const spiedCtx: EntryGestureContext = {
      ...ctx,
      session: (...args) => {
        sessionCalls++;
        return ctx.session(...args);
      },
    };
    attachEntryGestures(pane, gridPane, container, spiedCtx);

    gridPane.dispatchEvent(down(0));
    gridPane.dispatchEvent(up(0));
    expect(sessionCalls).toBe(0);
  });

  it('detach() removes the grid pointerup listener', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, gridPane, container, ctx).detach();

    gridPane.dispatchEvent(up(0));
    expect(proposals).toEqual([]);
  });
});

describe('attachEntryGestures — hover (S3.2)', () => {
  it('reports the raw hit under the pointer on pointermove, and undefined on pointerleave', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const hovered: (ItemId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(move(1));
    pane.dispatchEvent(move(99)); // no hit
    pane.dispatchEvent(new PointerEvent('pointerleave'));

    expect(hovered).toEqual([itemId(B), undefined, undefined]);
  });

  it('detach() stops reporting hover', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const hovered: (ItemId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, gridPane, container, ctx).detach();

    pane.dispatchEvent(move(1));
    expect(hovered).toEqual([]);
  });
});

const DRAG_THRESHOLD_PX = 4;

describe('attachEntryGestures — move (S3.3)', () => {
  it('[S3-A1] a drag past the threshold previews, then commits on pointerup and never touches selection', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const { ctx, proposals, previews, commits } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      draftFor: (_gesture, entries, dxPx) =>
        new Map(entries.map((e) => [e.id, { start: toInstant(dxPx), end: toInstant(dxPx) }])),
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5));

    expect(previews.length).toBeGreaterThan(0);
    expect(previews.at(-1)).toBeUndefined(); // cleared on commit
    expect(commits).toHaveLength(1);
    expect(commits[0]![0]).toEqual({ kind: 'move' });
    expect(proposals).toEqual([]); // a drag never also proposes a selection change
  });

  it('[S3-A2] Escape mid-drag clears the preview and commits nothing', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, previews, commits } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      commit,
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(previews.at(-1)).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
    expect(commits).toEqual([]);
  });

  it('a pointerdown on a bar without move capability falls back to a plain click on pointerup', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({ can: (capability) => capability === 'select', commit });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // never arms: not move-capable
    pane.dispatchEvent(up(0));

    expect(commit).not.toHaveBeenCalled();
    expect(proposals).toEqual([[A]]);
  });

  it('a drag moves every capable entry `entriesForGesture` returns, grabbed first', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const seenEntries: Entry[][] = [];
    const { ctx } = makeContext({
      can: () => true,
      entriesForGesture: (grabbed) => [entryFor(grabbed), entryFor(grabbed === A ? B : A)],
      draftFor: (_g, entries) => {
        seenEntries.push([...entries]);
        return new Map();
      },
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0)); // grabs A
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));

    expect(seenEntries[0]?.map((e) => e.id)).toEqual([A, B]);
  });
});

describe('attachEntryGestures — resize (S3.4)', () => {
  it("[S3-A1] a pointerdown on the end handle arms a resize({ edge: 'end' }) gesture, committed on pointerup", () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const capabilities: ('move' | 'resize')[] = [];
    const { ctx, proposals, commits } = makeContext({
      hitTest: () => ({ itemId: itemId(A), edge: 'end' }),
      can: (capability) => capability === 'resize' || capability === 'select',
      entriesForGesture: (grabbed, capability) => {
        capabilities.push(capability);
        return [entryFor(grabbed)];
      },
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    pane.dispatchEvent(up(0 + DRAG_THRESHOLD_PX + 5));

    expect(capabilities).toEqual(['resize']);
    expect(commits).toHaveLength(1);
    expect(commits[0]![0]).toEqual({ kind: 'resize', edge: 'end' });
    expect(proposals).toEqual([]); // a drag never also proposes a selection change
  });

  it('a pointerdown on the start handle of a resize-incapable entry falls back to a plain click', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({
      hitTest: (at) => (at.x === 0 ? { itemId: itemId(A), edge: 'start' } : { itemId: itemId(ORDER[at.x]!) }),
      can: (capability) => capability === 'select', // resize refused (e.g. milestone)
      commit,
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1)); // never arms: not resize-capable
    pane.dispatchEvent(up(0));

    expect(commit).not.toHaveBeenCalled();
    expect(proposals).toEqual([[A]]);
  });
});

describe('attachEntryGestures — segments and visible row order (S4.10)', () => {
  it('[S4-A4] passes the grabbed item id into session when a segment bar is armed', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    mockPointerCapture(pane);
    const middle = itemId(A, 1);
    const grabbedItems: (ItemId | undefined)[] = [];
    const segmented: Entry = {
      ...entryFor(A),
      segments: [
        { start: toInstant(0), end: toInstant(1) },
        { start: toInstant(2), end: toInstant(3) },
        { start: toInstant(4), end: toInstant(5) },
      ],
    };
    const { ctx } = makeContext({
      hitTest: () => ({ itemId: middle }),
      entryFor: (item) => (item === middle ? segmented : entryFor(entryIdOfItem(item))),
      session: (grabbed, gesture, grabbedItemId) => {
        grabbedItems.push(grabbedItemId);
        return {
          preview: () => {},
          commit: () => Promise.resolve(true),
          nudge: () => Promise.resolve(true),
          cancel: () => {},
        };
      },
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(DRAG_THRESHOLD_PX + 1));

    expect(grabbedItems).toEqual([middle]);
  });

  it('plain click proposes the touched segment item id, not only segment 0', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const middle = itemId(A, 1);
    const { ctx, proposals, proposalItemIds } = makeContext({
      hitTest: () => ({ itemId: middle }),
    });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(1000)); // hit resolves to segment 1 of A

    expect(proposals).toEqual([[A]]);
    expect(proposalItemIds[proposalItemIds.length - 1]).toEqual([middle]);
  });

  it('shift-click ranges over selectableEntriesInRowOrder, skipping rows not shown', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const gridPane = document.createElement('div');
    const visible: readonly EntryId[] = [B, C];
    const { ctx, proposals } = makeContext({ selectableEntriesInRowOrder: () => visible });
    attachEntryGestures(pane, gridPane, container, ctx);

    pane.dispatchEvent(up(1)); // select B
    pane.dispatchEvent(up(2, { shiftKey: true })); // range to C

    expect(proposals).toEqual([[B], [B, C]]);
  });
});
