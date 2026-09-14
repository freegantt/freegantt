import { test, expect } from '@playwright/test';

// #248 S4-3: harness/main.ts used to hold `grouped` as a local flag mirroring gantt.rowSource. Now
// that the getter reads back resolved (S4-2), the toolbar reads it off the Gantt instead. This pins
// the proof: the button label round-trips a consumer reading gantt.rowSource itself would compute,
// across two toggles.
test('the grouping button reads its label off gantt.rowSource, not a local mirror', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const groupBtn = page.locator('#rows-source-btn');

  await expect(groupBtn).toHaveText('Group by team');

  await groupBtn.click();
  await expect(groupBtn).toHaveText('Show tree');

  await groupBtn.click();
  await expect(groupBtn).toHaveText('Group by team');
});
