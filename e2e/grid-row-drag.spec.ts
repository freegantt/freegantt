import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  gotoGeneric,
  countChangesFromHere,
  type RowInfo,
  rowPlan,
  currentParentId,
  firstChildRow,
  dragPointerTo,
  hasDirectLeafChild,
  lockEntryAt,
  visibleRowEntryIds,
  holdAtBottomEdgeUntilRowsSettle,
  parentRowScrolledIntoView,
  rowsViewportBox,
} from './row-drag-support.js';

// A drag on a grid row reorders or re-parents its Entry (#602) — the same one switch (`reorder`),
// the same resolver, and the same Insertion line as a vertical bar drag (#425, `row-drag.spec.ts`).
// This file drives the pointer from `.fg-grid-pane .fg-row` instead of a bar; the fixture-reading
// helpers come from `row-drag-support.ts`, so a fixture edit does not break either file.

function gridRow(page: Page, rowId: string): Locator {
  return page.locator(`#gantt .fg-grid-pane .fg-row[data-row-id="${rowId}"]`);
}

interface GridGrabPoint {
  readonly row: RowInfo;
  readonly grabX: number;
  readonly grabY: number;
}

/** The first candidate row whose own grid box the pointer can actually reach: inside the clipped
 *  viewport, not scrolled out of view. Grabs 20px in from the row's own right edge — clear of a
 *  parent row's twisty, which sits near the left, indented by depth. */
async function firstVisibleGridRow(
  page: Page,
  candidates: readonly RowInfo[],
  viewport: { y: number; height: number },
): Promise<GridGrabPoint> {
  for (const row of candidates) {
    const box = await gridRow(page, row.rowId).boundingBox();
    if (!box) continue;
    if (box.y < viewport.y || box.y + box.height > viewport.y + viewport.height) continue;
    // The Start cell: the padlock toggle column sits last, and a click on it would switch the lock.
    const cell = await gridRow(page, row.rowId).locator('[data-field="start"]').boundingBox();
    if (!cell) continue;
    return { row, grabX: cell.x + cell.width / 2, grabY: box.y + box.height / 2 };
  }
  throw new Error('no candidate row is visible in the grid pane at the current scroll position');
}

test("dragging a leaf grid row into another parent's row middle reparents it, in one transaction, with no date write, undoably", async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount === 0 && row.hasOwnBar),
    viewport,
  );
  const leafParentId = await currentParentId(page, leaf.entryId);
  const datesBefore = await page.evaluate((id) => {
    const entry = window.__gantt.dataset.entries.get(id)!;
    return { start: Number(entry.start), end: Number(entry.end) };
  }, leaf.entryId);

  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;

  await countChangesFromHere(page);

  await dragPointerTo(page, grabX, grabY, grabX, targetBox.y + targetBox.height / 2);
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.read('parentId'), leaf.entryId),
    )
    .toBe(target.entryId);

  // One transaction, and the grabbed entry's own dates never moved — a grid drag reorders, it
  // never shifts time.
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(1);
  expect(
    await page.evaluate((id) => {
      const entry = window.__gantt.dataset.entries.get(id)!;
      return { start: Number(entry.start), end: Number(entry.end) };
    }, leaf.entryId),
  ).toEqual(datesBefore);

  const undoBtn = page.getByRole('button', { name: 'Undo' });
  await expect(undoBtn).toBeEnabled();
  await undoBtn.click();
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(leafParentId);
});

test('holding a grid row drag at the bottom edge scrolls the rows, and the drop lands on a row that was off screen', async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);
  const visibleAtStart = await visibleRowEntryIds(page);
  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount === 0 && row.hasOwnBar),
    viewport,
  );

  await countChangesFromHere(page);

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await holdAtBottomEdgeUntilRowsSettle(page, grabX);

  const target = await parentRowScrolledIntoView(page, visibleAtStart);
  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;
  await page.mouse.move(grabX, targetBox.y + targetBox.height / 2, { steps: 1 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.read('parentId'), leaf.entryId),
    )
    .toBe(target.entryId);
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(1);
});

test('a plain click on a grid row selects it and writes nothing', async ({ page }) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);
  const { row, grabX, grabY } = await firstVisibleGridRow(page, rows, viewport);

  await countChangesFromHere(page);
  await page.mouse.click(grabX, grabY);

  await expect.poll(() => page.evaluate(() => window.__gantt.selectedEntryIds)).toEqual([row.entryId]);
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(0);
});

test('dragging a parent grid row onto its own child row refuses, with a not-allowed cursor, and writes nothing', async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);

  const parentCandidates: RowInfo[] = [];
  for (const row of rows.filter((row) => row.childCount > 0)) {
    if (await hasDirectLeafChild(page, row.entryId)) parentCandidates.push(row);
  }
  const { row: parentRow, grabX, grabY } = await firstVisibleGridRow(page, parentCandidates, viewport);
  const childRow = await firstChildRow(page, parentRow.entryId, rows);
  const childBox = (await gridRow(page, childRow.rowId).boundingBox())!;

  const beforeParentId = await currentParentId(page, parentRow.entryId);

  await dragPointerTo(page, grabX, grabY, grabX, childBox.y + childBox.height / 2);

  await expect(page.locator('#gantt')).toHaveAttribute('data-drop', 'refused');
  await expect
    .poll(() => page.locator('#gantt').evaluate((el) => getComputedStyle(el).cursor))
    .toBe('not-allowed');

  await page.mouse.up();
  await expect.poll(() => currentParentId(page, parentRow.entryId)).toBe(beforeParentId);
});

test('with "Lock tree" checked, a grid row drag commits nothing, and a plain click still selects', async ({
  page,
}) => {
  await gotoGeneric(page);
  await page.check('#lock-tree-checkbox');
  // `check()` scrolls its own target into view first — the checkbox sits below `#gantt`, so that
  // scroll can carry the pane itself off the top of the viewport.
  await page.locator('#gantt').scrollIntoViewIfNeeded();

  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);
  const { row: leaf } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount === 0),
    viewport,
  );

  // The lock refuses only the reorder grab, not the row's own selection — a plain click (no
  // travel, so no drag ever has a chance to arm) still selects it. Checked first, through
  // Playwright's own locator click (it waits for the row to be stable and actionable, unlike a
  // manual mouse move to a box read earlier): selecting a row reflows the readout above #gantt
  // (the double-click test's own note), which would carry a stale box into a later read.
  await gridRow(page, leaf.rowId).click();
  await expect.poll(() => page.evaluate(() => window.__gantt.selectedEntryIds)).toEqual([leaf.entryId]);

  const leafParentId = await currentParentId(page, leaf.entryId);
  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const leafBox = (await gridRow(page, leaf.rowId).boundingBox())!;
  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;

  await countChangesFromHere(page);

  // The lock refuses the grab itself (`can('reorder', …)`), so this pointer sequence never arms a
  // drag and commits nothing, wherever it ends up.
  await dragPointerTo(
    page,
    leafBox.x + leafBox.width - 20,
    leafBox.y + leafBox.height / 2,
    targetBox.x + targetBox.width - 20,
    targetBox.y + targetBox.height / 2,
  );
  await page.mouse.up();

  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(0);
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(leafParentId);
});

// #612: the lock is a core Field now, reached through the right-click "Lock" command instead of a
// harness plugin — the two tests below stand in for the "Lock tree" one above, at the single-row
// grain a real consumer locks at.
test("a locked row's grid drag commits nothing, and a plain click still selects", async ({ page }) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);
  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount === 0),
    viewport,
  );

  await lockEntryAt(page, grabX, grabY);

  // The lock refuses only the reorder grab, not the row's own selection — a plain click still
  // selects it, the same proof the "Lock tree" test above reads for the whole-tree lock.
  await gridRow(page, leaf.rowId).click();
  await expect.poll(() => page.evaluate(() => window.__gantt.selectedEntryIds)).toEqual([leaf.entryId]);

  const leafParentId = await currentParentId(page, leaf.entryId);
  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;

  await countChangesFromHere(page);

  await dragPointerTo(page, grabX, grabY, grabX, targetBox.y + targetBox.height / 2);
  await page.mouse.up();

  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(0);
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(leafParentId);
});

test("a grid row dropped into a locked parent's middle commits: the lock protects only its own row", async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount === 0),
    viewport,
  );
  const leafParentId = await currentParentId(page, leaf.entryId);
  const {
    row: target,
    grabX: targetGrabX,
    grabY: targetGrabY,
  } = await firstVisibleGridRow(
    page,
    rows.filter((row) => row.childCount > 0 && row.entryId !== leafParentId),
    viewport,
  );

  await lockEntryAt(page, targetGrabX, targetGrabY);

  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;

  await dragPointerTo(page, grabX, grabY, grabX, targetBox.y + targetBox.height / 2);

  await expect(page.locator('#gantt')).not.toHaveAttribute('data-drop', 'refused');

  await page.mouse.up();
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(target.entryId);
  expect(leafParentId).not.toBe(target.entryId);
});

test('a double-click on a Name cell still opens the inline editor', async ({ page }) => {
  await gotoGeneric(page);
  const cell = page.locator('#gantt .fg-row [data-field="name"]').first();
  await expect(cell).toBeVisible();
  await cell.click(); // settle the #selection-readout reflow before the real double-click
  await cell.dblclick();

  await expect(page.locator('#gantt .fg-cell-editor')).toBeVisible();
});

test('a twisty click still collapses its row and arms no drag', async ({ page }) => {
  await gotoGeneric(page);
  const rows = await rowPlan(page);
  const parentIndex = rows.findIndex((row) => row.childCount > 0);
  const parent = rows[parentIndex]!;
  const childRowId = rows[parentIndex + 1]!.rowId;

  await countChangesFromHere(page);

  const twisty = gridRow(page, parent.rowId).locator('.fg-row-twisty:not([hidden])');
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');

  await twisty.click();

  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`#gantt .fg-row[data-row-id="${childRowId}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(0);
});

test("the insertion line sits deeper above a group's last child than below it, dragged from the grid", async ({
  page,
}) => {
  await gotoGeneric(page);
  const allRows = await rowPlan(page);
  const viewport = await rowsViewportBox(page);

  // A leaf whose next row steps back out to a shallower depth: the owner's rule says the leaf's own
  // bottom zone still belongs to its group (deeper), and the row right after does not.
  let boundaryIndex = -1;
  for (let i = 0; i < allRows.length - 1; i++) {
    if (allRows[i]!.childCount === 0 && allRows[i + 1]!.depth < allRows[i]!.depth) {
      boundaryIndex = i;
      break;
    }
  }
  if (boundaryIndex === -1) {
    throw new Error('no group boundary (a leaf followed by a shallower row) in the generic-demo fixture');
  }
  const above = allRows[boundaryIndex]!;
  const below = allRows[boundaryIndex + 1]!;

  // A different, non-adjacent leaf to grab — its own row must not itself sit on the boundary being
  // measured, or its "source row" would swallow one of the two readings.
  const { grabX, grabY } = await firstVisibleGridRow(
    page,
    allRows.filter(
      (row, index) =>
        row.childCount === 0 &&
        Math.abs(index - boundaryIndex) > 1 &&
        Math.abs(index - boundaryIndex - 1) > 1,
    ),
    viewport,
  );

  const aboveBox = (await gridRow(page, above.rowId).boundingBox())!;
  const belowBox = (await gridRow(page, below.rowId).boundingBox())!;
  const dropLine = page.locator('#gantt .fg-rows > .fg-drop-line');

  /** Reads the line's left inset at `y`, in its own fresh gesture — Escape then release, so no
   *  reading's hysteresis carries into the next one. */
  async function lineLeftAt(y: number): Promise<number> {
    await dragPointerTo(page, grabX, grabY, grabX, y);
    await expect(dropLine).toBeVisible();
    const left = (await dropLine.boundingBox())!.x;
    await page.keyboard.press('Escape');
    await page.mouse.up();
    return left;
  }

  const insetAboveBoundary = await lineLeftAt(aboveBox.y + aboveBox.height - 2);
  const insetBelowBoundary = await lineLeftAt(belowBox.y + 2);

  expect(insetAboveBoundary).toBeGreaterThan(insetBelowBoundary);
});

test('holding a grid row drag over a collapsed parent expands it, and the drop lands between its children', async ({
  page,
}) => {
  await gotoGeneric(page);
  const before = await rowPlan(page);
  const viewport = await rowsViewportBox(page);
  const { row: leaf } = await firstVisibleGridRow(
    page,
    before.filter((row) => row.childCount === 0 && row.hasOwnBar),
    viewport,
  );
  // Collapsing an ancestor hides the leaf. The target has to sit on another branch.
  const ancestors = new Set<string>();
  let walk = await currentParentId(page, leaf.entryId);
  while (walk) {
    ancestors.add(walk);
    walk = await currentParentId(page, walk);
  }
  // A parent that draws its children as bars on itself has no child rows to expand. A parent
  // with child rows paints a row one level deeper right below it.
  const target = before.find(
    (row, index) =>
      row.childCount > 0 &&
      row.entryId !== leaf.entryId &&
      !ancestors.has(row.entryId) &&
      before[index + 1]?.depth === row.depth + 1,
  )!;

  await page.evaluate((id) => window.__gantt.collapse(id), target.rowId);
  await expect
    .poll(() => page.evaluate((id) => window.__gantt.collapseStateOf(id), target.rowId))
    .toBe('collapsed');

  // The collapse moved every row below it, so read the grab point and the target after it.
  const collapsedRows = await rowPlan(page);
  const leafAfter = collapsedRows.find((row) => row.entryId === leaf.entryId);
  expect(leafAfter).toBeDefined();
  await gridRow(page, leafAfter!.rowId).scrollIntoViewIfNeeded();
  const grab = await firstVisibleGridRow(page, [leafAfter!], await rowsViewportBox(page));
  await gridRow(page, target.rowId).scrollIntoViewIfNeeded();
  const targetBox = (await gridRow(page, target.rowId).boundingBox())!;
  await countChangesFromHere(page);

  await dragPointerTo(page, grab.grabX, grab.grabY, grab.grabX, targetBox.y + targetBox.height / 2);

  // The pointer holds still: only the delay expands the parent.
  await expect
    .poll(() => page.evaluate((id) => window.__gantt.collapseStateOf(id), target.rowId))
    .toBe('expanded');
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(0);
  expect(await page.evaluate(() => window.__gantt.dataset.canUndo)).toBe(false);

  // The first child row now sits below the parent. Its top third drops before it.
  const firstChild = await firstChildRow(page, target.entryId, await rowPlan(page));
  const childBox = (await gridRow(page, firstChild.rowId).boundingBox())!;
  await page.mouse.move(grab.grabX, childBox.y + 3, { steps: 1 });
  await page.mouse.up();

  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(target.entryId);
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(1);
});
