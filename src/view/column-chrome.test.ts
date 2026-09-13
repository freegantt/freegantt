import { describe, expect, it, vi } from 'vitest';
import { ColumnChrome } from './column-chrome.js';
import type { ColumnChromePorts } from './column-chrome.js';
import type { ResolvedColumn } from '../layout/index.js';
import type { FieldKey } from '../model/index.js';

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

describe('ColumnChrome.commitWidth (S5.7, D-S5-18, #249)', () => {
  it('a resize replaces flex with width — a flex column becomes fixed once the user resizes it', () => {
    let committedTo: readonly { field: FieldKey; width?: number; flex?: number }[] = [];
    const proposeColumnsChange = (
      _from: readonly { field: FieldKey; width?: number; flex?: number }[],
      to: readonly { field: FieldKey; width?: number; flex?: number }[],
      apply: () => void,
    ): boolean => {
      committedTo = to;
      apply();
      return true;
    };
    const dataset = () => ({
      field: (key: FieldKey) => (String(key) === 'cost' ? { key: 'cost', column: {} } : undefined),
      fields: { all: [] },
      timeZone: 'UTC',
    });
    const chrome = new ColumnChrome(
      document.createElement('div'),
      makePorts({ proposeColumnsChange, dataset: dataset as unknown as ColumnChromePorts['dataset'] }),
      [{ field: 'cost', flex: 2 }],
    );
    chrome.setResolvedColumns([makeResolved({ flex: 2 })]);

    chrome.commitWidth('cost', 150);

    expect(committedTo[0]).toMatchObject({ field: 'cost', width: 150 });
    expect(committedTo[0]).not.toHaveProperty('flex');
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

// #275 item 1: `resizeStep`/`moveStep`/`commitReorder`/`cancelResize`/`currentWidthPx` and the
// `focusedHeaderField` getter ran under no test before this — only the command layer that forwards
// a key and a direction to them (`core-commands.test.ts`) did. These run the real implementation.
describe('ColumnChrome.resizeStep (Shift+Arrow, D-S5-18, D-S5-26)', () => {
  const dataset = () => ({
    field: (key: FieldKey) => (String(key) === 'cost' ? { key: 'cost', column: {} } : undefined),
    fields: { all: [] },
    timeZone: 'UTC',
  });

  function chromeWithWidth(widthPx: number): {
    chrome: ColumnChrome;
    committedWidths: number[];
  } {
    const committedWidths: number[] = [];
    const proposeColumnsChange: ColumnChromePorts['proposeColumnsChange'] = (_from, to, apply) => {
      committedWidths.push((to[0] as { width?: number }).width!);
      apply();
      return true;
    };
    const chrome = new ColumnChrome(
      document.createElement('div'),
      makePorts({ proposeColumnsChange, dataset: dataset as unknown as ColumnChromePorts['dataset'] }),
      ['cost'],
    );
    chrome.setResolvedColumns([makeResolved({ width: widthPx })]);
    return { chrome, committedWidths };
  }

  it('widens and narrows by one step off the column’s current on-screen width', () => {
    const { chrome, committedWidths } = chromeWithWidth(60);

    chrome.resizeStep('cost', 1);
    expect(committedWidths).toEqual([76]);

    chrome.resizeStep('cost', -1);
    // The commit above lands the resolved width back at 60 (via `setResolvedColumns` in a real
    // render pass); this harness never re-resolves, so the second step still reads the original 60.
    expect(committedWidths).toEqual([76, 44]);
  });

  it('never narrows below the min-width floor (D-S5-18)', () => {
    const { chrome, committedWidths } = chromeWithWidth(50);

    // 50 - 16 = 34, below the default 40px floor: the floor wins.
    chrome.resizeStep('cost', -1);
    expect(committedWidths).toEqual([40]);
  });
});

describe('ColumnChrome.moveStep (Alt+Arrow, D-S5-18, D-S5-26)', () => {
  const dataset = () => ({
    field: (key: FieldKey) => ({ key: String(key), column: {} }),
    fields: { all: [] },
    timeZone: 'UTC',
  });

  function threeColumnChrome(proposeColumnsChange: ColumnChromePorts['proposeColumnsChange']) {
    const chrome = new ColumnChrome(
      document.createElement('div'),
      makePorts({ proposeColumnsChange, dataset: dataset as unknown as ColumnChromePorts['dataset'] }),
      ['cost', 'name', 'start'],
    );
    chrome.setResolvedColumns([
      makeResolved({ field: 'cost' }),
      makeResolved({ field: 'name' }),
      makeResolved({ field: 'start' }),
    ]);
    return chrome;
  }

  it('moving right commits the reorder one slot over', () => {
    let committedTo: readonly { field: FieldKey }[] = [];
    const chrome = threeColumnChrome((_from, to, apply) => {
      committedTo = to;
      apply();
      return true;
    });

    chrome.moveStep('cost', 1);

    expect(committedTo.map((c) => c.field)).toEqual(['name', 'cost', 'start']);
  });

  it('moving left commits the reorder one slot back', () => {
    let committedTo: readonly { field: FieldKey }[] = [];
    const chrome = threeColumnChrome((_from, to, apply) => {
      committedTo = to;
      apply();
      return true;
    });

    chrome.moveStep('start', -1);

    expect(committedTo.map((c) => c.field)).toEqual(['cost', 'start', 'name']);
  });

  it('is a silent no-op at either edge — nothing left to point the index at', () => {
    const proposeColumnsChange = vi.fn(() => true);
    const chrome = threeColumnChrome(proposeColumnsChange);

    chrome.moveStep('cost', -1); // already first
    chrome.moveStep('start', 1); // already last

    expect(proposeColumnsChange).not.toHaveBeenCalled();
  });

  it('a column not on the resolved grid is also a no-op', () => {
    const proposeColumnsChange = vi.fn(() => true);
    const chrome = threeColumnChrome(proposeColumnsChange);

    chrome.moveStep('missing', 1);

    expect(proposeColumnsChange).not.toHaveBeenCalled();
  });
});

describe('ColumnChrome.cancelResize (Escape / a vetoed commit, D-S5-18)', () => {
  it('clears the live resize preview and queues a real frame to repaint the resolved geometry', () => {
    const paintColumnResizePreview = vi.fn();
    const requestFrame = vi.fn();
    const chrome = new ColumnChrome(
      document.createElement('div'),
      makePorts({ paintColumnResizePreview, requestFrame }),
      ['cost'],
    );

    chrome.cancelResize();

    expect(paintColumnResizePreview).toHaveBeenCalledWith(undefined);
    expect(requestFrame).toHaveBeenCalledOnce();
  });
});

describe('ColumnChrome.currentWidthPx (the first keyboard resize’s starting width)', () => {
  it('a resolved column that already carries a width answers that width directly', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);
    chrome.setResolvedColumns([makeResolved({ width: 90 })]);

    expect(chrome.currentWidthPx('cost')).toBe(90);
  });

  it('a flex column with no header cell mounted falls back to DEFAULT_COLUMN_WIDTH_FALLBACK_PX (120)', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);
    chrome.setResolvedColumns([makeResolved({ flex: 1 })]);

    expect(chrome.currentWidthPx('cost')).toBe(120);
  });

  it('a flex column with its header cell mounted reads the on-screen width instead of guessing', () => {
    const container = document.createElement('div');
    const cell = document.createElement('div');
    cell.className = 'fg-col-header';
    cell.dataset['field'] = 'cost';
    cell.style.width = '77px';
    container.appendChild(cell);
    document.body.appendChild(container);
    try {
      const chrome = new ColumnChrome(container, makePorts(), ['cost']);
      chrome.setResolvedColumns([makeResolved({ flex: 1 })]);

      expect(chrome.currentWidthPx('cost')).toBe(77);
    } finally {
      container.remove();
    }
  });
});

describe('ColumnChrome.focusedHeaderField (get/set)', () => {
  it('starts undefined and reports back whatever setFocusedColumn last set', () => {
    const chrome = new ColumnChrome(document.createElement('div'), makePorts(), ['cost']);

    expect(chrome.focusedHeaderField).toBeUndefined();

    chrome.setFocusedColumn('cost');
    expect(chrome.focusedHeaderField).toBe('cost');

    chrome.setFocusedColumn(undefined);
    expect(chrome.focusedHeaderField).toBeUndefined();
  });
});
