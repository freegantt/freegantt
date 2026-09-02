import { describe, expect, it } from 'vitest';
import { gridContentWidth } from './column.js';
import type { FrameColumn } from './column.js';

function column(overrides: Partial<FrameColumn> = {}): FrameColumn {
  return { key: 'name', header: 'Name', align: 'start', ...overrides };
}

describe('gridContentWidth (#126)', () => {
  it('returns paneWidth when there are no columns', () => {
    expect(gridContentWidth([], 160)).toBe(160);
  });

  it('returns paneWidth when only flex (no fixed width) columns are configured', () => {
    const columns = [column({ flex: 1 }), column({ key: 'start', flex: 1 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns paneWidth when fixed-width columns sum to less than the pane', () => {
    const columns = [column({ width: 60 }), column({ key: 'start', width: 60 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns paneWidth when fixed-width columns sum to exactly the pane', () => {
    const columns = [column({ width: 80 }), column({ key: 'start', width: 80 })];
    expect(gridContentWidth(columns, 160)).toBe(160);
  });

  it('returns the summed fixed width when it exceeds the pane', () => {
    const columns = [column({ width: 120 }), column({ key: 'start', width: 120 })];
    expect(gridContentWidth(columns, 160)).toBe(240);
  });

  it('flex columns contribute nothing to the sum, even alongside overflowing fixed columns', () => {
    const columns = [
      column({ width: 120 }),
      column({ key: 'start', width: 120 }),
      column({ key: 'end', flex: 1 }),
    ];
    expect(gridContentWidth(columns, 160)).toBe(240);
  });
});
