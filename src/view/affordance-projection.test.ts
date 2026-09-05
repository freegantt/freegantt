import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, itemId } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const ITEM_A = itemId(A);
const ITEM_B = itemId(B);

/** Both entries draw one bar each — the shape almost every entry has. A test that needs a segmented
 *  entry builds its own answer instead. */
function oneBarEach(id: EntryId): readonly ItemId[] {
  return [itemId(id)];
}

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [B],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: (capability, id) => capability === 'move' && id === A,
    });

    expect(result.hoveredItemId).toBe(ITEM_A);
    expect(result.movableItemId).toBe(ITEM_A);
    // A is hovered but not resize-capable, and B is selected but not hovered — hover still wins.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('selection fallback only at exactly one selected entry', () => {
    const oneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(oneSelected.resizableEntryId).toBe(A);

    const twoSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A, B],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(twoSelected.resizableEntryId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(noneSelected.resizableEntryId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.hoveredItemId).toBe(ITEM_A);
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('an incapable sole selection resolves resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.hoveredItemId).toBeUndefined();
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('a picked bar hands the handles to its own Entry, whichever Segment it drew (#185, #200)', () => {
    const segments = [itemId(A, 0), itemId(A, 1), itemId(A, 2)];
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemIdByEntryId: new Map([[A, segments[1]!]]),
      itemIdsForEntry: () => segments,
      canGesture: () => true,
    });
    // The pair brackets the Entry's envelope, so the answer is the Entry, not the picked bar (#200).
    expect(result.resizableEntryId).toBe(A);
  });

  it('hovering one Segment hands the handles to its Entry (#200)', () => {
    const result = projectAffordances({
      hoveredItemId: itemId(A, 2),
      selection: [],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1), itemId(A, 2)],
      canGesture: () => true,
    });
    // The hovered bar still carries the hover and move paint; the handle pair answers per Entry.
    expect(result.hoveredItemId).toBe(itemId(A, 2));
    expect(result.movableItemId).toBe(itemId(A, 2));
    expect(result.resizableEntryId).toBe(A);
  });

  it('a segmented entry selected from the grid parks the handles (#185)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemIdByEntryId: new Map(),
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1)],
      canGesture: () => true,
    });
    // Two bars, no pointer pick: no single bar owns the shared handle pair.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('a pick on another entry leaves a segmented sole selection parked (#185)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemIdByEntryId: new Map([[B, ITEM_B]]),
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1)],
      canGesture: () => true,
    });
    // The map is keyed by Entry, so a pick on B says nothing about A — and A drew two bars, so no
    // single bar owns the pair.
    expect(result.resizableEntryId).toBeUndefined();
  });
});
