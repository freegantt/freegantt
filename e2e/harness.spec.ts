import { test, expect } from '@playwright/test';

// S0 acceptance (plans/03-slices.md): "Harness shows fixture entries as bars positioned
// correctly against time." Smoke-checks what the DOM unit test (src/api/gantt.test.ts)
// already proves headlessly, but in a real browser.
test('harness renders the fixture project as positioned bars', async ({ page }) => {
  await page.goto('/');

  const bars = page.locator('#gantt .fg-bar');
  await expect(bars.first()).toBeVisible();

  const count = await bars.count();
  expect(count).toBeGreaterThan(1);

  const box = await bars.first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

// Regression: GanttShell.render() hardcoded computeFrame's viewport to (0,0), so scrolling past
// the first screenful of rows culled everything to nothing — the pane went blank instead of
// showing the rows actually scrolled into view.
test('scrolling to the bottom of the frame shows rows, not a blank pane', async ({ page }) => {
  await page.goto('/');

  const host = page.locator('#gantt');
  await host.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(host.locator('.fg-row').first()).toBeVisible();
  const rowCount = await host.locator('.fg-row').count();
  expect(rowCount).toBeGreaterThan(0);

  const scrollTop = await host.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

// Regression: the bar layer was offset with `left`, which shifts a relatively-positioned box
// without shrinking its (auto) width — so it always overflowed the host by the row-label gutter
// width, and dragging the horizontal scrollbar into that range revealed a dead blank strip past
// the real content instead of any bar/tick.
test('the frame has no dead horizontal overflow past the row-label gutter', async ({ page }) => {
  await page.goto('/');

  const host = page.locator('#gantt');
  const overflow = await host.evaluate((el) => el.scrollWidth - el.clientWidth);
  const rowLabelWidth = await host.evaluate(
    (el) => parseFloat(getComputedStyle(el).getPropertyValue('--fg-row-label-width')) || 0,
  );

  // Some overflow is expected (header tick labels can be wider than their day slot at this
  // zoom level); it must never reach the old bug's full gutter-width dead zone.
  expect(overflow).toBeLessThan(rowLabelWidth);
});
