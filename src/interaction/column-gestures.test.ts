import { describe, expect, it, vi } from 'vitest';
import { attachColumnGestures } from './column-gestures.js';
import type { ColumnGestureContext } from '../view/index.js';
import type { FieldKey } from '../model/index.js';

// happy-dom's pointer-capture methods are not layout-backed; stubbed the same way other DOM suites
// in this repo stub browser primitives happy-dom does not implement (view/splitter.test.ts).
function stubPointerCapture(el: HTMLElement): void {
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
}

function down(target: HTMLElement, clientX: number): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY: 0, pointerId: 1, bubbles: true }));
}
function move(pane: HTMLElement, clientX: number): void {
  pane.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY: 0, pointerId: 1, bubbles: true }));
}
function up(target: HTMLElement, clientX: number): void {
  target.dispatchEvent(new PointerEvent('pointerup', { clientX, clientY: 0, pointerId: 1, bubbles: true }));
}
function escape(container: HTMLElement): void {
  container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

interface Rect {
  left: number;
  width: number;
}

/** One header pane with N header cells, each carrying `data-field`, a `.fg-column-resizer` grip, and
 *  a `getBoundingClientRect` happy-dom never lays out for real — this suite is about the pointer
 *  sequences (D-S5-18), not real layout, the same posture `entry-gestures.test.ts`'s fake `hitTest`
 *  already takes. */
function makeHeaderPane(rects: Record<string, Rect>): {
  pane: HTMLElement;
  cell: (key: string) => HTMLElement;
} {
  const pane = document.createElement('div');
  const cells = new Map<string, HTMLElement>();
  for (const [key, rect] of Object.entries(rects)) {
    const cell = document.createElement('div');
    cell.className = 'fg-col-header';
    cell.dataset['field'] = key;
    cell.getBoundingClientRect = () => ({
      left: rect.left,
      right: rect.left + rect.width,
      width: rect.width,
      top: 0,
      bottom: 0,
      height: 0,
      x: rect.left,
      y: 0,
      toJSON: () => ({}),
    });
    const grip = document.createElement('div');
    grip.className = 'fg-column-resizer';
    cell.append(grip);
    pane.append(cell);
    cells.set(key, cell);
    stubPointerCapture(pane);
  }
  return { pane, cell: (key) => cells.get(key)! };
}

function gripOf(cell: HTMLElement): HTMLElement {
  return cell.querySelector('.fg-column-resizer')!;
}

function makeCtx(overrides: Partial<ColumnGestureContext> = {}): {
  ctx: ColumnGestureContext;
  previews: { columnKey: FieldKey; widthPx: number }[];
  commits: { columnKey: FieldKey; widthPx: number }[];
  dropPreviews: (FieldKey | null)[];
  reorders: { columnKey: FieldKey; beforeColumnKey: FieldKey | null }[];
  focused: (FieldKey | undefined)[];
} {
  const previews: { columnKey: FieldKey; widthPx: number }[] = [];
  const commits: { columnKey: FieldKey; widthPx: number }[] = [];
  const dropPreviews: (FieldKey | null)[] = [];
  const reorders: { columnKey: FieldKey; beforeColumnKey: FieldKey | null }[] = [];
  const focused: (FieldKey | undefined)[] = [];
  const ctx: ColumnGestureContext = {
    isResizable: () => true,
    isMovable: () => true,
    minColumnWidthPx: () => 40,
    previewColumnWidth: (columnKey, widthPx) => previews.push({ columnKey, widthPx }),
    commitColumnWidth: (columnKey, widthPx) => {
      commits.push({ columnKey, widthPx });
      return true;
    },
    previewColumnDrop: (beforeColumnKey) => dropPreviews.push(beforeColumnKey),
    commitColumnReorder: (columnKey, beforeColumnKey) => {
      reorders.push({ columnKey, beforeColumnKey });
      return true;
    },
    setFocusedColumn: (columnKey) => focused.push(columnKey),
    ...overrides,
  };
  return { ctx, previews, commits, dropPreviews, reorders, focused };
}

describe('attachColumnGestures — resize (S5.7, D-S5-18)', () => {
  it('a resize drag on the grip commits one width, past the drag threshold', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, previews, commits } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190); // right edge of the 90px-wide cell
    move(pane, 210); // +20px, past the 4px arm threshold
    up(gripOf(cell('cost')), 230); // +40px total

    // The preview reflects each move event's own dx from where the drag armed (+20 at clientX 210);
    // the commit reflects the final dx at pointerup (+40 at clientX 230).
    expect(previews).toEqual([{ columnKey: 'cost', widthPx: 110 }]);
    expect(commits).toEqual([{ columnKey: 'cost', widthPx: 130 }]);
  });

  it('a veto (commitColumnWidth returns false) restores the starting width', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, previews } = makeCtx({ commitColumnWidth: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    up(gripOf(cell('cost')), 230);

    // Last preview call restores the pre-drag width (90), not the vetoed 130.
    expect(previews.at(-1)).toEqual({ columnKey: 'cost', widthPx: 90 });
  });

  it('a drag below the floor clamps to minColumnWidthPx', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, commits } = makeCtx({ minColumnWidthPx: () => 40 });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 100); // -90px, past the threshold
    up(gripOf(cell('cost')), 50); // -140px total — would go negative unclamped

    expect(commits).toEqual([{ columnKey: 'cost', widthPx: 40 }]);
  });

  it('Escape cancels the drag and restores the starting width, committing nothing', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const container = document.createElement('div');
    const { ctx, previews, commits } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    escape(container);

    expect(previews.at(-1)).toEqual({ columnKey: 'cost', widthPx: 90 });
    expect(commits).toEqual([]);
  });

  it('resizable: false refuses the pointer drag — no preview, no commit', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, previews, commits } = makeCtx({ isResizable: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    up(gripOf(cell('cost')), 230);

    expect(previews).toEqual([]);
    expect(commits).toEqual([]);
  });
});

describe('attachColumnGestures — reorder (S5.7, D-S5-18)', () => {
  it('a reorder drop moves one column before the header cell its midpoint crossed', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
      start: { left: 200, width: 100 },
    });
    const { ctx, reorders, dropPreviews } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10); // grabs "name" body, not the grip
    move(pane, 220); // past the threshold, now over "start"'s left half (midpoint at 250)
    up(cell('name'), 220);

    // One preview while dragging, then a clear (null) at commit — the indicator never outlives the drop.
    expect(dropPreviews).toEqual(['start', null]);
    expect(reorders).toEqual([{ columnKey: 'name', beforeColumnKey: 'start' }]);
  });

  it('dropping past every column lands at the end (beforeColumnKey null)', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
    });
    const { ctx, reorders } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10);
    move(pane, 190);
    up(cell('name'), 190); // clientX 190 is past cost's own midpoint (150)

    expect(reorders).toEqual([{ columnKey: 'name', beforeColumnKey: null }]);
  });

  it('movable: false refuses the pointer drag — no drop preview, no commit', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
    });
    const { ctx, dropPreviews, reorders } = makeCtx({ isMovable: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10);
    move(pane, 190);
    up(cell('name'), 190);

    expect(dropPreviews).toEqual([]);
    expect(reorders).toEqual([]);
  });
});

describe('attachColumnGestures — plain click sets the focused column (D-S5-26)', () => {
  it('a click with no drag reports the clicked header cell', () => {
    const { pane, cell } = makeHeaderPane({ name: { left: 0, width: 100 } });
    const { ctx, focused } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10);
    up(cell('name'), 10); // no movement — never arms a drag

    expect(focused).toEqual(['name']);
  });

  it('a click that misses every header cell clears the focused column', () => {
    const { pane } = makeHeaderPane({ name: { left: 0, width: 100 } });
    const { ctx, focused } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(pane, 500);
    up(pane, 500);

    expect(focused).toEqual([undefined]);
  });
});
