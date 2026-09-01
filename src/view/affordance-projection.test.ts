import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, itemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const ITEM_A = itemId(A);

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [B],
      selectedItemIds: undefined,
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
      selectedItemIds: undefined,
      canGesture: () => true,
    });
    expect(oneSelected.resizableItemId).toBe(ITEM_A);

    const twoSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [A, B],
      selectedItemIds: undefined,
      canGesture: () => true,
    });
    expect(twoSelected.resizableItemId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      selectedItemIds: undefined,
      canGesture: () => true,
    });
    expect(noneSelected.resizableItemId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      selection: [],
      selectedItemIds: undefined,
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
      selectedItemIds: undefined,
      canGesture: () => false,
    });
    expect(result.resizableItemId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [],
      selectedItemIds: undefined,
      canGesture: () => true,
    });
    expect(result.hoveredItemId).toBeUndefined();
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableItemId).toBeUndefined();
  });

  it('sole-selection resize fallback uses the painted item, not only segment 0', () => {
    const segment1 = itemId(A, 1);
    const result = projectAffordances({
      hoveredItemId: undefined,
      selection: [A],
      selectedItemIds: [segment1],
      canGesture: () => true,
    });
    expect(result.resizableItemId).toBe(segment1);
  });
});
