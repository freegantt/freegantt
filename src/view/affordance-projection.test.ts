import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, barId } from '../model/index.js';
import type { EntryId, BarId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const ITEM_A = barId(A);

/** Both entries draw one bar each — the shape almost every entry has. A test that needs a segmented
 *  entry builds its own answer instead. */
function oneBarEach(id: EntryId): readonly BarId[] {
  return [barId(id)];
}

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredBarId: ITEM_A,
      soleSelectedEntryId: B,
      selectedSegmentCountOfSoleEntry: 1,
      barIdsForEntry: oneBarEach,
      canGesture: (capability, id) => capability === 'move' && id === A,
    });

    expect(result.hoveredBarId).toBe(ITEM_A);
    expect(result.movableBarId).toBe(ITEM_A);
    // A is hovered but not resize-capable, and B is selected but not hovered — hover still wins.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('selection fallback only at exactly one selected entry', () => {
    const oneSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(oneSelected.resizableEntryId).toBe(A);

    const twoSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(twoSelected.resizableEntryId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(noneSelected.resizableEntryId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: ITEM_A,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.hoveredBarId).toBe(ITEM_A);
    expect(result.movableBarId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('an incapable sole selection resolves resizable to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      barIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.hoveredBarId).toBeUndefined();
    expect(result.movableBarId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('one selected Segment hands the handles to its own Entry, whichever bar drew it (#200, #212)', () => {
    const segments = [barId(A, 0), barId(A, 1), barId(A, 2)];
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 1,
      barIdsForEntry: () => segments,
      canGesture: () => true,
    });
    // The pair brackets an Entry, so the answer is the Entry, not the selected bar (#200).
    expect(result.resizableEntryId).toBe(A);
  });

  it('hovering one Segment hands the handles to its Entry (#200)', () => {
    const result = projectAffordances({
      hoveredBarId: barId(A, 2),
      soleSelectedEntryId: undefined,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: () => [barId(A, 0), barId(A, 1), barId(A, 2)],
      canGesture: () => true,
    });
    // The hovered bar still carries the hover and move paint; the handle pair answers per Entry.
    expect(result.hoveredBarId).toBe(barId(A, 2));
    expect(result.movableBarId).toBe(barId(A, 2));
    expect(result.resizableEntryId).toBe(A);
  });

  it('a segmented entry selected from the grid parks the handles (#185, #212)', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 2,
      barIdsForEntry: () => [barId(A, 0), barId(A, 1)],
      canGesture: () => true,
    });
    // Both Segments selected and two bars drawn: no single bar owns the shared handle pair.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('a Selection holding no Segment of the sole Entry leaves a segmented one parked (#212)', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      selectedSegmentCountOfSoleEntry: 0,
      barIdsForEntry: () => [barId(A, 0), barId(A, 1)],
      canGesture: () => true,
    });
    // A drew two bars and the Selection names neither, so no single bar owns the pair.
    expect(result.resizableEntryId).toBeUndefined();
  });

  describe('resizableEdges (#142)', () => {
    it('records each edge answer independently, even when only one is capable', () => {
      const result = projectAffordances({
        hoveredBarId: undefined,
        soleSelectedEntryId: A,
        selectedSegmentCountOfSoleEntry: 1,
        barIdsForEntry: oneBarEach,
        canGesture: (capability, id, edge) => capability === 'resize' && edge === 'start',
      });
      expect(result.resizableEntryId).toBe(A);
      expect(result.resizableEdges).toEqual({ start: true, end: false });
    });

    it('still shows the pair when only one edge answers true', () => {
      const result = projectAffordances({
        hoveredBarId: ITEM_A,
        soleSelectedEntryId: undefined,
        selectedSegmentCountOfSoleEntry: 0,
        barIdsForEntry: oneBarEach,
        canGesture: (capability, id, edge) => capability === 'resize' && edge === 'end',
      });
      expect(result.resizableEntryId).toBe(A);
      expect(result.resizableEdges).toEqual({ start: false, end: true });
    });

    it('parks the whole pair when neither edge answers true', () => {
      const result = projectAffordances({
        hoveredBarId: undefined,
        soleSelectedEntryId: A,
        selectedSegmentCountOfSoleEntry: 1,
        barIdsForEntry: oneBarEach,
        canGesture: () => false,
      });
      expect(result.resizableEntryId).toBeUndefined();
      expect(result.resizableEdges).toBeUndefined();
    });
  });
});
