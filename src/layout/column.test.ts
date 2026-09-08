import { describe, expect, it } from 'vitest';
import { gridContentWidth, totalColumnWidth } from './column.js';
import type { FrameColumn } from './column.js';

function column(overrides: Partial<FrameColumn> = {}): FrameColumn {
  return { field: 'name', header: 'Name', align: 'start', ...overrides };
}

describe('totalColumnWidth (#139)', () => {
  it("sums the fixed widths — where the last column's right edge falls", () => {
    expect(totalColumnWidth([column({ width: 240 }), column({ field: 'start', width: 120 })])).toBe(360);
  });

  it('an empty column set has an edge of its own: zero', () => {
    expect(totalColumnWidth([])).toBe(0);
  });

  it('a flex column leaves the set with no edge to name', () => {
    const columns = [column({ width: 240 }), column({ field: 'start', flex: 1 })];
    expect(totalColumnWidth(columns)).toBeUndefined();
  });
});

describe('gridContentWidth (#126)', () => {
  it('returns paneWidth when there are no columns', () => {
    expect(gridContentWidth([], 160)).toBe(160);
  });

  it('returns paneWidth when only flex (no fixed width) columns are configured', () => {
    const columns = [column({ flex: 1 }), column({ field: 'start', flex: 1 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns paneWidth when fixed-width columns sum to less than the pane', () => {
    const columns = [column({ width: 60 }), column({ field: 'start', width: 60 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns paneWidth when fixed-width columns sum to exactly the pane', () => {
    const columns = [column({ width: 80 }), column({ field: 'start', width: 80 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns the summed fixed width when it exceeds the pane', () => {
    const columns = [column({ width: 120 }), column({ field: 'start', width: 120 })];
    expect(gridContentWidth(columns, 160)).toBe(240);
  });

  it('flex columns contribute nothing to the sum, even alongside overflowing fixed columns', () => {
    const columns = [
      column({ width: 120 }),
      column({ field: 'start', width: 120 }),
      column({ field: 'end', flex: 1 }),
    ];
    expect(gridContentWidth(columns, 160)).toBe(240);
  });
});
