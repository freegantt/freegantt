import { test, expect } from '@playwright/test';

// S4.11 (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md §2): hierarchy.html exercises tree
// collapse, live row-source re-resolution, pack-mode heights, segmented drag + undo, and tree keyboard.

async function gotoHierarchy(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/hierarchy.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();
}

async function gotoHierarchyShort(page: import('@playwright/test').Page): Promise<void> {
  await gotoHierarchy(page);
  await page.locator('#gantt').evaluate((el) => {
    (el as HTMLElement).style.height = '220px';
  });
  await page.waitForTimeout(300);
  await page.locator('#gantt .fg-timeline-pane').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
}

async function showAprilBars(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.__gantt.panToDate('2026-04-10', 'center');
  });
  await page.waitForTimeout(200);
}

function timelinePane(page: import('@playwright/test').Page) {
  return page.locator('#gantt .fg-timeline-pane');
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

test('twisty collapses a subtree and aria-expanded flips', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page.locator('[data-row-id="phase-a"]');
  const twisty = parentRow.locator('.fg-row-twisty');
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  const childRow = page.locator('[data-row-id="task-alpha-1"]');
  await expect(childRow).toBeVisible();

  await twisty.click();

  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(childRow).toBeHidden();
});

test('[S4-A3] switching row source keeps the scroll offset', async ({ page }) => {
  await gotoHierarchyShort(page);

  const pane = timelinePane(page);
  await page.click('#expand-all-btn');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  const before = await pane.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);

  await page.selectOption('#rows-mode', 'grouped');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);

  await page.selectOption('#rows-mode', 'tree');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
});

test('pack mode grows a packed row', async ({ page }) => {
  await gotoHierarchyShort(page);
  await showAprilBars(page);

  const segmentedRow = page.locator('[data-row-id="segmented"]');
  const beforeSeg = await segmentedRow.boundingBox();
  expect(beforeSeg).not.toBeNull();

  await page.selectOption('#height-mode', 'pack');

  await expect
    .poll(async () => {
      const afterSeg = await segmentedRow.boundingBox();
      return afterSeg !== null && afterSeg.height > beforeSeg!.height;
    })
    .toBe(true);
});

test('a bar drag moves one entry and Undo restores it', async ({ page }) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.panToDate('2026-03-12', 'center');
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });

  const bar = page.locator('#gantt .fg-bar[data-item-id="task-beta:0"]');
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  expect(before).not.toBeNull();

  await dragBarBy(page, bar, 120);

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after !== null && Math.abs(after.x - before!.x) > 8;
    })
    .toBe(true);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await bar.boundingBox();
      return restored !== null && Math.abs(restored.x - before!.x);
    })
    .toBeLessThan(2);
});

test('ArrowRight expands and ArrowLeft collapses with focus on the selected row', async ({ page }) => {
  await gotoHierarchy(page);

  await page.locator('[data-row-id="phase-a"] .fg-row-twisty').click();
  await expect(page.locator('[data-row-id="task-alpha-1"]')).toBeHidden();

  const phaseBar = page.locator('#gantt .fg-bar[data-item-id^="phase-a:"]').first();
  await phaseBar.click();
  await expect(page.locator('#selection-readout')).toContainText('phase-a');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-row-id="task-alpha-1"]')).toBeVisible();
  await expect(page.locator('[data-row-id="phase-a"] .fg-row-twisty')).toHaveAttribute(
    'aria-expanded',
    'true',
  );

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-row-id="task-alpha-1"]')).toBeHidden();
  await expect(page.locator('[data-row-id="phase-a"] .fg-row-twisty')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});
