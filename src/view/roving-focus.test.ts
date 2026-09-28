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
  dispatchHeaderKey(cell: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): KeyboardEvent;
  dispatchGridKey(target: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): KeyboardEvent;
  dispatchTimelineKey(target: HTMLElement, key: string, options?: Partial<KeyboardEventInit>): KeyboardEvent;
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

  const fire = (target: HTMLElement, type: string, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
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

describe('RovingFocus — grid row keys (#handleGridKeyDown)', () => {
  let harness: Harness;

  afterEach(() => {
    harness.roving.detach();
    document.body.replaceChildren();
  });

  function leaf(id: string): RovingFocusRow {
    return { id: rowId(id), entryIds: [entryId(id)], expandable: false, expanded: false };
  }

  function mountRows(ids: readonly string[], columns: readonly string[] = ['name']): HTMLElement[] {
    const planned = ids.map(leaf);
    harness = buildHarness({
      plannedRows: () => planned,
      columnKeys: () => columns,
      rowsPerPage: () => 2,
    });
    return ids.map((id) => {
      const node = makeRow(rowId(id), columns);
      harness.rows.append(node);
      return node;
    });
  }

  it('ArrowDown and ArrowUp move focus one row and clamp at the ends', () => {
    const [r1, r2, r3] = mountRows(['r1', 'r2', 'r3']);
    r1!.focus();

    expect(harness.dispatchGridKey(r1!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r2);

    expect(harness.dispatchGridKey(r2!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r3);

    expect(harness.dispatchGridKey(r3!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r3);

    expect(harness.dispatchGridKey(r3!, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r2);
  });

  it('Shift+ArrowDown still moves one row and prevents default — Shift is not a grid-row chord guard', () => {
    const [r1, r2] = mountRows(['r1', 'r2']);
    r1!.focus();

    expect(harness.dispatchGridKey(r1!, 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r2);
  });

  it('Home and End jump to the first and last row', () => {
    const [r1, , r3] = mountRows(['r1', 'r2', 'r3']);
    r1!.focus();

    expect(harness.dispatchGridKey(r1!, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r3);

    expect(harness.dispatchGridKey(r3!, 'Home').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r1);
  });

  it('PageDown and PageUp move by rowsPerPage, floored to at least one row', () => {
    const nodes = mountRows(['r1', 'r2', 'r3', 'r4', 'r5']);
    nodes[0]!.focus();

    expect(harness.dispatchGridKey(nodes[0]!, 'PageDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nodes[2]);

    expect(harness.dispatchGridKey(nodes[2]!, 'PageUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nodes[0]);
  });

  it('PageDown still moves one row when rowsPerPage is zero', () => {
    const planned = [leaf('r1'), leaf('r2')];
    harness = buildHarness({ plannedRows: () => planned, rowsPerPage: () => 0 });
    const r1 = makeRow(rowId('r1'), ['name']);
    const r2 = makeRow(rowId('r2'), ['name']);
    harness.rows.append(r1, r2);
    r1.focus();

    expect(harness.dispatchGridKey(r1, 'PageDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r2);
  });

  it('ArrowRight on a leaf row steps into the first cell; ArrowLeft steps back to the row', () => {
    const [r1] = mountRows(['r1'], ['name', 'cost']);
    r1!.focus();

    expect(harness.dispatchGridKey(r1!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r1!.querySelector('[data-field="name"]'));

    expect(harness.dispatchGridKey(document.activeElement as HTMLElement, 'ArrowLeft').defaultPrevented).toBe(
      true,
    );
    expect(document.activeElement).toBe(r1);
  });

  it('a Ctrl, Meta, or Alt chord is left alone', () => {
    const [r1] = mountRows(['r1', 'r2']);
    r1!.focus();

    expect(harness.dispatchGridKey(r1!, 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchGridKey(r1!, 'ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchGridKey(r1!, 'ArrowDown', { altKey: true }).defaultPrevented).toBe(false);

    expect(document.activeElement).toBe(r1);
    expect(harness.ports.revealRow).not.toHaveBeenCalled();
  });

  it('an unknown key and an empty pane are no-ops', () => {
    const [r1] = mountRows(['r1']);
    r1!.focus();
    vi.mocked(harness.ports.revealRow).mockClear();

    expect(harness.dispatchGridKey(r1!, 'x').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(r1);
    expect(harness.ports.revealRow).not.toHaveBeenCalled();

    harness.roving.detach();
    document.body.replaceChildren();
    harness = buildHarness({ plannedRows: () => [] });
    const empty = makeRow(rowId('gone'), ['name']);
    harness.rows.append(empty);
    empty.focus();

    expect(harness.dispatchGridKey(empty, 'ArrowDown').defaultPrevented).toBe(false);
    expect(harness.ports.revealRow).not.toHaveBeenCalled();
  });

  it('ArrowDown with no row focus yet starts at the first row, then steps to the second', () => {
    const nodes = mountRows(['r1', 'r2']);

    harness.dispatchGridKey(harness.rows, 'ArrowDown');
    expect(document.activeElement).toBe(nodes[1]);
  });

  it('ArrowDown from a header focus still starts at the first planned row, then steps to the second', () => {
    const planned = [leaf('r1'), leaf('r2')];
    harness = buildHarness({ plannedRows: () => planned, columnKeys: () => ['name'] });
    const cost = makeHeaderCell('cost');
    harness.gridHeader.append(cost);
    const r1 = makeRow(rowId('r1'), ['name']);
    const r2 = makeRow(rowId('r2'), ['name']);
    harness.rows.append(r1, r2);
    cost.focus();

    harness.dispatchGridKey(harness.rows, 'ArrowDown');
    expect(document.activeElement).toBe(r2);
  });

  it('ArrowDown from a remembered row that left the plan falls back, then steps to the next row', () => {
    let planned = [leaf('r1'), leaf('r2'), leaf('r3')];
    harness = buildHarness({ plannedRows: () => planned, columnKeys: () => ['name'] });
    const r1 = makeRow(rowId('r1'), ['name']);
    const r2 = makeRow(rowId('r2'), ['name']);
    const r3 = makeRow(rowId('r3'), ['name']);
    harness.rows.append(r1, r2, r3);
    r1.focus();

    planned = [leaf('r2'), leaf('r3')];
    harness.dispatchGridKey(r1, 'ArrowDown');
    expect(document.activeElement).toBe(r3);
  });
});

describe('RovingFocus — horizontal arrows step a cell or toggle a row', () => {
  let harness: Harness;

  afterEach(() => {
    harness.roving.detach();
    document.body.replaceChildren();
  });

  function expandable(id: string, expanded: boolean): RovingFocusRow {
    return { id: rowId(id), entryIds: [entryId(id)], expandable: true, expanded };
  }

  function leaf(id: string): RovingFocusRow {
    return { id: rowId(id), entryIds: [entryId(id)], expandable: false, expanded: false };
  }

  function mount(row: RovingFocusRow, columns: readonly string[] = ['name', 'cost']): HTMLElement {
    harness = buildHarness({
      plannedRows: () => [row],
      columnKeys: () => columns,
    });
    const node = makeRow(row.id, columns);
    harness.rows.append(node);
    return node;
  }

  function mountRowsThenLeaveFirstFromRowPlan(): { r1: HTMLElement; r2: HTMLElement } {
    let planned = [leaf('r1'), leaf('r2')];
    harness = buildHarness({
      plannedRows: () => planned,
      columnKeys: () => ['name', 'cost'],
    });
    const r1 = makeRow(rowId('r1'), ['name', 'cost']);
    const r2 = makeRow(rowId('r2'), ['name', 'cost']);
    harness.rows.append(r1, r2);
    r1.focus();
    planned = [leaf('r2')];
    return { r1, r2 };
  }

  it('ArrowRight on a collapsed expandable row expands it and stays on the row', () => {
    const node = mount(expandable('r1', false));
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowRight').defaultPrevented).toBe(true);

    expect(harness.ports.expandRow).toHaveBeenCalledWith(rowId('r1'));
    expect(harness.ports.collapseRow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(node);
  });

  it('ArrowRight on an already-expanded row steps into the first cell', () => {
    const node = mount(expandable('r1', true));
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowRight').defaultPrevented).toBe(true);

    expect(harness.ports.expandRow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(node.querySelector('[data-field="name"]'));
  });

  it('ArrowRight on a leaf row with no columns stays on the row', () => {
    const node = mount(leaf('r1'), []);
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowRight').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(node);
    expect(harness.ports.revealRow).not.toHaveBeenCalled();
  });

  it('ArrowLeft on an expanded row collapses it and stays on the row', () => {
    const node = mount(expandable('r1', true));
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowLeft').defaultPrevented).toBe(true);

    expect(harness.ports.collapseRow).toHaveBeenCalledWith(rowId('r1'));
    expect(document.activeElement).toBe(node);
  });

  it('ArrowLeft on a collapsed expandable row is a no-move', () => {
    const node = mount(expandable('r1', false));
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowLeft').defaultPrevented).toBe(true);

    expect(harness.ports.collapseRow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(node);
  });

  it('ArrowLeft on a leaf row is a no-move', () => {
    const node = mount(leaf('r1'));
    node.focus();

    expect(harness.dispatchGridKey(node, 'ArrowLeft').defaultPrevented).toBe(true);

    expect(harness.ports.collapseRow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(node);
  });

  it('ArrowRight from a cell steps to the next cell; ArrowLeft steps back', () => {
    const node = mount(leaf('r1'));
    node.focus();
    expect(harness.dispatchGridKey(node, 'ArrowRight').defaultPrevented).toBe(true);

    expect(
      harness.dispatchGridKey(document.activeElement as HTMLElement, 'ArrowRight').defaultPrevented,
    ).toBe(true);
    expect(document.activeElement).toBe(node.querySelector('[data-field="cost"]'));

    expect(harness.dispatchGridKey(document.activeElement as HTMLElement, 'ArrowLeft').defaultPrevented).toBe(
      true,
    );
    expect(document.activeElement).toBe(node.querySelector('[data-field="name"]'));
  });

  it('ArrowRight on the last cell is a no-move', () => {
    const node = mount(leaf('r1'));
    node.focus();
    harness.dispatchGridKey(node, 'ArrowRight');
    harness.dispatchGridKey(document.activeElement as HTMLElement, 'ArrowRight');
    const last = node.querySelector('[data-field="cost"]');
    vi.mocked(harness.ports.revealRow).mockClear();

    expect(harness.dispatchGridKey(last as HTMLElement, 'ArrowRight').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(last);
    expect(harness.ports.revealRow).not.toHaveBeenCalled();
  });

  it('ArrowRight with no row focus yet steps into the first cell of the first row', () => {
    const node = mount(leaf('r1'));

    expect(harness.dispatchGridKey(harness.rows, 'ArrowRight').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(node.querySelector('[data-field="name"]'));
  });

  it('ArrowLeft with no row focus yet on an expanded first row collapses it', () => {
    const node = mount(expandable('r1', true));
    const before = document.activeElement;

    expect(harness.dispatchGridKey(harness.rows, 'ArrowLeft').defaultPrevented).toBe(true);

    expect(harness.ports.collapseRow).toHaveBeenCalledWith(rowId('r1'));
    expect(document.activeElement).toBe(before);
    expect(document.activeElement).not.toBe(node);
  });

  it('ArrowRight from a remembered row that left the plan steps into the first surviving row’s first cell', () => {
    const { r1, r2 } = mountRowsThenLeaveFirstFromRowPlan();

    expect(harness.dispatchGridKey(r1, 'ArrowRight').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(r2.querySelector('[data-field="name"]'));
  });

  it('ArrowLeft from a cell whose row left the plan steps back out to the first surviving row', () => {
    const { r1, r2 } = mountRowsThenLeaveFirstFromRowPlan();
    const nameCell = r1.querySelector('[data-field="name"]') as HTMLElement;
    nameCell.focus();

    expect(harness.dispatchGridKey(nameCell, 'ArrowLeft').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(r2);
  });

  it('ArrowRight from a cell whose row left the plan steps to the next cell of the first surviving row', () => {
    const { r1, r2 } = mountRowsThenLeaveFirstFromRowPlan();
    const nameCell = r1.querySelector('[data-field="name"]') as HTMLElement;
    nameCell.focus();

    expect(harness.dispatchGridKey(nameCell, 'ArrowRight').defaultPrevented).toBe(true);

    expect(document.activeElement).toBe(r2.querySelector('[data-field="cost"]'));
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

    expect(harness.dispatchGridKey(gridRow, ' ', { shiftKey: true }).defaultPrevented).toBe(true);

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

    expect(harness.dispatchGridKey(gridRow, ' ').defaultPrevented).toBe(false);

    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();

    harness.roving.detach();
    document.body.replaceChildren();
  });
});

describe('RovingFocus — timeline bar keys (#handleTimelineKeyDown)', () => {
  let harness: Harness;

  afterEach(() => {
    harness.roving.detach();
    document.body.replaceChildren();
  });

  function mountBars(ids: readonly string[], plannedIds: readonly string[] = ids): HTMLElement[] {
    const planned: RovingFocusRow[] = plannedIds.map((id) => ({
      id: rowId(id),
      entryIds: ids.includes(id) ? [entryId(id)] : [],
      expandable: false,
      expanded: false,
    }));
    const rowByEntry = new Map(ids.map((id) => [entryId(id), rowId(id)] as const));
    harness = buildHarness({
      plannedRows: () => planned,
      rowIdForEntry: (id) => rowByEntry.get(id),
    });
    return ids.map((id) => {
      const node = makeBar(barId(entryId(id)));
      harness.timeline.append(node);
      return node;
    });
  }

  function mountBarsOnOneRow(ids: readonly string[]): HTMLElement[] {
    harness = buildHarness({
      plannedRows: () => [
        { id: rowId('r1'), entryIds: ids.map(entryId), expandable: false, expanded: false },
      ],
      rowIdForEntry: () => rowId('r1'),
    });
    return ids.map((id) => {
      const node = makeBar(barId(entryId(id)));
      harness.timeline.append(node);
      return node;
    });
  }

  it('ArrowDown and ArrowUp move focus one row and do not move past the ends', () => {
    const [b1, b2, b3] = mountBars(['e1', 'e2', 'e3']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);

    expect(harness.dispatchTimelineKey(b2!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b3);

    expect(harness.dispatchTimelineKey(b3!, 'ArrowDown').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b3);

    expect(harness.dispatchTimelineKey(b3!, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);

    expect(harness.dispatchTimelineKey(b2!, 'ArrowUp').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1);

    expect(harness.dispatchTimelineKey(b1!, 'ArrowUp').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b1);
  });

  it('Shift+ArrowDown still moves one row — Shift is not a timeline-bar chord guard', () => {
    const [b1, b2] = mountBars(['e1', 'e2']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);
  });

  it('Alt+ArrowDown still moves one row — Alt is not a timeline-bar chord guard', () => {
    const [b1, b2] = mountBars(['e1', 'e2']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown', { altKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b2);
  });

  it('Home and End focus the first and last bar of the focused row', () => {
    const [first, , last] = mountBarsOnOneRow(['e1', 'e2', 'e3']);
    first!.focus();

    expect(harness.dispatchTimelineKey(first!, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    expect(harness.dispatchTimelineKey(last!, 'Home').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('plain ArrowLeft and ArrowRight leave focus where it is — those keys nudge, they do not navigate', () => {
    const [b1, b2] = mountBars(['e1', 'e2']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowRight').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b1);

    expect(harness.dispatchTimelineKey(b1!, 'ArrowLeft').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b1);
    expect(document.activeElement).not.toBe(b2);
  });

  it('Shift+ArrowLeft and Alt+ArrowLeft are left alone — they are not a nudge and not a bar move', () => {
    const [b1] = mountBars(['e1', 'e2']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowLeft', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchTimelineKey(b1!, 'ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchTimelineKey(b1!, 'ArrowRight', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchTimelineKey(b1!, 'ArrowRight', { altKey: true }).defaultPrevented).toBe(false);

    expect(document.activeElement).toBe(b1);
  });

  it('a Ctrl or Meta chord is left alone', () => {
    const [b1] = mountBars(['e1', 'e2']);
    b1!.focus();
    vi.mocked(harness.ports.revealEntry).mockClear();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);

    expect(document.activeElement).toBe(b1);
    expect(harness.ports.revealEntry).not.toHaveBeenCalled();
  });

  it('plain Space selects the focused bar; Shift+Space does not', () => {
    const [b1] = mountBars(['e1']);
    b1!.focus();
    vi.mocked(harness.ports.selectOnFocus).mockClear();

    expect(harness.dispatchTimelineKey(b1!, ' ').defaultPrevented).toBe(true);
    expect(harness.ports.selectOnFocus).toHaveBeenCalledWith({ kind: 'bar', barId: barId(entryId('e1')) });

    vi.mocked(harness.ports.selectOnFocus).mockClear();
    expect(harness.dispatchTimelineKey(b1!, ' ', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(b1);
  });

  it('Space with no focused bar is a no-op', () => {
    const [b1] = mountBars(['e1']);

    expect(harness.dispatchTimelineKey(harness.timeline, ' ').defaultPrevented).toBe(false);
    expect(harness.ports.selectOnFocus).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(b1);
  });

  it('an unknown key and an empty pane are no-ops', () => {
    const [b1] = mountBars(['e1']);
    b1!.focus();
    vi.mocked(harness.ports.revealEntry).mockClear();

    expect(harness.dispatchTimelineKey(b1!, 'x').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b1);
    expect(harness.ports.revealEntry).not.toHaveBeenCalled();

    harness.roving.detach();
    document.body.replaceChildren();
    harness = buildHarness();

    expect(harness.dispatchTimelineKey(harness.timeline, 'ArrowDown').defaultPrevented).toBe(false);
    expect(harness.ports.revealEntry).not.toHaveBeenCalled();
  });

  it('ArrowDown with no bar focused yet lands on the first row that draws a bar', () => {
    const [b1] = mountBars(['e1', 'e2']);

    expect(harness.dispatchTimelineKey(harness.timeline, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b1);
  });

  it('ArrowDown skips a row that draws no bar', () => {
    const [b1, b3] = mountBars(['e1', 'e3'], ['e1', 'e2', 'e3']);
    b1!.focus();

    expect(harness.dispatchTimelineKey(b1!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(b3);
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
