import { describe, expect, it } from 'vitest';
import { projectAffordances } from './affordance-projection.js';
import { entryId, barId } from '../model/index.js';
import type { EntryId, BarId } from '../model/index.js';

const A = entryId('a');
const B = entryId('b');
const BAR_A = barId(A);

/** Both entries draw one bar each — the shape every core Entry has (ADR 0026). A test that needs an
 *  Entry drawing several bars (only a plugin variant can, #421) builds its own answer instead. */
function oneBarEach(id: EntryId): readonly BarId[] {
  return [barId(id)];
}

describe('projectAffordances (D-S3-6)', () => {
  it('hover wins over selection, including a hover that resolves to no handles', () => {
    const result = projectAffordances({
      hoveredBarId: BAR_A,
      soleSelectedEntryId: B,
      barIdsForEntry: oneBarEach,
      canGesture: (capability, id) => capability === 'move' && id === A,
    });

    expect(result.hoveredBarId).toBe(BAR_A);
    expect(result.movableBarId).toBe(BAR_A);
    // A is hovered but not resize-capable, and B is selected but not hovered — hover still wins.
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('selection fallback only at exactly one selected entry', () => {
    const oneSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(oneSelected.resizableEntryId).toBe(A);

    const twoSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(twoSelected.resizableEntryId).toBeUndefined();

    const noneSelected = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(noneSelected.resizableEntryId).toBeUndefined();
  });

  it('an incapable hover resolves movable/resizable to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: BAR_A,
      soleSelectedEntryId: undefined,
      barIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.hoveredBarId).toBe(BAR_A);
    expect(result.movableBarId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('an incapable sole selection resolves resizable to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      barIdsForEntry: oneBarEach,
      canGesture: () => false,
    });
    expect(result.resizableEntryId).toBeUndefined();
  });

  it('no hover and no selection resolves every id to undefined', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: undefined,
      barIdsForEntry: oneBarEach,
      canGesture: () => true,
    });
    expect(result.hoveredBarId).toBeUndefined();
    expect(result.movableBarId).toBeUndefined();
    expect(result.resizableEntryId).toBeUndefined();
  });

  // Retired (ADR 0026, #421): a prior test here, 'one selected Segment hands the handles to its own
  // Entry, whichever bar drew it', asked what happened when the sole selected Entry drew several
  // bars and exactly one of its former Segments was selected — the pair bracketed the Entry anyway.
  // A core Entry now always draws exactly one bar over its own span, so `barIdsForEntry` returning
  // several bars for the sole selected Entry only happens behind a plugin variant, and the rule for
  // that shape is unconditional now: no single bar owns the pair, so it parks (see the merged test
  // below, `resolveResizableEntry`'s own doc comment). There is no "how many were selected" question
  // left to ask.

  it('hovering a bar with a non-zero partIndex hands the handles to its Entry (#200)', () => {
    const result = projectAffordances({
      hoveredBarId: barId(A, 2),
      soleSelectedEntryId: undefined,
      barIdsForEntry: () => [barId(A, 0), barId(A, 1), barId(A, 2)],
      canGesture: () => true,
    });
    // The hovered bar still carries the hover and move paint; the handle pair answers per Entry.
    expect(result.hoveredBarId).toBe(barId(A, 2));
    expect(result.movableBarId).toBe(barId(A, 2));
    expect(result.resizableEntryId).toBe(A);
  });

  it('a sole selected Entry drawing several bars parks the handles — no single bar owns the pair (#185, #212, ADR 0026)', () => {
    const result = projectAffordances({
      hoveredBarId: undefined,
      soleSelectedEntryId: A,
      barIdsForEntry: () => [barId(A, 0), barId(A, 1)],
      canGesture: () => true,
    });
    // Only a plugin variant draws several bars for one Entry; whichever bars they are, no single one
    // owns the shared handle pair.
    expect(result.resizableEntryId).toBeUndefined();
  });

  describe('resizableEdges (#142)', () => {
    it('records each edge answer independently, even when only one is capable', () => {
      const result = projectAffordances({
        hoveredBarId: undefined,
        soleSelectedEntryId: A,
        barIdsForEntry: oneBarEach,
        canGesture: (capability, id, edge) => capability === 'resize' && edge === 'start',
      });
      expect(result.resizableEntryId).toBe(A);
      expect(result.resizableEdges).toEqual({ start: true, end: false });
    });

    it('still shows the pair when only one edge answers true', () => {
      const result = projectAffordances({
        hoveredBarId: BAR_A,
        soleSelectedEntryId: undefined,
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
        barIdsForEntry: oneBarEach,
        canGesture: () => false,
      });
      expect(result.resizableEntryId).toBeUndefined();
      expect(result.resizableEdges).toBeUndefined();
    });
  });
});
