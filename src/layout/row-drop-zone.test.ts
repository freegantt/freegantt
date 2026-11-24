import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DROP_ZONE_HYSTERESIS_PX, ROW_CHANGE_THRESHOLD_PX, rowDropZoneAt } from './row-drop-zone.js';
import type { RowDropHeights, RowDropSide, RowDropZone, RowDropZoneInput } from './row-drop-zone.js';
import { PrefixSumHeightIndex } from './row-height-index.js';

// Every test below draws from a 10-row plan of uniform 32px rows, so a zone boundary sits at a
// round number: row `i` spans `[32*i, 32*i + 32)`, its before/into/after thirds at 8px and 24px.
const ROW_HEIGHT = 32;
const ROW_COUNT = 10;

/** Row geometry for rows of the given own heights, each followed by its Row detail height. */
function heightsOf(rowHeights: readonly number[], details: readonly number[] = []): RowDropHeights {
  const index = new PrefixSumHeightIndex(rowHeights.length, (i) => rowHeights[i]! + (details[i] ?? 0));
  return {
    indexAtY: (y) => index.indexAtY(y),
    topAt: (i) => index.topAt(i),
    rowHeightAt: (i) => rowHeights[i]!,
    get totalHeight() {
      return index.totalHeight;
    },
  };
}

function heights(): RowDropHeights {
  return heightsOf(new Array<number>(ROW_COUNT).fill(ROW_HEIGHT));
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

  it('the source row dead zone also guards its own bottom edge when it is the last row', () => {
    // The source row is row 9 — the plan's last row, spanning [288, 320). Leaving past its own
    // bottom edge has no next row to name; without its own dead zone, one pixel of jitter there
    // flips straight to belowLastRow instead of holding sourceRow.
    const sourceRowIndex = ROW_COUNT - 1;
    expect(
      zoneAt(ROW_HEIGHT * ROW_COUNT + (ROW_CHANGE_THRESHOLD_PX - 1), SOURCE_ROW, { sourceRowIndex }),
    ).toEqual(SOURCE_ROW);
    expect(zoneAt(ROW_HEIGHT * ROW_COUNT + ROW_CHANGE_THRESHOLD_PX, SOURCE_ROW, { sourceRowIndex })).toEqual({
      kind: 'belowLastRow',
    });
  });

  it('a row zone on the last row also holds through hysteresis at the belowLastRow boundary', () => {
    const previous: RowDropZone = { kind: 'row', rowIndex: ROW_COUNT - 1, side: 'after' };
    expect(zoneAt(ROW_HEIGHT * ROW_COUNT + (DROP_ZONE_HYSTERESIS_PX - 1), previous)).toEqual(previous);
    expect(zoneAt(ROW_HEIGHT * ROW_COUNT + DROP_ZONE_HYSTERESIS_PX, previous)).toEqual({
      kind: 'belowLastRow',
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

  it('a previous zone whose rowIndex the plan has since dropped is never held through hysteresis', () => {
    // The plan shrank mid-drag from 10 rows to 9 — `previous` still names row 9, a rank the new
    // plan has no row for. The pointer sits right at the new last row's own bottom edge, squarely
    // inside the hysteresis band a stale `previous.rowIndex` would otherwise hold onto.
    const previous: RowDropZone = { kind: 'row', rowIndex: 9, side: 'after' };
    const shrunkRowCount = 9;
    const shrunkHeights = heightsOf(new Array<number>(shrunkRowCount).fill(ROW_HEIGHT));
    const zone = zoneAt(9 * ROW_HEIGHT - 1, previous, {
      rowCount: shrunkRowCount,
      heights: shrunkHeights,
    });
    expect(zone).not.toEqual(previous);
    expect(zone.kind).toBe('row');
    if (zone.kind === 'row') expect(zone.rowIndex).toBeLessThan(shrunkRowCount);
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

  describe('a Row detail under a row', () => {
    // Row 2 holds a 100px detail: row 0 spans 0-32, row 1 32-64, row 2 64-96 plus detail 96-196, row 3 196-.
    const details = [0, 0, 100];
    const withDetail = (y: number, previous: RowDropZone, overrides: Partial<RowDropZoneInput> = {}) =>
      zoneAt(y, previous, {
        heights: heightsOf(new Array<number>(ROW_COUNT).fill(ROW_HEIGHT), details),
        ...overrides,
      });

    it('a pointer over the detail is after that row', () => {
      expect(withDetail(96, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 2, side: 'after' });
      expect(withDetail(150, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 2, side: 'after' });
      expect(withDetail(195, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 2, side: 'after' });
    });

    it('the row below the detail starts at the end of the detail', () => {
      expect(withDetail(196, SOURCE_ROW)).toEqual({ kind: 'row', rowIndex: 3, side: 'before' });
    });

    it('a childrenAsSegments row is still after over its detail', () => {
      const takesWholeRowInto = (index: number) => index === 2;
      expect(withDetail(64 + 4, SOURCE_ROW, { takesWholeRowInto })).toEqual({
        kind: 'row',
        rowIndex: 2,
        side: 'into',
      });
      expect(withDetail(150, SOURCE_ROW, { takesWholeRowInto })).toEqual({
        kind: 'row',
        rowIndex: 2,
        side: 'after',
      });
    });

    it('the detail of the source row is sourceRow', () => {
      expect(withDetail(150, SOURCE_ROW, { sourceRowIndex: 2 })).toEqual({ kind: 'sourceRow' });
    });

    it('the dead zone of the source row ends at the far side of a detail above it', () => {
      // Source is row 3 (top 196). The pointer sits in row 2's detail, 2px above the source row.
      expect(withDetail(194, SOURCE_ROW, { sourceRowIndex: 3 })).toEqual({ kind: 'sourceRow' });
      expect(withDetail(150, SOURCE_ROW, { sourceRowIndex: 3 })).toEqual({
        kind: 'row',
        rowIndex: 2,
        side: 'after',
      });
    });
  });
});
