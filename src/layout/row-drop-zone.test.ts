import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DROP_ZONE_HYSTERESIS_PX, ROW_CHANGE_THRESHOLD_PX, rowDropZoneAt } from './row-drop-zone.js';
import type { RowDropSide, RowDropZone, RowDropZoneInput } from './row-drop-zone.js';
import { PrefixSumHeightIndex } from './row-height-index.js';

// Every test below draws from a 10-row plan of uniform 32px rows, so a zone boundary sits at a
// round number: row `i` spans `[32*i, 32*i + 32)`, its before/into/after thirds at 8px and 24px.
const ROW_HEIGHT = 32;
const ROW_COUNT = 10;

function heights(): Pick<
  import('./row-height-index.js').RowHeightIndex,
  'indexAtY' | 'topAt' | 'heightAt' | 'totalHeight'
> {
  return new PrefixSumHeightIndex(ROW_COUNT, () => ROW_HEIGHT);
}

const SOURCE_ROW: RowDropZone = { kind: 'sourceRow' };
const NOT_DRAGGING_ROW_0 = 5; // source row index far from the rows under test, unless a test says otherwise

function zoneAt(y: number, previous: RowDropZone, overrides: Partial<RowDropZoneInput> = {}): RowDropZone {
  return rowDropZoneAt(
    {
      y,
      sourceRowIndex: NOT_DRAGGING_ROW_0,
      heights: heights(),
      rowCount: ROW_COUNT,
      takesWholeRowInto: () => false,
      ...overrides,
    },
    previous,
  );
}

describe('rowDropZoneAt', () => {
  it('splits a row into before/into/after thirds at 25% and 75%', () => {
    expect(zoneAt(0 * ROW_HEIGHT + 7, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 0, side: 'before' });
    expect(zoneAt(0 * ROW_HEIGHT + 8, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 0, side: 'into' });
    expect(zoneAt(0 * ROW_HEIGHT + 23, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 0, side: 'into' });
    expect(zoneAt(0 * ROW_HEIGHT + 24, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 0, side: 'after' });
  });

  it('a childrenAsSegments row is into over its whole height', () => {
    const takesWholeRowInto = (index: number) => index === 2;
    expect(zoneAt(2 * ROW_HEIGHT + 1, SOURCE_ROW, { takesWholeRowInto })).toEqual({
      kind: 'row',
      rowIndex: 2,
      side: 'into',
    });
    expect(zoneAt(2 * ROW_HEIGHT + 31, SOURCE_ROW, { takesWholeRowInto })).toEqual({
      kind: 'row',
      rowIndex: 2,
      side: 'into',
    });
  });

  it('the source row itself is always sourceRow, and a dead zone guards leaving it', () => {
    const sourceRowIndex = 3;
    // Any y inside the source row is sourceRow, whatever the previous zone said.
    for (const offset of [0, 15, 31]) {
      expect(
        zoneAt(3 * ROW_HEIGHT + offset, { kind: 'row', rowIndex: 9, side: 'after' }, { sourceRowIndex }),
      ).toEqual(SOURCE_ROW);
    }
    // Leaving downward: within the dead zone at the top of the next row, still sourceRow.
    expect(zoneAt(4 * ROW_HEIGHT + (ROW_CHANGE_THRESHOLD_PX - 1), SOURCE_ROW, { sourceRowIndex })).toEqual(
      SOURCE_ROW,
    );
    // Past the dead zone, the zone becomes a real row.
    expect(zoneAt(4 * ROW_HEIGHT + ROW_CHANGE_THRESHOLD_PX, SOURCE_ROW, { sourceRowIndex })).toEqual({
      kind: 'row',
      rowIndex: 4,
      side: 'before',
    });
  });

  it('hysteresis: leaving into needs 3px past the boundary, in the direction away from into', () => {
    const previous: RowDropZone = { kind: 'row', rowIndex: 0, side: 'into' };
    // The into/before boundary sits at 8; hysteresis moves it down to 5 while previous is into.
    expect(zoneAt(7.5, previous)).toEqual({ kind: 'row', rowIndex: 0, side: 'into' });
    expect(zoneAt(4.9, previous)).toEqual({ kind: 'row', rowIndex: 0, side: 'before' });
    expect(zoneAt(5, previous)).toEqual({ kind: 'row', rowIndex: 0, side: 'into' });
  });

  it('hysteresis: leaving before needs 3px past the boundary, in the direction away from before', () => {
    const previous: RowDropZone = { kind: 'row', rowIndex: 0, side: 'before' };
    // The before/into boundary sits at 8; hysteresis moves it up to 11 while previous is before.
    expect(zoneAt(10.9, previous)).toEqual({ kind: 'row', rowIndex: 0, side: 'before' });
    expect(zoneAt(11, previous)).toEqual({ kind: 'row', rowIndex: 0, side: 'into' });
  });

  it('adjacent-row boundary: a crossing within the hysteresis band keeps the previous row', () => {
    // Row 2 spans [64, 96); row 3 starts at 96. Grabbed "after" on row 2, the pointer edges 1px
    // into row 3 — inside the 3px hysteresis band around the 96 boundary — so it stays on row 2.
    const previous: RowDropZone = { kind: 'row', rowIndex: 2, side: 'after' };
    expect(zoneAt(95, previous)).toEqual(previous);
    expect(zoneAt(97, previous)).toEqual(previous);
    // Clear of the band, the pointer really is on row 3.
    expect(zoneAt(96 + DROP_ZONE_HYSTERESIS_PX, previous)).toEqual({
      kind: 'row',
      rowIndex: 3,
      side: 'before',
    });
  });

  it('resolves past the last row to belowLastRow, and clamps a negative y into row 0', () => {
    expect(zoneAt(ROW_HEIGHT * ROW_COUNT, SOURCE_ROW)).toEqual({ kind: 'belowLastRow' });
    expect(zoneAt(ROW_HEIGHT * ROW_COUNT + 500, SOURCE_ROW)).toEqual({ kind: 'belowLastRow' });
    expect(zoneAt(0, SOURCE_ROW, { rowCount: 0 })).toEqual({ kind: 'belowLastRow' });
    expect(zoneAt(-5, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 0, side: 'before' });
  });

  it('returns the same object when the zone did not change (no allocation, I5)', () => {
    const previous: RowDropZone = { kind: 'row', rowIndex: 0, side: 'into' };
    expect(zoneAt(10, previous)).toBe(previous);
    const source = SOURCE_ROW;
    expect(zoneAt(3 * ROW_HEIGHT + 5, source, { sourceRowIndex: 3 })).toBe(source);
    const below: RowDropZone = { kind: 'belowLastRow' };
    expect(zoneAt(1000, below)).toBe(below);
  });

  it('is a pure function of (input, previous) — same inputs, same answer, every time', () => {
    const previousArb = fc.oneof(
      fc.constant<RowDropZone>({ kind: 'sourceRow' }),
      fc.constant<RowDropZone>({ kind: 'belowLastRow' }),
      fc.record({
        kind: fc.constant('row' as const),
        rowIndex: fc.integer({ min: 0, max: ROW_COUNT - 1 }),
        side: fc.constantFrom<RowDropSide>('before', 'into', 'after'),
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: ROW_HEIGHT * ROW_COUNT + 20 }),
        fc.integer({ min: 0, max: ROW_COUNT - 1 }),
        previousArb,
        (y, sourceRowIndex, previous) => {
          const first = zoneAt(y, previous, { sourceRowIndex });
          const second = zoneAt(y, previous, { sourceRowIndex });
          expect(second).toEqual(first);
        },
      ),
      { numRuns: 200 },
    );
  });
});
