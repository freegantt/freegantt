import { describe, expect, it } from 'vitest';
import { attachEntryGestures } from './entry-gestures.js';
import type { EntrySelectionContext } from './entry-gestures.js';
import { entryId, itemId } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const C = entryId('c');
const ORDER: readonly EntryId[] = [A, B, C];
const ITEMS: Record<string, EntryId> = { [itemId(A)]: A, [itemId(B)]: B, [itemId(C)]: C };

function up(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerup', { clientX, clientY: 0, ...mods });
}

/** `hitTest` reads a fake `data-hit-x` position map instead of real layout — this suite is about
 *  pointer semantics (D-S3-10), not hit-testing, which `render/dom/index.test.ts` already covers. */
function makeContext(overrides: Partial<EntrySelectionContext> = {}): {
  ctx: EntrySelectionContext;
  proposals: (readonly EntryId[])[];
} {
  let selection: readonly EntryId[] = [];
  const proposals: (readonly EntryId[])[] = [];
  const ctx: EntrySelectionContext = {
    hitTest: (x) => (x >= 0 && x < ORDER.length ? itemId(ORDER[x]!) : undefined),
    entryIdFor: (item: ItemId) => ITEMS[item],
    canSelect: () => true,
    rowOrder: () => ORDER,
    setHovered: () => {},
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
    const { ctx, proposals } = makeContext({ canSelect: (id) => id !== B });
    attachEntryGestures(pane, container, ctx);

    pane.dispatchEvent(up(0)); // anchor = A (capable)
    pane.dispatchEvent(up(2, { shiftKey: true })); // range A..C, B dropped
    expect(proposals.at(-1)).toEqual([A, C]);
  });

  it('a click on an incapable bar leaves the selection untouched', () => {
    const pane = document.createElement('div');
    const container = document.createElement('div');
    const { ctx, proposals } = makeContext({ canSelect: (id) => id !== B });
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

function move(clientX: number): PointerEvent {
  return new PointerEvent('pointermove', { clientX, clientY: 0 });
}

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
