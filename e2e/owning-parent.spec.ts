import { test, expect, type Page } from '@playwright/test';

// #470: a Field may opt out of the Rollup with `rollUp: 'none'`. `harness/owning-parent.ts`
// declares both `start` and `end` that way, so `phase` is an ordinary bar — its own dates, not a
// derived envelope. `src/view/capability.test.ts` and `src/view/gesture-pipeline.test.ts` pin the
// resolver and the write set; this is the pointer end only a real browser proves: hit-testing the
// `.fg-bar-summary` bracket and a resize handle on a row that still has children.

const DRAG_DX = 100;

/** Dates as the Dataset holds them, keyed by entry id. */
async function datesOf(page: Page, ids: readonly string[]): Promise<Record<string, [number, number]>> {
  return page.evaluate((wanted) => {
    const dates: Record<string, [number, number]> = {};
    for (const id of wanted) {
      const entry = window.__gantt.dataset.entries.get(id);
      if (entry?.start !== undefined && entry.end !== undefined) {
        dates[id] = [Number(entry.start), Number(entry.end)];
      }
    }
    return dates;
  }, ids);
}

async function gotoOwningParent(page: Page): Promise<void> {
  await page.goto('/owning-parent.html');
  await expect(page.locator('#gantt .fg-bar-summary')).toBeVisible();
}

/** Grabs the parent's own summary bar, at a point clear of its resize handles, and drags it `dx`
 *  pixels right. */
async function grabAndDragParentBarBy(page: Page, dx: number): Promise<void> {
  const bar = page.locator('#gantt .fg-bar-summary');
  const box = (await bar.boundingBox())!;
  const grabX = box.x + 8;
  const grabY = box.y + box.height / 2;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + dx, grabY, { steps: 8 });
  await page.mouse.up();
}

test('dragging the owning parent bar moves the parent and its children by one shared delta (#470)', async ({
  page,
}) => {
  await gotoOwningParent(page);

  const before = await datesOf(page, ['phase', 'task-a', 'task-b']);
  await grabAndDragParentBarBy(page, DRAG_DX);

  await expect
    .poll(async () => (await datesOf(page, ['task-a']))['task-a']![0])
    .toBeGreaterThan(before['task-a']![0]);

  const after = await datesOf(page, ['phase', 'task-a', 'task-b']);
  const deltas = ['phase', 'task-a', 'task-b'].flatMap((id) => [
    after[id]![0] - before[id]![0],
    after[id]![1] - before[id]![1],
  ]);
  // One delta on every row's start and end, the parent included — proof the write landed on
  // `phase` itself, not a Rollup recompute: `rollUp: 'none'` means nothing recomputes it.
  expect(new Set(deltas).size).toBe(1);
  expect(deltas[0]).toBeGreaterThan(0);
});

test("dragging the parent's end handle changes only the parent's end (#470)", async ({ page }) => {
  await gotoOwningParent(page);

  const before = await datesOf(page, ['phase', 'task-a', 'task-b']);
  const bar = page.locator('#gantt .fg-bar-summary');
  const box = (await bar.boundingBox())!;
  const barY = box.y + box.height / 2;
  // Drag from the bar's own visible right edge, not the handle's own bounding box: a real user
  // grabs the edge they can see (`e2e/resize.spec.ts`'s own `dragBarEndEdgeBy`).
  await page.mouse.move(box.x + box.width / 2, barY);
  const endHandle = page.locator('.fg-bar-handle[data-edge="end"]');
  await expect(endHandle).toBeVisible();
  await page.mouse.move(box.x + box.width, barY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + DRAG_DX, barY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await datesOf(page, ['phase']))['phase']![1])
    .toBeGreaterThan(before['phase']![1]);

  const after = await datesOf(page, ['phase', 'task-a', 'task-b']);
  // The parent alone stretched. The subtree does not stretch with a resize (#470's decision table).
  expect(after['phase']![0]).toBe(before['phase']![0]);
  expect(after['task-a']).toEqual(before['task-a']);
  expect(after['task-b']).toEqual(before['task-b']);
});

test('one undo restores every row after an owning-parent drag (#470)', async ({ page }) => {
  await gotoOwningParent(page);

  const before = await datesOf(page, ['phase', 'task-a', 'task-b']);
  await grabAndDragParentBarBy(page, DRAG_DX);

  await expect(page.locator('#undo-btn')).toBeEnabled();
  await expect
    .poll(async () => (await datesOf(page, ['task-a']))['task-a']![0])
    .toBeGreaterThan(before['task-a']![0]);

  await page.click('#undo-btn');

  // One transaction per gesture, so one undo returns the parent and both children.
  await expect.poll(async () => datesOf(page, ['phase', 'task-a', 'task-b'])).toEqual(before);
});
