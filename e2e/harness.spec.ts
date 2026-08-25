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

// Regression: GanttShell.render() hardcoded computeFrame's culling window to (0,0), so scrolling past
// the first screenful of rows culled everything to nothing — the pane went blank instead of
// showing the rows actually scrolled into view.
//
// The timeline pane is the native scroller (S1.8, D-D/D-S1.8-1) — `#gantt` itself no longer scrolls.
test('scrolling to the bottom of the frame shows rows, not a blank pane', async ({ page }) => {
  await page.goto('/');

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(page.locator('.fg-grid-pane .fg-row').first()).toBeVisible();
  const rowCount = await page.locator('.fg-grid-pane .fg-row').count();
  expect(rowCount).toBeGreaterThan(0);

  const scrollTop = await pane.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

// D1 (plans/s1.8-pane-layout/README.md, D-S1.8-1/D-S1.8-10): the row-label gutter used to sit
// inside the scrollable content, so the timeline pane's native scrollable range was
// `gridWidth + contentWidth` wide though only `contentWidth` of it was timeline. This is the real
// `scrollWidth` assertion happy-dom cannot express (src/view/gantt-shell.test.ts's D1 test reads the
// content sizer's own transform instead, for that reason) — only a real layout engine settles it.
test('the timeline pane has no row-label gutter in its scrollable content (D1)', async ({ page }) => {
  await page.goto('/');

  const pane = page.locator('.fg-timeline-pane');
  const scrollWidth = await pane.evaluate((el) => el.scrollWidth);
  const clientWidth = await pane.evaluate((el) => el.clientWidth);
  const gridPaneWidth = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);

  // fitDataset: content is fitted to the pane, so any overflow is header tick labels running
  // wider than their day slot at this zoom level, not scrollable content — it must stay far under
  // a whole grid-pane-width's worth (the old defect's exact shape: `gridWidth + contentWidth`).
  expect(scrollWidth - clientWidth).toBeLessThan(gridPaneWidth);
});
