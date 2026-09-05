import { describe, expect, it, vi } from 'vitest';
import { ColumnChrome } from './column-chrome.js';
import type { ColumnChromePorts } from './column-chrome.js';
import type { ResolvedColumn } from '../layout/index.js';

function makePorts(overrides: Partial<ColumnChromePorts> = {}): ColumnChromePorts {
  return {
    dataset: () => ({}) as never,
    columnBind: () => ({ timeZone: 'UTC' }),
    paintColumnResizePreview: vi.fn(),
    paintColumnReorderPreview: vi.fn(),
    requestFrame: vi.fn(),
    rebindFields: vi.fn(),
    proposeColumnsChange: () => true,
    ...overrides,
  };
}

function makeResolved(overrides: Partial<ResolvedColumn> = {}): ResolvedColumn {
  return { field: 'cost', header: 'Cost', align: 'start', format: () => '', ...overrides };
}

describe('ColumnChrome.isResizable/isMovable (bug hunt B3)', () => {
  it('default true when the resolved column leaves resizable/movable unset (D-S5-18)', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);
    chrome.setResolvedColumns([makeResolved()]);

    expect(chrome.isResizable('cost')).toBe(true);
    expect(chrome.isMovable('cost')).toBe(true);
  });

  it('honours an explicit false on the resolved column', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);
    chrome.setResolvedColumns([makeResolved({ resizable: false, movable: false })]);

    expect(chrome.isResizable('cost')).toBe(false);
    expect(chrome.isMovable('cost')).toBe(false);
  });

  it('a key gridColumns no longer resolves is not capable, not the unset default (B3)', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);
    chrome.setResolvedColumns([makeResolved()]);
    // `gridColumns` dropped "cost" — the stale `#focusedHeaderField` a prior click set must not
    // still enable `Shift+Arrow` for a column no longer on the grid.
    chrome.setResolvedColumns([makeResolved({ field: 'start', header: 'Start' })]);

    expect(chrome.isResizable('cost')).toBe(false);
    expect(chrome.isMovable('cost')).toBe(false);
  });
});

describe('ColumnChrome reorder preview (S5.7, D-S5-18, #140)', () => {
  it('paints the grabbed cell offset and the drop target together, and parks both on cancel', () => {
    const paintColumnReorderPreview = vi.fn();
    const chrome = new ColumnChrome(document.createElement('div'), makePorts({ paintColumnReorderPreview }), [
      'cost',
    ]);

    chrome.previewReorder({ columnKey: 'cost', offsetPx: 24, beforeColumnKey: 'name' });
    expect(paintColumnReorderPreview).toHaveBeenCalledWith({
      columnKey: 'cost',
      offsetPx: 24,
      beforeColumnKey: 'name',
    });

    // `null` keeps its own on-screen meaning ("at the end") — only `cancelReorder` clears.
    chrome.previewReorder({ columnKey: 'cost', offsetPx: 24, beforeColumnKey: null });
    expect(paintColumnReorderPreview).toHaveBeenLastCalledWith({
      columnKey: 'cost',
      offsetPx: 24,
      beforeColumnKey: null,
    });

    chrome.cancelReorder();
    expect(paintColumnReorderPreview).toHaveBeenLastCalledWith(undefined);
  });
});
