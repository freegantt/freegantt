import { describe, expect, it, vi } from 'vitest';
import { attachEntryGestures } from './entry-gestures.js';
import type { EntryGestureContext, Gesture } from './entry-gesture-context.js';
import { entryId, itemId } from '../model/index.js';
import type { Entry, EntryEdits, EntryId, Instant, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');
const ORDER: readonly EntryId[] = [A, B, C];
const ITEMS: Record<string, EntryId> = { [itemId(A)]: A, [itemId(B)]: B, [itemId(C)]: C };

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

/** `hitTest` reads a fake `data-hit-x` position map instead of real layout — this suite is about
 *  pointer semantics (D-S3-10), not hit-testing, which `render/dom/index.test.ts` already covers. */
function makeContext(overrides: Partial<EntryGestureContext> = {}): {
  ctx: EntryGestureContext;
  proposals: (readonly EntryId[])[];
} {
  let selection: readonly EntryId[] = [];
  const proposals: (readonly EntryId[])[] = [];
  const ctx: EntryGestureContext = {
    hitTest: (x) => (x >= 0 && x < ORDER.length ? itemId(ORDER[x]!) : undefined),
    entryFor: (item: ItemId) => {
      const id = ITEMS[item];
      return id !== undefined ? entryFor(id) : undefined;
    },
    can: () => true,
    rowOrder: () => ORDER,
    setHovered: () => {},
    entriesForGesture: (grabbed) => [entryFor(grabbed)],
    draftFor: () => new Map(),
    commit: () => Promise.resolve(true),
    preview: () => {},
    pointerAt: () => {},
    selection: {
      get: () => selection,
      propose: (next) => {
        selection = next;
        proposals.push(next);
      },
    },
    ...overrides,
  };
  return { ctx, proposals };
}

function mockPointerCapture(el: HTMLElement): void {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
}

describe('attachEntryGestures — selection (S3.1)', () => {
  it('plain click on a bar replaces the selection', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0));
    expect(proposals).toEqual([[A]]);

    pane.dispatchEvent(up(1));
    expect(proposals).toEqual([[A], [B]]);
  });

  it('ctrl/cmd-click toggles membership', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1, { ctrlKey: true }));
    expect(proposals.at(-1)).toEqual([A, B]);

    pane.dispatchEvent(up(0, { metaKey: true }));
    expect(proposals.at(-1)).toEqual([B]);
  });

  it('shift-click extends over row order from the last plain/ctrl click', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A
    pane.dispatchEvent(up(2, { shiftKey: true })); // extend to C
    expect(proposals.at(-1)).toEqual([A, B, C]);
  });

  it('shift-click omits incapable entries from the range; an empty result writes nothing', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A (capable)
    pane.dispatchEvent(up(2, { shiftKey: true })); // range A..C, B dropped
    expect(proposals.at(-1)).toEqual([A, C]);
  });

  it('a click on an incapable bar leaves the selection untouched', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext({
      can: (capability, entry) => capability !== 'select' || entry.id !== B,
    });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0));
    pane.dispatchEvent(up(1)); // B, incapable
    expect(proposals).toEqual([[A]]);
  });

  it('click on empty timeline clears; Escape clears', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext();
    attachEntryGestures(pane, container, ctx);

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
    const { ctx, proposals } = makeContext();
    const attachment = attachEntryGestures(pane, container, ctx);
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
    attachEntryGestures(pane, container, makeContext().ctx);

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

describe('attachEntryGestures — hover (S3.2)', () => {
  it('reports the raw hit under the pointer on pointermove, and undefined on pointerleave', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const hovered: (ItemId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(move(1));
    pane.dispatchEvent(move(99)); // no hit
    pane.dispatchEvent(new PointerEvent('pointerleave'));

    expect(hovered).toEqual([itemId(B), undefined, undefined]);
  });

  it('detach() stops reporting hover', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const hovered: (ItemId | undefined)[] = [];
    const { ctx } = makeContext({ setHovered: (id) => hovered.push(id) });
    attachEntryGestures(pane, container, ctx).detach();

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
    const previews: (EntryEdits | undefined)[] = [];
    const commits: [Gesture, EntryEdits][] = [];
    const { ctx, proposals } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      preview: (draft) => previews.push(draft),
      draftFor: (_gesture, entries, dxPx) =>
        new Map(entries.map((e) => [e.id, { start: toInstant(dxPx), end: toInstant(dxPx) }])),
      commit: (gesture, draft) => {
        commits.push([gesture, draft]);
        return Promise.resolve(true);
      },
    });
    attachEntryGestures(pane, container, ctx);

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
    const previews: (EntryEdits | undefined)[] = [];
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx } = makeContext({
      can: (capability) => capability === 'move' || capability === 'select',
      preview: (draft) => previews.push(draft),
      commit,
    });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(down(0));
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(previews.at(-1)).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('a pointerdown on a bar without move capability falls back to a plain click on pointerup', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const container = document.createElement('div');
    const commit = vi.fn(() => Promise.resolve(true));
    const { ctx, proposals } = makeContext({ can: (capability) => capability === 'select', commit });
    attachEntryGestures(pane, container, ctx);

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
    const seenEntries: Entry[][] = [];
    const { ctx } = makeContext({
      can: () => true,
      entriesForGesture: (grabbed) => [entryFor(grabbed), entryFor(grabbed === A ? B : A)],
      draftFor: (_g, entries) => {
        seenEntries.push([...entries]);
        return new Map();
      },
    });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(down(0)); // grabs A
    pane.dispatchEvent(move(0 + DRAG_THRESHOLD_PX + 1));

    expect(seenEntries[0]?.map((e) => e.id)).toEqual([A, B]);
  });
});
