import { describe, expect, it } from 'vitest';
import { createDomBackend } from './index.js';
import { computeFrame, createItemProducerRegistry } from '../../layout/index.js';
import type { BarRenderer, TimeScale, ViewPreset } from '../../layout/index.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';

function entryLookup(id: string): (typeof sampleEntries)[number] | undefined {
  return sampleEntries.find((e) => e.id === id);
}

const point = (x: number, y: number) => ({ x, y });

const scale: TimeScale = {
  range: sampleEntries[0]!,
  timeZone: 'UTC',
  pxPerMs: 1,
  xForInstant: () => 0,
  instantForX: () => sampleEntries[0]!.start,
  widthForDuration: () => 100,
  ticks: () => [{ instant: sampleEntries[0]!.start, x: 0, width: 24 }],
  contentWidth: 100,
};
const preset: ViewPreset = {
  id: 'none',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: () => 'tick' }],
  preferredTickWidthPx: 24,
};
const itemProducerRegistry = createItemProducerRegistry();

/** One Entry, drawn as `count` bars — the multi-Item shape a Segmented Entry has (#185). Each
 *  Segment spans the whole Entry, so a fixed row still packs them onto one line. */
function segmentsOf(entry: (typeof sampleEntries)[number], count: number) {
  return Array.from({ length: count }, () => ({ start: entry.start, end: entry.end }));
}

function mountSurfaces(): { grid: HTMLElement; timeline: HTMLElement } {
  const grid = document.createElement('div');
  const timeline = document.createElement('div');
  document.body.append(grid, timeline);
  return { grid, timeline };
}

describe('render/dom backend', () => {
  it('finds the item under a point via event delegation, not a materialized hit index (#31)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    expect(backend.hitTest(point(5, 5))).toEqual({ kind: 'bar', itemId: frame.bars[0]!.id });
    expect(backend.hitTest(point(999, 999))).toBeNull();

    document.elementFromPoint = original;
    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('renders rows and labels bars with the entry name, not its id (#26)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [{ field: 'name', header: 'Name', align: 'start', format: (e) => e.name }],
    });
    backend.sync(frame);

    expect(grid.querySelectorAll('.fg-row')).toHaveLength(2);
    expect(grid.querySelector('.fg-row')?.textContent).toBe(sampleEntries[0]?.name);
    expect(timeline.querySelector('.fg-bar')?.textContent).toBe(sampleEntries[0]?.name);
    backend.destroy();
  });

  it('puts row labels in the grid surface and ticks/bars/the sizer in the timeline surface, with no gutter offset (S1.8, D-S1.8-2)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
      }),
    );

    expect(grid.querySelector('.fg-row')).not.toBeNull();
    expect(grid.querySelector('.fg-bar')).toBeNull();
    expect(timeline.querySelector('.fg-bar')).not.toBeNull();
    expect(timeline.querySelector('.fg-header')).not.toBeNull();
    // No margin-left gutter anywhere — the gutter is the grid pane's own width now, not a backend offset.
    const barLayer = timeline.querySelector<HTMLElement>('.fg-bars')!;
    expect(barLayer.style.marginLeft).toBe('');

    backend.destroy();
  });

  it("writes the grid row layer's own translateY(-visible.y) each frame (D-S1.8-1)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 40, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
      }),
    );

    expect(grid.style.transform).toBe('translateY(-40px)');
    backend.destroy();
  });

  it('reconciles header ticks through the same keyed pattern as bars (#19)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: [],
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
      }),
    );

    const ticks = timeline.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.textContent).toBe('tick');
    backend.destroy();
  });

  it("renders data-flag from a bar's BarFlags keys, generated not hand-mapped (S1.10, D-S1.10-2, U7)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    // computeFrame never sets a flag true today (no scheduling plugin wired yet) — mutate the frame's
    // own bar object, same shape a future scheduling plugin would produce, to prove the generator path.
    (frame.bars[0]!.flags as Record<string, boolean>)['conflict'] = true;
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['flag']).toBe('conflict');
    backend.destroy();
  });

  it('renders a third, hypothetical BarFlags key with no render/dom change (drives the generated path, U7)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    (frame.bars[0]!.flags as Record<string, boolean>)['late'] = true;
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['flag']).toBe('late');
    backend.destroy();
  });

  it('gives .fg-row one .fg-row-label child carrying the row label text (D-S1.10-7)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
        columns: [{ field: 'name', header: 'Name', align: 'start', format: (e) => e.name }],
      }),
    );

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    const labels = row.querySelectorAll('.fg-row-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe(sampleEntries[0]?.name);
    backend.destroy();
  });

  it('renders one .fg-row-cell per configured column, in column order, on top of the .fg-row-label first cell (#81)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync({ ...base, rows: base.rows.map((row) => ({ ...row, cells: ['Discovery', '5 d'] })) });

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.querySelectorAll('.fg-row-label')).toHaveLength(1);
    const otherCells = row.querySelectorAll('.fg-row-cell');
    expect(otherCells).toHaveLength(1);
    expect(row.children[0]?.textContent).toBe('Discovery');
    expect(row.children[1]?.textContent).toBe('5 d');
    backend.destroy();
  });

  it('four columns paint four cells; widths and alignment apply; a removed column prunes its node', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    const gridHeader = document.createElement('div');
    document.body.append(gridHeader);
    backend.mount({ grid, timeline, gridHeader });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (e) => e.name },
        { field: 'start', header: 'Start', align: 'start', width: 80, format: () => 'Sep 1' },
        { field: 'duration', header: 'Duration', align: 'end', flex: 2, format: () => '2 d' },
        { field: 'cost', header: 'Budget', align: 'end', width: 90, format: () => '$500' },
      ],
    });
    backend.sync(base);

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(4);
    expect(gridHeader.querySelectorAll('.fg-col-header')).toHaveLength(4);
    expect(gridHeader.querySelector('[data-field="cost"]')?.textContent).toBe('Budget');
    const costCell = row.querySelector<HTMLElement>('[data-field="cost"]')!;
    expect(costCell.style.width).toBe('90px');
    expect(costCell.dataset['align']).toBe('end');
    const durationCell = row.querySelector<HTMLElement>('[data-field="duration"]')!;
    expect(durationCell.style.getPropertyValue('--fg-col-flex')).toBe('2');
    const durationHeader = gridHeader.querySelector<HTMLElement>('[data-field="duration"]')!;
    expect(durationHeader.style.getPropertyValue('--fg-col-flex')).toBe('2');
    const costNode = costCell;

    backend.sync({
      ...base,
      columns: base.columns.filter((c) => c.field !== 'cost'),
      rows: base.rows.map((r) => ({ ...r, cells: r.cells.slice(0, 3) })),
    });
    expect(row.querySelector('[data-field="cost"]')).toBeNull();
    expect(costNode.isConnected).toBe(false);
    expect(row.querySelectorAll('.fg-row-label, .fg-row-cell')).toHaveLength(3);
    backend.destroy();
  });

  it('clearing a column-resize preview restores the header cell and every body cell to their committed geometry, not left mid-drag (D-S5-18)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    const gridHeader = document.createElement('div');
    document.body.append(gridHeader);
    backend.mount({ grid, timeline, gridHeader });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (e) => e.name },
        { field: 'duration', header: 'Duration', align: 'end', flex: 2, format: () => '2 d' },
      ],
    });
    backend.sync(base);

    const headerCell = gridHeader.querySelector<HTMLElement>('[data-field="duration"]')!;
    const bodyCell = grid.querySelector<HTMLElement>('[data-field="duration"]')!;
    // Before the drag: a flex column, no inline width, no `data-fixed`.
    expect(headerCell.style.width).toBe('');
    expect(headerCell.hasAttribute('data-fixed')).toBe(false);

    backend.applyState({ columnResizePreview: { columnKey: 'duration', widthPx: 300 } });
    expect(headerCell.style.width).toBe('300px');
    expect(headerCell.hasAttribute('data-fixed')).toBe(true);
    expect(bodyCell.style.width).toBe('300px');
    expect(bodyCell.hasAttribute('data-fixed')).toBe(true);

    // A veto/Escape: the preview clears (`columnResizePreview: undefined`) but the underlying frame —
    // the column's real, committed geometry — never changed. Without a restore, the keyed reconciler's
    // own diff (`sync-keyed.ts`) sees no geometry change and skips patching, leaving the preview's
    // inline style/attribute stuck even after a queued frame re-syncs the identical frame.
    backend.applyState({});
    backend.sync(base);

    expect(headerCell.style.width).toBe('');
    expect(headerCell.hasAttribute('data-fixed')).toBe(false);
    expect(bodyCell.style.width).toBe('');
    expect(bodyCell.hasAttribute('data-fixed')).toBe(false);
    backend.destroy();
  });

  it('a reorder preview moves the grabbed header cell and paints the drop edge; clearing parks both (D-S5-18, #140)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    const gridHeader = document.createElement('div');
    document.body.append(gridHeader);
    backend.mount({ grid, timeline, gridHeader });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (e) => e.name },
        { field: 'duration', header: 'Duration', align: 'end', format: () => '2 d' },
      ],
    });
    backend.sync(base);

    // `null` means "at the end": paints `data-drop="after"` on the last header cell, and the grabbed
    // cell rides its own translateX (#140).
    const grabbed = gridHeader.querySelector<HTMLElement>('[data-field="name"]')!;
    backend.applyState({
      columnReorderPreview: { columnKey: 'name', offsetPx: 42, beforeColumnKey: null },
    });
    const lastHeader = gridHeader.querySelector<HTMLElement>('[data-field="duration"]')!;
    expect(lastHeader.getAttribute('data-drop')).toBe('after');
    expect(grabbed.style.transform).toBe('translateX(42px)');
    expect(grabbed.hasAttribute('data-dragging')).toBe(true);

    // The indicator moves off the old cell when the drop target changes — one cell wears it at a time.
    backend.applyState({
      columnReorderPreview: { columnKey: 'name', offsetPx: 10, beforeColumnKey: 'duration' },
    });
    expect(lastHeader.getAttribute('data-drop')).toBe('before');
    expect(grabbed.style.transform).toBe('translateX(10px)');

    // `undefined` (a veto or Escape) must clear both — not repaint "after" again, and not leave the
    // grabbed cell stuck off its slot (`ColumnGestureContext.cancelColumnReorder`, which is distinct
    // from a preview whose `beforeColumnKey` is `null`).
    backend.applyState({});
    expect(lastHeader.hasAttribute('data-drop')).toBe(false);
    expect(grabbed.style.transform).toBe('');
    expect(grabbed.hasAttribute('data-dragging')).toBe(false);
    backend.destroy();
  });

  it("stamps .fg-row's aria-posinset/aria-setsize from the frame's absolute row index and total row count, not the windowed count (D-S1.10-5)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    // A dataset larger than the window: rowHeight * entries.length exceeds the visible slice, so
    // rows[].index runs ahead of the windowed row count while frame.rowCount stays the full total.
    backend.sync(
      computeFrame({
        entries: sampleEntries,
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 32 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
      }),
    );

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.getAttribute('aria-posinset')).toBe('1');
    expect(row.getAttribute('aria-setsize')).toBe(String(sampleEntries.length));
    backend.destroy();
  });

  it('stripes both panes from the absolute row index, so a scrolled window keeps the same rows odd', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    // A window that starts one row down: the first row in the DOM is row index 1, so :nth-child
    // striping would paint it 'odd' while the grid pane's unscrolled paint calls it 'even'.
    const scrolled = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 64, width: 100, height: 32 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(scrolled);

    const rows = Array.from(grid.querySelectorAll<HTMLElement>('.fg-row'));
    const bands = Array.from(timeline.querySelectorAll<HTMLElement>('.fg-row-band'));
    expect(rows.length).toBeGreaterThan(0);
    expect(bands).toHaveLength(rows.length);
    expect(rows.map((row) => row.dataset['parity'])).toEqual(
      scrolled.rows.map((row) => (row.index % 2 === 0 ? 'odd' : 'even')),
    );
    expect(bands.map((band) => band.dataset['parity'])).toEqual(rows.map((row) => row.dataset['parity']));
    expect(bands.map((band) => band.dataset['rowId'])).toEqual(rows.map((row) => row.dataset['rowId']));

    backend.destroy();
  });

  it("gives each timeline row band its row's own top and height (I9: both panes, one geometry)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 100, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const bands = Array.from(timeline.querySelectorAll<HTMLElement>('.fg-row-band'));
    expect(bands.map((band) => band.style.transform)).toEqual(
      frame.rows.map((row) => `translateY(${row.top}px)`),
    );
    expect(bands.map((band) => band.style.height)).toEqual(frame.rows.map((row) => `${row.height}px`));

    backend.destroy();
  });

  it('gives .fg-bar role="img" and its a11yLabel, not role="gridcell" (D-S1.10-5, revised)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toBe(frame.bars[0]!.a11yLabel);
    backend.destroy();
  });

  it('gives .fg-row role="listitem" and data-testid/data-row-id, .fg-bar data-testid alongside data-item-id (U6)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.getAttribute('role')).toBe('listitem');
    expect(row.dataset['testid']).toBe('fg-row');
    expect(row.dataset['rowId']).toBe(frame.rows[0]!.id);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['testid']).toBe('fg-bar');
    expect(bar.dataset['itemId']).toBe(frame.bars[0]!.id);
    backend.destroy();
  });

  it('spans the today line the full row content height, not just the visible pane (header readability follow-up)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    // A dataset far taller than the pane's own visible window: `.fg-timeline-pane` is both the
    // today line's positioned ancestor and its own `overflow: auto` scroll container, so a naive
    // `bottom: 0` would size the line to the pane's clientHeight (200) and cut it off long before
    // `contentHeight` (5000) — the regression this guards.
    backend.sync({ ...base, contentHeight: 5000, decorations: [{ kind: 'dateLine', x: 10 }] });

    const line = timeline.querySelector<HTMLElement>('.fg-date-line')!;
    expect(line.hidden).toBe(false);
    expect(line.style.height).toBe('5000px');

    // A dataset shorter than the pane must still fill the visible pane down to its own bottom,
    // not just its own (shorter) content height.
    backend.sync({ ...base, contentHeight: 50, decorations: [{ kind: 'dateLine', x: 10 }] });
    expect(line.style.height).toBe('200px');

    backend.sync({ ...base, decorations: [] });
    expect(timeline.querySelector('.fg-date-line')).toBeNull();

    backend.destroy();
  });

  it('paints each Date line as a keyed node and drops nodes that leave the frame', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    backend.sync({
      ...base,
      decorations: [
        { kind: 'dateLine', x: 10 },
        { kind: 'dateLine', x: 40, label: 'Ship' },
      ],
    });
    const nodes = timeline.querySelectorAll<HTMLElement>('.fg-date-line');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.style.transform).toBe('translateX(10px)');
    expect(nodes[1]!.style.transform).toBe('translateX(40px)');

    const labels = timeline.querySelectorAll<HTMLElement>('.fg-date-line-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]!.textContent).toBe('Ship');
    expect(labels[0]!.style.transform).toBe('translateX(40px)');

    backend.sync({ ...base, decorations: [{ kind: 'dateLine', x: 40, label: 'Ship' }] });
    expect(timeline.querySelectorAll('.fg-date-line')).toHaveLength(1);
    expect(timeline.querySelector('.fg-date-line-label')?.textContent).toBe('Ship');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('composes a Date line className onto the base class, on both the stroke and the Date line label', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    backend.sync({
      ...base,
      decorations: [{ kind: 'dateLine', x: 10, label: 'Ship', className: 'fg-deadline-line' }],
    });

    const line = timeline.querySelector<HTMLElement>('.fg-date-line')!;
    expect(line.classList.contains('fg-deadline-line')).toBe(true);
    expect(line.dataset['flag']).toBeUndefined();
    const dateLineLabel = timeline.querySelector<HTMLElement>('.fg-date-line-label')!;
    expect(dateLineLabel.classList.contains('fg-deadline-line')).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('marks the Today line wrapper with data-flag=today and leaves authored Date lines unmarked (U5)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    backend.sync({
      ...base,
      decorations: [
        { kind: 'dateLine', x: 10, today: true },
        { kind: 'dateLine', x: 40, label: 'Ship' },
      ],
    });

    const nodes = timeline.querySelectorAll<HTMLElement>('.fg-date-line');
    expect(nodes[0]!.dataset['flag']).toBe('today');
    expect(nodes[1]!.dataset['flag']).toBeUndefined();

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // D-S3-6/D-S3-7, [S3-A3]: applyState paints the fixed data-state projection, touching only the
  // bars whose token set actually changed.
  it('applyState paints hovered/selected data-state tokens and clears them on the next call', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [a, b] = frame.bars;
    const nodeA = timeline.querySelector<HTMLElement>(`[data-item-id="${a!.id}"]`)!;
    const nodeB = timeline.querySelector<HTMLElement>(`[data-item-id="${b!.id}"]`)!;

    backend.applyState({ hoveredItemId: a!.id, selectedEntryIds: [a!.entryId, b!.entryId] });
    expect(nodeA.dataset['state']).toBe('hovered selected');
    expect(nodeB.dataset['state']).toBe('selected');

    backend.applyState({ selectedEntryIds: [b!.entryId] });
    expect(nodeA.dataset['state']).toBe('');
    expect(nodeB.dataset['state']).toBe('selected');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // Bug hunt (S5 fixes, "grid row highlight and row click"): applyState paints .fg-row the same way
  // it paints .fg-bar — one Entry-keyed Selection, read against the Entries each row owns (#185).
  it('applyState paints data-state~="selected" on the row matching a selected bar, and clears it', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [a, b] = frame.bars;
    const rowA = grid.querySelector<HTMLElement>(`[data-row-id="${a!.rowId}"]`)!;
    const rowB = grid.querySelector<HTMLElement>(`[data-row-id="${b!.rowId}"]`)!;

    backend.applyState({ selectedEntryIds: [a!.entryId] });
    expect(rowA.dataset['state']).toBe('selected');
    expect(rowB.dataset['state']).toBeUndefined();

    backend.applyState({ selectedEntryIds: [b!.entryId] });
    expect(rowA.dataset['state']).toBe('');
    expect(rowB.dataset['state']).toBe('selected');

    backend.applyState({ selectedEntryIds: [] });
    expect(rowB.dataset['state']).toBe('');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('paints every mounted bar of a selected entry, not only its first (#185)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const segmented = { ...sampleEntries[0]!, segments: segmentsOf(sampleEntries[0]!, 3) };
    const frame = computeFrame({
      entries: [segmented],
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    expect(frame.bars).toHaveLength(3);

    backend.applyState({ selectedEntryIds: [segmented.id] });
    for (const bar of frame.bars) {
      const node = timeline.querySelector<HTMLElement>(`[data-item-id="${bar.id}"]`)!;
      expect(node.dataset['state']).toBe('selected');
    }

    backend.applyState({ selectedEntryIds: [] });
    for (const bar of frame.bars) {
      const node = timeline.querySelector<HTMLElement>(`[data-item-id="${bar.id}"]`)!;
      expect(node.dataset['state']).toBe('');
    }

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a bar that mounts into a live selection is stamped at create time (#185)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    backend.applyState({ selectedEntryIds: [frame.bars[0]!.entryId] });
    backend.sync({ ...frame, bars: [] }); // the horizontal cull drops the bar

    backend.sync(frame); // and a scroll back mounts it again
    const bar = timeline.querySelector<HTMLElement>(`[data-item-id="${frame.bars[0]!.id}"]`)!;
    expect(bar.dataset['state']).toBe('selected');

    // The restamp also joined the painted set, so the next call sees no diff and rewrites nothing.
    const before = bar.dataset['state'];
    backend.applyState({ selectedEntryIds: [frame.bars[0]!.entryId] });
    expect(bar.dataset['state']).toBe(before);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a hover repaint touches only the bars whose token set changed (I5, #185)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const segmented = { ...sampleEntries[0]!, segments: segmentsOf(sampleEntries[0]!, 3) };
    const frame = computeFrame({
      entries: [segmented],
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    backend.applyState({ selectedEntryIds: [segmented.id] });

    // Counting attribute writes is the only observation of "touched" — the tokens themselves say
    // nothing about how many nodes the diff wrote.
    const observer = new MutationObserver(() => {});
    observer.observe(timeline, { subtree: true, attributes: true, attributeFilter: ['data-state'] });

    const hovered = frame.bars[1]!.id;
    backend.applyState({ selectedEntryIds: [segmented.id], hoveredItemId: hovered });
    const touched = observer.takeRecords().map((record) => (record.target as HTMLElement).dataset['itemId']);
    observer.disconnect();

    expect(touched).toEqual([hovered]);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a freshly-mounted row is stamped from the current selection at create time, not the next applyState', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    backend.applyState({ selectedEntryIds: [frame.bars[0]!.entryId] });
    backend.sync({ ...frame, rows: [], rowCount: 0 }); // simulate virtualization dropping the row

    backend.sync(frame); // and remounting it later
    const row = grid.querySelector<HTMLElement>(`[data-row-id="${frame.bars[0]!.rowId}"]`)!;
    expect(row.dataset['state']).toBe('selected');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // Bug hunt (S5 fixes): hitTest's grid-row fallback — a click that misses the bar layer resolves
  // against the grid pane's own .fg-row. It names the row (#185), never an Item id of its own.
  it('hitTest resolves a grid-row miss on the bar layer to that row (#185)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? row : original(x, y));

    expect(backend.hitTest(point(5, 5))).toEqual({ kind: 'row', rowId: frame.rows[0]!.id });

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('hitTest reports no hit for a twisty click — collapse stays on the twisty, never selection', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const twisty = grid.querySelector<HTMLElement>('.fg-row-twisty')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? twisty : original(x, y));

    expect(backend.hitTest(point(5, 5))).toBeNull();

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // S3.6, D-S3-18, U7: ItemPreview.extra distinguishes the caller's own gesture ('dragging') from an
  // installed extension hook's cascade ('ghost') — two entries offset in the same preview frame.
  it('applyState paints dragging/ghost data-state tokens off ItemPreview.extra and clears them once the preview drops', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [a, b] = frame.bars;
    const nodeA = timeline.querySelector<HTMLElement>(`[data-item-id="${a!.id}"]`)!;
    const nodeB = timeline.querySelector<HTMLElement>(`[data-item-id="${b!.id}"]`)!;

    backend.applyState({
      preview: [
        { itemId: a!.id, dx: 10, dWidth: 0, extra: false },
        { itemId: b!.id, dx: 5, dWidth: 0, extra: true },
      ],
    });
    expect(nodeA.dataset['state']).toBe('dragging');
    expect(nodeB.dataset['state']).toBe('ghost');

    backend.applyState({});
    expect(nodeA.dataset['state']).toBe('');
    expect(nodeB.dataset['state']).toBe('');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('parks the shared handle pair when resizableEntryId is undefined and moves them onto the committed bar when it is set (D-S3-8)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [a] = frame.bars;
    const start = timeline.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    const end = timeline.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    expect(start.hidden).toBe(true);
    expect(end.hidden).toBe(true);

    backend.applyState({ resizableEntryId: a!.entryId });
    expect(start.hidden).toBe(false);
    expect(end.hidden).toBe(false);
    expect(start.style.transform).toBe(`translate(${a!.x}px, ${a!.y}px)`);
    expect(end.style.transform).toBe(`translate(${a!.x + a!.width}px, ${a!.y}px)`);
    expect(start.style.height).toBe(`${a!.height}px`);

    backend.applyState({});
    expect(start.hidden).toBe(true);
    expect(end.hidden).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('hitTest reports the edge of a resize handle, resolved against resizableEntryId (S3.4, D-S3-4)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    backend.applyState({ resizableEntryId: frame.bars[0]!.entryId });

    const end = timeline.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? end : original(x, y));

    expect(backend.hitTest(point(5, 5))).toEqual({
      kind: 'bar',
      itemId: frame.bars[0]!.id,
      edge: 'end',
    });

    document.elementFromPoint = original;
    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('brackets a segmented entry: one handle per envelope bar, and hitTest names that bar (#200)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    // The fake scale above parks every instant at x = 0, so this one spreads the two Segments out —
    // the handle pair has to tell the leftmost bar from the rightmost one. One px per ms keeps the
    // arithmetic out of the test (I10): the scale reports a difference, it never builds a duration.
    const base = sampleEntries[0]!;
    const later = sampleEntries[4]!;
    const spreadScale: TimeScale = {
      ...scale,
      xForInstant: (at) => Number(at) - Number(base.start),
    };
    const segmented = {
      ...base,
      end: later.end,
      segments: [
        { start: base.start, end: base.end },
        { start: later.start, end: later.end },
      ],
    };
    const frame = computeFrame({
      entries: [segmented],
      scale: spreadScale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [first, last] = frame.bars;
    expect(frame.bars).toHaveLength(2);

    backend.applyState({ resizableEntryId: segmented.id });
    const start = timeline.querySelector<HTMLElement>('.fg-bar-handle[data-edge="start"]')!;
    const end = timeline.querySelector<HTMLElement>('.fg-bar-handle[data-edge="end"]')!;
    expect(start.style.transform).toBe(`translate(${first!.x}px, ${first!.y}px)`);
    expect(end.style.transform).toBe(`translate(${last!.x + last!.width}px, ${last!.y}px)`);

    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) =>
      x === 5 && y === 5 ? start : x === 6 && y === 6 ? end : original(x, y);

    // Each handle grabs the bar it sits on, so a resize arms the Entry through a real Item id.
    expect(backend.hitTest(point(5, 5))).toEqual({ kind: 'bar', itemId: first!.id, edge: 'start' });
    expect(backend.hitTest(point(6, 6))).toEqual({ kind: 'bar', itemId: last!.id, edge: 'end' });

    document.elementFromPoint = original;
    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('hitTest never reports an edge for a parked (hidden) handle pair', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    // resizableEntryId never set — handles stay hidden.

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    expect(backend.hitTest(point(5, 5))).toEqual({ kind: 'bar', itemId: frame.bars[0]!.id });

    document.elementFromPoint = original;
    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it("sets data-movable on movableItemId's bar and clears it when the id moves elsewhere (D-S3-6)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);
    const [a, b] = frame.bars;
    const nodeA = timeline.querySelector<HTMLElement>(`[data-item-id="${a!.id}"]`)!;
    const nodeB = timeline.querySelector<HTMLElement>(`[data-item-id="${b!.id}"]`)!;

    backend.applyState({ movableItemId: a!.id });
    expect(nodeA.hasAttribute('data-movable')).toBe(true);
    expect(nodeB.hasAttribute('data-movable')).toBe(false);

    backend.applyState({ movableItemId: b!.id });
    expect(nodeA.hasAttribute('data-movable')).toBe(false);
    expect(nodeB.hasAttribute('data-movable')).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('applyState paints the Cursor line singleton at cursorX and parks it when cursorX drops (D-S3-15)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const line = timeline.querySelector<HTMLElement>('.fg-cursor-line')!;
    const label = timeline.querySelector<HTMLElement>('.fg-cursor-line-label')!;
    expect(line.hidden).toBe(true);
    expect(label.hidden).toBe(true);

    backend.applyState({ cursorX: 40, cursorLabel: 'Jun 15, 2026' });
    expect(line.hidden).toBe(false);
    expect(line.style.transform).toBe('translateX(40px)');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('Jun 15, 2026');

    backend.applyState({});
    expect(line.hidden).toBe(true);
    expect(label.hidden).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('indents from depth, puts aria-expanded on the twisty, and omits a twisty on a leaf (S4.6)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const parent = sampleEntries[0]!;
    const child = { ...sampleEntries[1]!, parentId: parent.id };
    const frame = computeFrame({
      entries: [parent, child],
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      rows: { source: 'entries', tree: true },
      columns: [{ field: 'name', header: 'Name', align: 'start', format: (e) => e.name }],
    });
    backend.sync(frame);

    const parentRow = grid.querySelector<HTMLElement>(`[data-row-id="${parent.id}"]`)!;
    const childRow = grid.querySelector<HTMLElement>(`[data-row-id="${child.id}"]`)!;
    expect(parentRow.style.getPropertyValue('--fg-row-depth')).toBe('0');
    expect(childRow.style.getPropertyValue('--fg-row-depth')).toBe('1');
    expect(parentRow.getAttribute('aria-level')).toBe('1');
    expect(childRow.getAttribute('aria-level')).toBe('2');
    const twisty = parentRow.querySelector<HTMLElement>('.fg-row-twisty');
    expect(twisty).not.toBeNull();
    expect(twisty?.hidden).toBe(false);
    expect(twisty?.getAttribute('aria-expanded')).toBe('true');
    const childTwisty = childRow.querySelector<HTMLButtonElement>('.fg-row-twisty');
    expect(childTwisty).not.toBeNull();
    expect(childTwisty?.hidden).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('[S4-A4] paints N bars on one row for N segments', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const entry = sampleEntries[0]!;
    const frame = computeFrame({
      entries: [
        {
          ...entry,
          segments: [
            { start: entry.start, end: entry.end },
            { start: entry.start, end: entry.end },
            { start: entry.start, end: entry.end },
          ],
        },
      ],
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    expect(grid.querySelectorAll('.fg-row')).toHaveLength(1);
    expect(timeline.querySelectorAll('.fg-bar')).toHaveLength(3);
    expect(frame.bars.every((bar) => String(bar.rowId) === String(frame.rows[0]?.id))).toBe(true);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('applies bracket and diamond classes off data-kind', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const [span, groupSeed, mileSeed] = sampleEntries;
    backend.sync(
      computeFrame({
        entries: [span!, { ...groupSeed!, kind: 'group' }, { ...mileSeed!, kind: 'milestone' }],
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
        itemProducerRegistry,
      }),
    );

    const groupBar = timeline.querySelector<HTMLElement>('[data-kind="group"]')!;
    const mileBar = timeline.querySelector<HTMLElement>('[data-kind="milestone"]')!;
    const spanBar = timeline.querySelector<HTMLElement>('[data-kind="span"]')!;
    expect(groupBar.className.split(' ')).toContain('fg-bar-bracket');
    expect(mileBar.className.split(' ')).toContain('fg-bar-diamond');
    expect(spanBar.className.split(' ')).not.toContain('fg-bar-bracket');
    expect(spanBar.className.split(' ')).not.toContain('fg-bar-diamond');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a resolved barRenderer paints inside .fg-bar, and reassigning it repaints the same node with no remount (S5.4, I8)', () => {
    let currentRenderer: BarRenderer = () => ({ text: 'first' });
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => ({ renderer: currentRenderer }),
      resolveCellRenderer: () => undefined,
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe('first');

    currentRenderer = () => ({ class: { 'my-bar': true }, text: 'second' });
    backend.sync(frame);

    expect(timeline.querySelector('.fg-bar')).toBe(bar);
    expect(bar.textContent).toBe('second');
    expect(bar.classList.contains('my-bar')).toBe(true);
    // The library's own base attrs still apply underneath the renderer's own content.
    expect(bar.dataset['itemId']).toBe(frame.bars[0]!.id);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a barRenderer that throws falls back to the default label for that bar only, and does not break the rest of the frame (issue #137 F14)', () => {
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => ({
        renderer: () => {
          throw new Error('boom');
        },
      }),
      resolveCellRenderer: () => undefined,
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    expect(() => backend.sync(frame)).not.toThrow();
    const bars = timeline.querySelectorAll<HTMLElement>('.fg-bar');
    expect(bars).toHaveLength(2);
    expect(bars[0]?.textContent).toBe(frame.bars[0]!.label);
    expect(bars[1]?.textContent).toBe(frame.bars[1]!.label);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a barRenderer returning undefined keeps the default label for that bar (D-S5-10)', () => {
    const renderer: BarRenderer = () => undefined;
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => ({ renderer }),
      resolveCellRenderer: () => undefined,
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.textContent).toBe(frame.bars[0]!.label);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('a cellRenderer returning undefined keeps the default cell text (D-S5-10)', () => {
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => undefined,
      resolveCellRenderer: () => ({ renderer: () => undefined }),
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [{ field: 'name', header: 'Name', align: 'start', format: (e) => e.name }],
    });
    backend.sync(frame);

    const cell = grid.querySelector<HTMLElement>('.fg-row-label')!;
    expect(cell.textContent).toBe(sampleEntries[0]!.name);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // #175: `plans/01` §8 — the hot path allocates nothing, and frames fire on scroll. Which renderer
  // paints a cell depends on the column alone, so asking once per painted cell was O(rows ×
  // columns) resolutions per frame. Each answer is a fresh object holding a fresh closure.
  it('resolves a cell renderer once per column per frame, whatever the row count', () => {
    const columnKeysAsked: string[] = [];
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => undefined,
      resolveCellRenderer: (columnKey) => {
        columnKeysAsked.push(columnKey);
        return undefined;
      },
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 1000, height: 1000 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (e) => e.name },
        { field: 'start', header: 'Start', align: 'start', format: (e) => String(e.start) },
      ],
    });
    backend.sync(frame);

    expect(frame.rows.length).toBeGreaterThan(1);
    expect(columnKeysAsked).toEqual(['name', 'start']);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it("a resolved cellRenderer paints inside the cell, receiving the row's entry, row and formatted value", () => {
    const seen: { entry?: { id: string }; value: string }[] = [];
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => undefined,
      resolveCellRenderer: () => ({
        renderer: (ctx) => {
          seen.push({ ...(ctx.entry ? { entry: { id: ctx.entry.id } } : {}), value: ctx.value });
          return { text: `[${ctx.value}]` };
        },
      }),
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [{ field: 'name', header: 'Name', align: 'start', format: (e) => e.name }],
    });
    backend.sync(frame);

    const cell = grid.querySelector<HTMLElement>('.fg-row-label')!;
    expect(cell.textContent).toBe(`[${sampleEntries[0]!.name}]`);
    expect(seen).toEqual([{ entry: { id: sampleEntries[0]!.id }, value: sampleEntries[0]!.name }]);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  // S5.6, D-S5-15: an underBars decoration paints below the bar layer, an overBars one above it —
  // DOM order alone gives the stacking, so this asserts document position, not a z-index.
  it('paints an underBars decoration below the bar layer and an overBars one above it', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const base = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });

    backend.sync({
      ...base,
      underBars: [{ kind: 'rangeBand', x: 10, width: 20 }],
      overBars: [{ kind: 'rangeBand', x: 30, width: 20, class: 'flag' }],
    });

    const bars = timeline.querySelector('.fg-bars')!;
    const under = timeline.querySelector<HTMLElement>('.fg-range-band:not(.flag)')!;
    const over = timeline.querySelector<HTMLElement>('.fg-range-band.flag')!;
    expect(under).not.toBeNull();
    expect(over).not.toBeNull();
    expect(under.style.transform).toBe('translateX(10px)');
    expect(under.style.width).toBe('20px');
    expect(over.style.transform).toBe('translateX(30px)');
    expect(over.classList.contains('fg-range-band')).toBe(true);

    // DOCUMENT_POSITION_PRECEDING (2): the under-decoration's own layer comes before .fg-bars.
    expect(under.compareDocumentPosition(bars) & Node.DOCUMENT_POSITION_PRECEDING).toBe(0);
    expect(bars.compareDocumentPosition(under) & Node.DOCUMENT_POSITION_PRECEDING).toBeGreaterThan(0);
    // DOCUMENT_POSITION_FOLLOWING (4): the over-decoration's own layer comes after .fg-bars.
    expect(bars.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);

    backend.sync({ ...base, underBars: [], overBars: [] });
    expect(timeline.querySelector('.fg-range-band')).toBeNull();

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it("resolves a rowStripe against the row it paints, at that row's top/height", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 200 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
    });
    const row = frame.rows[0]!;

    backend.sync({ ...frame, underBars: [{ kind: 'rowStripe', rowId: row.id }], overBars: [] });

    const stripe = timeline.querySelector<HTMLElement>('.fg-row-stripe')!;
    expect(stripe.style.transform).toBe(`translateY(${row.top}px)`);
    expect(stripe.style.height).toBe(`${row.height}px`);

    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it("a per-column cellRenderer's own resolved output beats the Gantt-wide one for that column only (S5.7, D-S5-17)", () => {
    // GanttShell's own `resolveCellRenderer` binding (view/gantt-shell.ts) is what actually decides
    // "per-column wins over Gantt-wide" — this stands in for that resolution the way every other test
    // in this file already fakes `resolveCellRenderer` rather than constructing a real GanttShell.
    // What this backend must prove instead: the resolution is per-column-key, not per-frame — one
    // column paints its own renderer's output while a sibling column keeps the library default.
    const backend = createDomBackend({
      entryById: entryLookup,
      resolveBarRenderer: () => undefined,
      resolveCellRenderer: (columnKey) =>
        columnKey === 'cost' ? { renderer: (ctx) => ({ text: `per-column:${ctx.value}` }) } : undefined,
      resolveHeaderRenderer: () => undefined,
    });
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      itemProducerRegistry,
      columns: [
        { field: 'name', header: 'Name', align: 'start', format: (e) => e.name },
        { field: 'cost', header: 'Cost', align: 'end', format: () => '500' },
      ],
    });
    backend.sync(frame);

    const nameCell = grid.querySelector<HTMLElement>('[data-field="name"]')!;
    const costCell = grid.querySelector<HTMLElement>('[data-field="cost"]')!;
    expect(nameCell.textContent).toBe(sampleEntries[0]!.name);
    expect(costCell.textContent).toBe('per-column:500');

    backend.destroy();
    grid.remove();
    timeline.remove();
  });
});
