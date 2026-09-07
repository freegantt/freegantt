import { test, expect } from '@playwright/test';

// #248 S4-3: harness/main.ts used to hold `grouped` and `pack` as local flags mirroring
// gantt.rowSource. Now that the getter reads back resolved (S4-2), the toolbar reads both off
// the Gantt instead. This pins the proof: each toggle click still lands on the button label a
// consumer reading gantt.rowSource itself would compute, across two toggles each — one full
// round trip and back.
test('grouping and packing buttons read their label off gantt.rowSource, not a local mirror', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const groupBtn = page.locator('#rows-source-btn');
  const packBtn = page.locator('#pack-rows-btn');

  await expect(groupBtn).toHaveText('Group by team');
  await expect(packBtn).toHaveText('Pack overlapping bars');

  await groupBtn.click();
  await expect(groupBtn).toHaveText('Show tree');
  await expect(packBtn).toHaveText('Pack overlapping bars');

  await groupBtn.click();
  await expect(groupBtn).toHaveText('Group by team');
  await expect(packBtn).toHaveText('Pack overlapping bars');

  await packBtn.click();
  await expect(packBtn).toHaveText('Stack bars (fixed rows)');
  await expect(groupBtn).toHaveText('Group by team');

  await packBtn.click();
  await expect(packBtn).toHaveText('Pack overlapping bars');
  await expect(groupBtn).toHaveText('Group by team');
});
