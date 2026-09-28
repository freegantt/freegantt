import { describe, expect, it, vi } from 'vitest';
import { attachColumnGestures } from './column-gestures.js';
import type { ColumnGestureContext, ColumnReorderPreview } from '../view/index.js';
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
function moveXY(pane: HTMLElement, clientX: number, clientY: number): void {
  pane.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerId: 1, bubbles: true }));
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
 *  sequences, not real layout, the same posture `entry-gestures.test.ts`'s fake `hitTest`
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
  reorderPreviews: ColumnReorderPreview[];
  reorders: { columnKey: FieldKey; beforeColumnKey: FieldKey | null }[];
  focused: (FieldKey | undefined)[];
  cancels: number[];
  reorderCancels: number[];
} {
  const previews: { columnKey: FieldKey; widthPx: number }[] = [];
  const commits: { columnKey: FieldKey; widthPx: number }[] = [];
  const reorderPreviews: ColumnReorderPreview[] = [];
  const reorders: { columnKey: FieldKey; beforeColumnKey: FieldKey | null }[] = [];
  const focused: (FieldKey | undefined)[] = [];
  const cancels: number[] = [];
  const reorderCancels: number[] = [];
  const ctx: ColumnGestureContext = {
    isResizable: () => true,
    isMovable: () => true,
    minColumnWidthPx: () => 40,
    previewColumnWidth: (columnKey, widthPx) => previews.push({ columnKey, widthPx }),
    commitColumnWidth: (columnKey, widthPx) => {
      commits.push({ columnKey, widthPx });
      return true;
    },
    cancelColumnResize: () => {
      cancels.push(1);
    },
    previewColumnReorder: (preview) => reorderPreviews.push(preview),
    commitColumnReorder: (columnKey, beforeColumnKey) => {
      reorders.push({ columnKey, beforeColumnKey });
      return true;
    },
    cancelColumnReorder: () => {
      reorderCancels.push(1);
    },
    setFocusedColumn: (columnKey) => focused.push(columnKey),
    ...overrides,
  };
  return { ctx, previews, commits, reorderPreviews, reorders, focused, cancels, reorderCancels };
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

  it('a mostly-vertical move on the grip does not arm the resize', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, previews } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    moveXY(pane, 191, 40); // dx=1, dy=40 — well past the 4px hypot arm, under it on |dx| alone
    up(gripOf(cell('cost')), 191);

    expect(previews).toEqual([]);
  });

  it('a veto (commitColumnWidth returns false) cancels the resize preview', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, cancels } = makeCtx({ commitColumnWidth: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    up(gripOf(cell('cost')), 230);

    // A veto clears the preview entirely (`cancelColumnResize`) rather than repainting the pre-drag
    // width, so a flex column's live-paint `data-fixed` override does not linger.
    expect(cancels).toHaveLength(1);
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

  it('Escape cancels the drag, clearing the preview and committing nothing', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const container = document.createElement('div');
    const { ctx, cancels, commits } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    escape(container);

    expect(cancels).toHaveLength(1);
    expect(commits).toEqual([]);
  });

  it('Escape mid-resize swallows the key so a sibling keydown listener on the same container never sees it', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const container = document.createElement('div');
    const { ctx } = makeCtx();
    attachColumnGestures(pane, container, ctx);
    const sibling = vi.fn();
    container.addEventListener('keydown', sibling);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    escape(container);

    expect(sibling).not.toHaveBeenCalled();
  });

  it("a second pointerdown while a drag is armed does not clobber the first pointer's grabbed column", () => {
    const { pane, cell } = makeHeaderPane({
      cost: { left: 100, width: 90 },
      start: { left: 300, width: 90 },
    });
    const { ctx, commits } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190); // pointerId 1 arms on "cost"'s grip
    move(pane, 210);
    // A second finger (pointerId 2) lands on an unrelated header cell mid-drag.
    cell('start').dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 340, clientY: 0, pointerId: 2, bubbles: true }),
    );
    up(gripOf(cell('cost')), 230); // pointerId 1 releases — still the original drag

    expect(commits).toEqual([{ columnKey: 'cost', widthPx: 130 }]);
  });

  it('Escape before the drag arms clears the grab, so the next grip drags its own column', () => {
    const { pane, cell } = makeHeaderPane({
      cost: { left: 100, width: 90 },
      start: { left: 300, width: 90 },
    });
    const container = document.createElement('div');
    const { ctx, commits } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(gripOf(cell('cost')), 190); // grabs "cost"'s grip
    move(pane, 192); // +2px — below the 4px arm threshold, never arms
    escape(container); // unarmed Escape: pointer-gesture's own cancel() never runs

    down(gripOf(cell('start')), 340); // a later drag grabs "start"'s grip
    move(pane, 360); // +20px, past threshold
    up(gripOf(cell('start')), 380); // +40px total

    // Without the fix this commits against "cost" (the stale grab) using "start"'s pointer travel.
    expect(commits).toEqual([{ columnKey: 'start', widthPx: 130 }]);
  });

  it('pointercancel before the drag arms clears the grab, so the next grip drags its own column', () => {
    const { pane, cell } = makeHeaderPane({
      cost: { left: 100, width: 90 },
      start: { left: 300, width: 90 },
    });
    const { ctx, commits } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 192); // below threshold, never arms
    pane.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));

    down(gripOf(cell('start')), 340);
    move(pane, 360);
    up(gripOf(cell('start')), 380);

    expect(commits).toEqual([{ columnKey: 'start', widthPx: 130 }]);
  });

  it('pointercancel cancels an armed resize the same as Escape (B6)', () => {
    const { pane, cell } = makeHeaderPane({ cost: { left: 100, width: 90 } });
    const { ctx, cancels, commits } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(gripOf(cell('cost')), 190);
    move(pane, 210);
    pane.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));

    expect(cancels).toHaveLength(1);
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
    const { ctx, reorders, reorderPreviews } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10); // grabs "name" body, not the grip
    move(pane, 220); // past the threshold, now over "start"'s left half (midpoint at 250)
    up(cell('name'), 220);

    // One preview while dragging; the landed commit clears the indicator itself (`ColumnChrome#commit`),
    // so the gesture layer has no reason to paint a redundant "at the end" indicator on the way out.
    expect(reorderPreviews).toEqual([{ columnKey: 'name', offsetPx: 210, beforeColumnKey: 'start' }]);
    expect(reorders).toEqual([{ columnKey: 'name', beforeColumnKey: 'start' }]);
  });

  it('the grabbed header cell follows the pointer: every move reports its own px offset (#140)', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
      start: { left: 200, width: 100 },
    });
    const { ctx, reorderPreviews } = makeCtx();
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 50);
    move(pane, 120); // +70px from the grab point
    move(pane, 260); // +210px

    // `offsetPx` is the travel since the grab, not the pointer's own clientX: the cell rides that far
    // from the slot it keeps, so the drop midpoints read at arm time stay true (`computeDropTargets`).
    expect(reorderPreviews.map((preview) => preview.offsetPx)).toEqual([70, 210]);
    expect(reorderPreviews.map((preview) => preview.columnKey)).toEqual(['name', 'name']);
  });

  it('a veto (commitColumnReorder returns false) cancels the drop indicator', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
      start: { left: 200, width: 100 },
    });
    const { ctx, reorderCancels } = makeCtx({ commitColumnReorder: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10);
    move(pane, 220);
    up(cell('name'), 220);

    // A veto clears the indicator entirely (`cancelColumnReorder`) rather than leaving it painted
    // where the drop would have landed ("a refused drag must leave nothing behind").
    expect(reorderCancels).toHaveLength(1);
  });

  it('Escape cancels a reorder drag, clearing the drop indicator and committing nothing', () => {
    const { pane, cell } = makeHeaderPane({
      name: { left: 0, width: 100 },
      cost: { left: 100, width: 100 },
    });
    const container = document.createElement('div');
    const { ctx, reorderCancels, reorders } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(cell('name'), 10);
    move(pane, 190);
    escape(container);

    expect(reorderCancels).toHaveLength(1);
    expect(reorders).toEqual([]);
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
    const { ctx, reorderPreviews, reorders } = makeCtx({ isMovable: () => false });
    attachColumnGestures(pane, document.createElement('div'), ctx);

    down(cell('name'), 10);
    move(pane, 190);
    up(cell('name'), 190);

    expect(reorderPreviews).toEqual([]);
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

  it('a pointerdown outside the header pane clears the focused column (B3)', () => {
    const { pane, cell } = makeHeaderPane({ name: { left: 0, width: 100 } });
    const container = document.createElement('div');
    const { ctx, focused } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(cell('name'), 10);
    up(cell('name'), 10);
    expect(focused).toEqual(['name']);

    // A later pointerdown elsewhere in the Gantt (a bar, a body cell, empty timeline) — the header no
    // longer has the user's attention, so `Shift+Arrow` must not still resize/reorder this column.
    container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(focused).toEqual(['name', undefined]);
  });

  it('a pointerdown inside the header pane does not clear the focused column', () => {
    const { pane, cell } = makeHeaderPane({ name: { left: 0, width: 100 } });
    const container = document.createElement('div');
    container.append(pane);
    const { ctx, focused } = makeCtx();
    attachColumnGestures(pane, container, ctx);

    down(cell('name'), 10);
    up(cell('name'), 10);
    expect(focused).toEqual(['name']);
  });
});
