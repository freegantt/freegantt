import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, itemId } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const ITEM_A = itemId(A);
const ITEM_B = itemId(B);

function itemEntryIds(): ReadonlyMap<ItemId, EntryId> {
  return new Map([
    [ITEM_A, A],
    [ITEM_B, B],
  ]);
}

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [B],
      itemEntryIds: itemEntryIds(),
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
      itemEntryIds: itemEntryIds(),
      canGesture: () => true,
    });
    expect(oneSelected.resizableItemId).toBe(ITEM_A);

    const twoSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A, B],
      itemEntryIds: itemEntryIds(),
      canGesture: () => true,
    });
    expect(twoSelected.resizableItemId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      itemEntryIds: itemEntryIds(),
      canGesture: () => true,
    });
    expect(noneSelected.resizableItemId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [],
      itemEntryIds: itemEntryIds(),
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
      itemEntryIds: itemEntryIds(),
      canGesture: () => false,
    });
    expect(result.resizableItemId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      itemEntryIds: itemEntryIds(),
      canGesture: () => true,
    });
    expect(result.hoveredItemId).toBeUndefined();
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableItemId).toBeUndefined();
  });
});
