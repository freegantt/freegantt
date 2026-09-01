import { test, expect } from '@playwright/test';

// S4.11 (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md §2): hierarchy.html exercises tree
// collapse, live row-source re-resolution, pack-mode heights, segmented drag + undo, and tree keyboard.

async function gotoHierarchy(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/hierarchy.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();
}

function timelinePane(page: import('@playwright/test').Page) {
  return page.locator('#gantt .fg-timeline-pane');
}

async function gotoHierarchyShort(page: import('@playwright/test').Page): Promise<void> {
  await gotoHierarchy(page);
  const pane = timelinePane(page);
  await page.locator('#gantt').evaluate((el) => {
    (el as HTMLElement).style.height = '220px';
  });
  // 220px is the demo short pane; wait until layout has applied it, then scroll to the bottom.
  await expect.poll(async () => pane.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(220);
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
}

async function entryWithSegments(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    return entry === undefined ? undefined : String(entry.id);
  });
  if (id === undefined) throw new Error('the dataset has no multi-segment entry');
  return id;
}

function barsForEntry(page: import('@playwright/test').Page, entryId: string) {
  return page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`);
}

async function showSegmentedSpan(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    if (entry === undefined) throw new Error('the dataset has no multi-segment entry');
    window.__gantt.zoomToSpan({ start: entry.start, end: entry.end });
  });
  const entryId = await entryWithSegments(page);
  await expect(barsForEntry(page, entryId).nth(1)).toBeVisible();
}

async function dragBarBy(
  page: import('@playwright/test').Page,
  bar: import('@playwright/test').Locator,
  dx: number,
): Promise<void> {
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + Math.min(box!.width / 2, 20);
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

async function rowIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator('#gantt .fg-row')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['rowId'] ?? ''));
}

test('twisty collapses a subtree and aria-expanded flips', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  await expect(childRow).toBeVisible();
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();

  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`[data-row-id="${childId}"]`)).toHaveCount(0);
});

test('[S4-A3] switching row source changes the row set and keeps the scroll offset', async ({ page }) => {
  await gotoHierarchyShort(page);

  const pane = timelinePane(page);
  await page.click('#expand-all-btn');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  const before = await pane.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const treeIds = await rowIds(page);

  await page.selectOption('#rows-mode', 'grouped');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
  await expect.poll(async () => rowIds(page)).not.toEqual(treeIds);

  await page.selectOption('#rows-mode', 'tree');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
});

test('pack mode grows a packed row and shifts the rows below', async ({ page }) => {
  await gotoHierarchyShort(page);

  const entryId = await entryWithSegments(page);
  const packedRow = page.locator(`[data-row-id="${entryId}"]`);
  const beforePacked = await packedRow.boundingBox();
  expect(beforePacked).not.toBeNull();

  const rows = page.locator('#gantt .fg-row');
  const count = await rows.count();
  let below: import('@playwright/test').Locator | undefined;
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox();
    if (box !== null && box.y > beforePacked!.y + beforePacked!.height - 1) {
      below = rows.nth(i);
      break;
    }
  }
  expect(below).toBeDefined();
  const beforeBelow = await below!.boundingBox();
  expect(beforeBelow).not.toBeNull();

  await page.selectOption('#height-mode', 'pack');

  await expect
    .poll(async () => {
      const afterPacked = await packedRow.boundingBox();
      return afterPacked !== null && afterPacked.height > beforePacked!.height;
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const afterBelow = await below!.boundingBox();
      return afterBelow !== null && afterBelow.y > beforeBelow!.y;
    })
    .toBe(true);
});

test('a segment drag moves one bar and Undo restores it', async ({ page }) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const bar = bars.nth(1);
  const sibling = bars.first();
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  const siblingBefore = await sibling.boundingBox();
  expect(before).not.toBeNull();
  expect(siblingBefore).not.toBeNull();

  await dragBarBy(page, bar, 120);

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after !== null && Math.abs(after.x - before!.x) > 8;
    })
    .toBe(true);

  const siblingAfter = await sibling.boundingBox();
  expect(siblingAfter).not.toBeNull();
  expect(Math.abs(siblingAfter!.x - siblingBefore!.x)).toBeLessThan(2);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await bar.boundingBox();
      return restored !== null && Math.abs(restored.x - before!.x);
    })
    .toBeLessThan(2);
});

test('ArrowRight expands and ArrowLeft collapses; focus stays on the Gantt', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();
  await expect(page.locator(`[data-row-id="${childId}"]`)).toHaveCount(0);

  const ganttRoot = page.locator('#gantt');
  const parentId = await parentRow.getAttribute('data-row-id');
  expect(parentId).toBeTruthy();
  await page.locator(`#gantt .fg-bar[data-item-id^="${parentId}:"]`).first().click();
  await ganttRoot.focus();
  await expect(ganttRoot).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`[data-row-id="${childId}"]`)).toBeVisible();
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  await expect(ganttRoot).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(`[data-row-id="${childId}"]`)).toHaveCount(0);
  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(ganttRoot).toBeFocused();
});
