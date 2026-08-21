import { test, expect } from '@playwright/test';

// S0 acceptance (plans/03-slices.md): "Harness shows fixture tasks as bars positioned
// correctly against time." Smoke-checks what the DOM unit test (src/api/gantt.test.ts)
// already proves headlessly, but in a real browser.
test('harness renders the fixture project as positioned bars', async ({ page }) => {
  await page.goto('/');

  const bars = page.locator('#chart .fg-bar');
  await expect(bars.first()).toBeVisible();

  const count = await bars.count();
  expect(count).toBeGreaterThan(1);

  const box = await bars.first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});
