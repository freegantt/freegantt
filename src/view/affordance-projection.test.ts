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
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: (capability, id) => capability === 'move' && id === A,
    });

    expect(result.hoveredItemId).toBe(ITEM_A);
    expect(result.movableItemId).toBe(ITEM_A);
    // A is hovered but not resize-capable, and B is selected but not hovered — hover still wins.
    expect(result.resizableItemId).toBeUndefined();
  });

  it('selection fallback only at exactly one selected entry', () => {
    const oneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(oneSelected.resizableItemId).toBe(ITEM_A);

    const twoSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A, B],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(twoSelected.resizableItemId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(noneSelected.resizableItemId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.hoveredItemId).toBe(ITEM_A);
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableItemId).toBeUndefined();
  });

  it('an incapable sole selection resolves resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.resizableItemId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      pickedItemId: undefined,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.hoveredItemId).toBeUndefined();
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableItemId).toBeUndefined();
  });

  it('the handles follow the picked bar, not only segment 0 (#185)', () => {
    const segments = [itemId(A, 0), itemId(A, 1), itemId(A, 2)];
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemId: segments[1],
      itemIdsForEntry: () => segments,
      canGesture: () => true,
    });
    expect(result.resizableItemId).toBe(segments[1]);
  });

  it('a segmented entry selected from the grid parks the handles (#185)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemId: undefined,
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1)],
      canGesture: () => true,
    });
    // Two bars, no pointer pick: no single bar owns the shared handle pair.
    expect(result.resizableItemId).toBeUndefined();
  });

  it('a picked bar of another entry never holds the handles (#185)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      pickedItemId: ITEM_B,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.resizableItemId).toBe(ITEM_A);
  });
});
