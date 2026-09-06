import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, itemId } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const ITEM_A = itemId(A);

/** Both entries draw one bar each — the shape almost every entry has. A test that needs a segmented
 *  entry builds its own answer instead. */
function oneBarEach(id: EntryId): readonly ItemId[] {
  return [itemId(id)];
}

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      soleSelectedEntryId: B,
      selectedSegmentCountOfSoleEntry: 1,
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
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(oneSelected.resizableEntryId).toBe(A);

    const twoSelected = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(twoSelected.resizableEntryId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(noneSelected.resizableEntryId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: ITEM_A,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
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
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      itemIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      itemIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.hoveredItemId).toBeUndefined();
    expect(result.movableItemId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('one selected Segment hands the handles to its own Entry, whichever bar drew it (#200, #212)', () => {
    const segments = [itemId(A, 0), itemId(A, 1), itemId(A, 2)];
    const result = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      itemIdsForEntry: () => segments,
      canGesture: () => true,
    });
    // The pair brackets an Entry, so the answer is the Entry, not the selected bar (#200).
    expect(result.resizableEntryId).toBe(A);
  });

  it('hovering one Segment hands the handles to its Entry (#200)', () => {
    const result = projectAffordances({
      hoveredItemId: itemId(A, 2),
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1), itemId(A, 2)],
      canGesture: () => true,
    });
    // The hovered bar still carries the hover and move paint; the handle pair answers per Entry.
    expect(result.hoveredItemId).toBe(itemId(A, 2));
    expect(result.movableItemId).toBe(itemId(A, 2));
    expect(result.resizableEntryId).toBe(A);
  });

  it('a segmented entry selected from the grid parks the handles (#185, #212)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 2,
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1)],
      canGesture: () => true,
    });
    // Both Segments selected and two bars drawn: no single bar owns the shared handle pair.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('a Selection holding no Segment of the sole Entry leaves a segmented one parked (#212)', () => {
    const result = projectAffordances({
      hoveredItemId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 0,
      itemIdsForEntry: () => [itemId(A, 0), itemId(A, 1)],
      canGesture: () => true,
    });
    // A drew two bars and the Selection names neither, so no single bar owns the pair.
    expect(result.resizableEntryId).toBeUndefined();
  });
});
