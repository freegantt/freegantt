import { afterEach, describe, expect, it, vi } from 'vitest';
import { RovingFocus } from './roving-focus.js';
import type { RovingFocusPorts, RovingFocusRow } from './roving-focus.js';
import { entryId, barId, rowId } from '../model/index.js';
import type { RowId } from '../model/index.js';

// #275 item 2: `roving-focus.ts` had no sibling test file at all. Start where the work order says
// the silent-break risk is — `#handleHeaderKeyDown` (never run), `#focusHeaderCell` (never called,
// which is what item 1's keyboard column chords act on once a header cell is focused), `#selectRow`
// (never called), and the pointer-vs-keyboard `focusin` split (a regression already happened once
// on the timeline half of it, per the comment on `#handleTimelineFocusIn`).

function makePane(tag = 'div'): HTMLElement {
  return document.createElement(tag);
}

function makeHeaderCell(field: string): HTMLElement {
  const cell = makePane();
  cell.className = 'fg-col-header';
  cell.dataset['field'] = field;
  cell.tabIndex = -1;
  return cell;
}

function makeRow(id: RowId, fields: readonly string[]): HTMLElement {
  const row = makePane();
  row.className = 'fg-row';
  row.dataset['rowId'] = id;
  row.tabIndex = -1;
  for (const field of fields) {
    const cell = makePane();
    cell.className = 'fg-row-cell';
    cell.dataset['field'] = field;
    cell.tabIndex = -1;
    row.appendChild(cell);
  }
  return row;
}

function makeBar(barId: string): HTMLElement {
  const bar = makePane();
  bar.className = 'fg-bar';
  bar.dataset['barId'] = barId;
  bar.tabIndex = -1;
  return bar;
}

function makePorts(overrides: Partial<RovingFocusPorts> = {}): RovingFocusPorts {
  return {
    plannedRows: () => [],
    columnKeys: () => [],
    rowIdForEntry: () => undefined,
    rowsPerPage: () => 5,
    collapseRow: vi.fn(),
    expandRow: vi.fn(),
    selectOnFocus: vi.fn(),
    setFocusedColumn: vi.fn(),
    revealRow: vi.fn(),
    revealEntry: vi.fn(),
    ...overrides,
  };
}

interface Harness {
  gridHeader: HTMLElement;
  rows: HTMLElement;
  timeline: HTMLElement;
  roving: RovingFocus;
  ports: { [K in keyof RovingFocusPorts]: RovingFocusPorts[K] };
  dispatchHeaderKey(cell: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): void;
  dispatchGridKey(target: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): void;
  dispatchTimelineKey(target: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): void;
}

function buildHarness(portOverrides: Partial<RovingFocusPorts> = {}): Harness {
  const grid = makePane();
  const rows = makePane();
  const gridHeader = makePane();
  const timeline = makePane();
  const splitter = makePane();
  const overlay = makePane();
  grid.appendChild(rows);
  grid.appendChild(gridHeader);
  document.body.append(grid, timeline, splitter, overlay);

  const ports = makePorts(portOverrides);
  const roving = new RovingFocus({ grid, rows, gridHeader, timeline, splitter, overlay }, ports);

  const fire = (target: HTMLElement, type: string, init: KeyboardEventInit): void => {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
  };

  return {
    gridHeader,
    rows,
    timeline,
    roving,
    ports,
    dispatchHeaderKey: (cell, key, options) => fire(cell, 'keydown', { key, ...options }),
    dispatchGridKey: (target, key, options) => fire(target, 'keydown', { key, ...options }),
    dispatchTimelineKey: (target, key, options) => fire(target, 'keydown', { key, ...options }),
  };
}

describe('RovingFocus — header cell keyboard nav (#handleHeaderKeyDown, D-S5-26)', () => {
  let harness: Harness;

  afterEach(() => {
    harness.roving.detach();
    document.body.replaceChildren();
  });

  it('ArrowRight moves focus to the next header cell and reports it through setFocusedColumn', () => {
    harness = buildHarness();
    const cost = makeHeaderCell('cost');
    const name = makeHeaderCell('name');
    harness.gridHeader.append(cost, name);
    cost.focus();

    harness.dispatchHeaderKey(cost, 'ArrowRight');

    expect(harness.ports.setFocusedColumn).toHaveBeenCalledWith('name');
    expect(document.activeElement).toBe(name);
  });

  it('ArrowLeft moves focus back to the previous header cell', () => {
    harness = buildHarness();
    const cost = makeHeaderCell('cost');
    const name = makeHeaderCell('name');
    harness.gridHeader.append(cost, name);
    name.focus();
    // Arriving via `.focus()` alone runs `#handleGridFocusIn`, which already sets `#gridFocus` to
    // `name` — the same arrival path a pointer click or Tab takes.

    harness.dispatchHeaderKey(name, 'ArrowLeft');

    expect(harness.ports.setFocusedColumn).toHaveBeenLastCalledWith('cost');
    expect(document.activeElement).toBe(cost);
  });

  it('ArrowRight at the last header cell is a bounds-guarded no-op', () => {
    harness = buildHarness();
    const cost = makeHeaderCell('cost');
    const name = makeHeaderCell('name');
    harness.gridHeader.append(cost, name);
    name.focus();
    vi.mocked(harness.ports.setFocusedColumn).mockClear();

    harness.dispatchHeaderKey(name, 'ArrowRight');

    expect(harness.ports.setFocusedColumn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(name);
  });

  it('ArrowLeft at the first header cell is a bounds-guarded no-op', () => {
    harness = buildHarness();
    const cost = makeHeaderCell('cost');
    const name = makeHeaderCell('name');
    harness.gridHeader.append(cost, name);
    cost.focus();
    vi.mocked(harness.ports.setFocusedColumn).mockClear();

    harness.dispatchHeaderKey(cost, 'ArrowLeft');

    expect(harness.ports.setFocusedColumn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cost);
  });

  it('ArrowDown from a header cell steps into the first planned row', () => {
    const row1: RovingFocusRow = {
      id: rowId('r1'),
      entryIds: [entryId('e1')],
      expandable: false,
      expanded: false,
    };
    harness = buildHarness({ plannedRows: () => [row1] });
    const cost = makeHeaderCell('cost');
    harness.gridHeader.append(cost);
    const gridRow = makeRow(rowId('r1'), ['cost']);
    harness.rows.append(gridRow);
    cost.focus();

    harness.dispatchHeaderKey(cost, 'ArrowDown');

    // `#focusGridRow` clears the header pick and reveals/selects the row it lands on.
    expect(harness.ports.setFocusedColumn).toHaveBeenLastCalledWith(undefined);
    expect(harness.ports.revealRow).toHaveBeenCalledWith(0);
    expect(harness.ports.selectOnFocus).toHaveBeenCalledWith({ kind: 'row', rowId: rowId('r1') });
    // The header's own focused field ('cost') travels with the step down, landing on that row's
    // matching cell rather than the row itself.
    expect(document.activeElement).toBe(gridRow.querySelector('[data-field="cost"]'));
  });

  it('ArrowDown with no planned rows is a no-op', () => {
    harness = buildHarness({ plannedRows: () => [] });
    const cost = makeHeaderCell('cost');
    harness.gridHeader.append(cost);
    cost.focus();

    harness.dispatchHeaderKey(cost, 'ArrowDown');

    expect(harness.ports.revealRow).not.toHaveBeenCalled();
  });

  it('a modified chord (Alt/Shift/Ctrl/Meta) is left alone — those are resize/move chords elsewhere', () => {
    harness = buildHarness();
    const cost = makeHeaderCell('cost');
    const name = makeHeaderCell('name');
    harness.gridHeader.append(cost, name);
    cost.focus();
    vi.mocked(harness.ports.setFocusedColumn).mockClear();

    harness.dispatchHeaderKey(cost, 'ArrowRight', { altKey: true });

    expect(harness.ports.setFocusedColumn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cost);
  });
});

describe('RovingFocus — grid row Shift+Space (#selectRow, never called before)', () => {
  it('proposes the row’s own Selection, distinct from arrow navigation’s own proposal', () => {
    const row1: RovingFocusRow = {
      id: rowId('r1'),
      entryIds: [entryId('e1')],
      expandable: false,
      expanded: false,
    };
    const harness = buildHarness({ plannedRows: () => [row1] });
    const gridRow = makeRow(rowId('r1'), ['name']);
    harness.rows.append(gridRow);
    gridRow.focus();
    vi.mocked(harness.ports.selectOnFocus).mockClear();

    harness.dispatchGridKey(gridRow, ' ', { shiftKey: true });

    expect(harness.ports.selectOnFocus).toHaveBeenCalledWith({ kind: 'row', rowId: rowId('r1') });

    harness.roving.detach();
    document.body.replaceChildren();
  });

  it('plain Space (no Shift) does not select — only Shift+Space does', () => {
    const row1: RovingFocusRow = {
      id: rowId('r1'),
      entryIds: [entryId('e1')],
      expandable: false,
      expanded: false,
    };
    const harness = buildHarness({ plannedRows: () => [row1] });
    const gridRow = makeRow(rowId('r1'), ['name']);
    harness.rows.append(gridRow);
    gridRow.focus();
    vi.mocked(harness.ports.selectOnFocus).mockClear();

    harness.dispatchGridKey(gridRow, ' ');

    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();

    harness.roving.detach();
    document.body.replaceChildren();
  });
});

describe('RovingFocus — pointer-vs-keyboard focusin split (regression guard, timeline pane)', () => {
  it('a pointer-caused arrival does not re-propose selection or re-reveal — it already ran on pointerdown/up', () => {
    const harness = buildHarness();
    const bar = makeBar(barId(entryId('e1')));
    harness.timeline.append(bar);

    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    bar.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();
    expect(harness.ports.revealEntry).not.toHaveBeenCalled();

    harness.roving.detach();
    document.body.replaceChildren();
  });

  it('a keyboard-caused arrival (no preceding pointerdown) does propose selection and reveal', () => {
    const harness = buildHarness();
    const bar = makeBar(barId(entryId('e1')));
    harness.timeline.append(bar);

    bar.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(harness.ports.selectOnFocus).toHaveBeenCalledWith({ kind: 'bar', barId: barId(entryId('e1')) });
    expect(harness.ports.revealEntry).toHaveBeenCalledWith(entryId('e1'));

    harness.roving.detach();
    document.body.replaceChildren();
  });

  it('the same split holds on the grid pane: a pointer arrival on a row skips the re-proposal', () => {
    const row1: RovingFocusRow = {
      id: rowId('r1'),
      entryIds: [entryId('e1')],
      expandable: false,
      expanded: false,
    };
    const harness = buildHarness({ plannedRows: () => [row1] });
    const gridRow = makeRow(rowId('r1'), ['name']);
    harness.rows.append(gridRow);

    gridRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    gridRow.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();
    expect(harness.ports.setFocusedColumn).toHaveBeenCalledWith(undefined);

    harness.roving.detach();
    document.body.replaceChildren();
  });

  it('a keyboard arrival on a row (Tab, no pointerdown) does propose the row’s selection', () => {
    const row1: RovingFocusRow = {
      id: rowId('r1'),
      entryIds: [entryId('e1')],
      expandable: false,
      expanded: false,
    };
    const harness = buildHarness({ plannedRows: () => [row1] });
    const gridRow = makeRow(rowId('r1'), ['name']);
    harness.rows.append(gridRow);

    gridRow.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(harness.ports.selectOnFocus).toHaveBeenCalledWith({ kind: 'row', rowId: rowId('r1') });

    harness.roving.detach();
    document.body.replaceChildren();
  });
});
