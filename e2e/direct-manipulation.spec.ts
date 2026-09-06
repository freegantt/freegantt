import { test, expect } from '@playwright/test';

// [S3-A8] (plans/s3-direct-manipulation/s3.8-cursor-line-harness-gate.md): Cursor line during a
// pointer drag, drag + Ctrl+Z, and the harness veto toast. Targets are found in the DOM at test
// time so a fixture edit does not break the assertions.

async function gotoEditing(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/editing.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
}

async function barRightOf(
  page: import('@playwright/test').Page,
  x: number,
): Promise<import('@playwright/test').Locator> {
  const bars = page.locator('#gantt .fg-bar');
  const count = await bars.count();
  for (let i = 0; i < count; i++) {
    const bar = bars.nth(i);
    const box = await bar.boundingBox();
    if (box !== null && box.x > x + 40) return bar;
  }
  throw new Error('no painted bar sits to the right of the mobilization line');
}

async function dragBy(
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
}

test('[S3-A8] a pointer drag paints the Cursor line, then parks it on pointerup', async ({ page }) => {
  await gotoEditing(page);

  const lineBox = await page.locator('#gantt .fg-date-line.demo-mobilization-line').boundingBox();
  expect(lineBox).not.toBeNull();
  const bar = await barRightOf(page, lineBox!.x);

  await dragBy(page, bar, 80);

  const line = page.locator('#gantt .fg-cursor-line');
  const label = page.locator('#gantt .fg-cursor-line-label');
  await expect(line).toBeVisible();
  await expect(label).toBeVisible();
  await expect(label).not.toHaveText('');

  await page.mouse.up();
  await expect(line).toBeHidden();
});

test('[S3-A8] drag then Ctrl+Z restores the bar to its pre-gesture position', async ({ page }) => {
  await gotoEditing(page);

  const lineBox = await page.locator('#gantt .fg-date-line.demo-mobilization-line').boundingBox();
  expect(lineBox).not.toBeNull();

  const bar = await barRightOf(page, lineBox!.x);
  const before = await bar.boundingBox();
  expect(before).not.toBeNull();

  await dragBy(page, bar, 120);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after ? after.x - before!.x : 0;
    })
    // 8px: well past the 4px drag threshold and past typical subpixel layout jitter.
    .toBeGreaterThan(8);

  await page.keyboard.press('Control+z');

  await expect
    .poll(async () => {
      const restored = await bar.boundingBox();
      return restored ? Math.abs(restored.x - before!.x) : 99;
    })
    // 2px: same glue tolerance as e2e/date-lines.spec.ts (subpixel rounding, not a missed undo).
    .toBeLessThan(2);
});

test('[S3-A8] dropping a bar before the mobilization line shows the veto toast', async ({ page }) => {
  await gotoEditing(page);
  await page.selectOption('#snap-unit', 'none');

  const line = page.locator('#gantt .fg-date-line.demo-mobilization-line');
  await expect(line).toBeVisible();
  const lineBox = await line.boundingBox();
  expect(lineBox).not.toBeNull();

  const bar = await barRightOf(page, lineBox!.x);
  // 400px left at typical harness density is several days — enough to cross a line the bar
  // already sat only 40px to the right of, even after snap: none.
  await dragBy(page, bar, -400);
  await page.mouse.up();

  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('Too early');
  // S5.12, D-S5-40: the same veto also reaches the page's one `watchAllErrors` subscription, which
  // logs every report the Dataset or the Gantt raises. `plans/02` §3's "a vetoed gesture is silent"
  // stays true of the UI above; it reports as well.
  await expect(page.locator('#log')).toContainText('error · info · consumer · entry-move-cancelled');
});

test('[S3-A8] a held drop paints pending until Hold drop is unchecked', async ({ page }) => {
  await gotoEditing(page);
  await page.selectOption('#snap-unit', 'none');
  await page.locator('#hold-drop').check();

  const lineBox = await page.locator('#gantt .fg-date-line.demo-mobilization-line').boundingBox();
  expect(lineBox).not.toBeNull();
  const bar = await barRightOf(page, lineBox!.x);
  const before = await bar.boundingBox();
  expect(before).not.toBeNull();

  await dragBy(page, bar, 80);
  await page.mouse.up();

  await expect(page.locator('#gantt .fg-bar[data-state~="pending"]').first()).toBeVisible();

  await page.locator('#hold-drop').uncheck();

  await expect(page.locator('#gantt .fg-bar[data-state~="pending"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after ? after.x - before!.x : 0;
    })
    // 8px: well past the 4px drag threshold and past typical subpixel layout jitter.
    .toBeGreaterThan(8);
});
