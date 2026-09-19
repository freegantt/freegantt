import { test, expect } from '@playwright/test';

// #435: `barLabels: 'insideOrNone'` reads the same fit predicate `'fitBar'` already computes, but
// spends a bar too narrow for its label on no label at all, never on the outside fallback that
// `'fitBar'` and `'outside'` both take — the one placement a grid of contiguous day-tiles cannot
// afford, because it paints across the next tile. Real measured widths only: happy-dom does no
// layout, so this is a Playwright check, not a DOM unit test (harness/bar-label-fit.ts).
test('bar labels stay inside a narrow contiguous tile grid, never spilling onto the next tile (#435)', async ({
  page,
}) => {
  await page.goto('/bar-label-fit.html');

  const bars = page.locator('#gantt .fg-bar');
  await expect(bars.first()).toBeVisible();
  await expect(bars).toHaveCount(40);

  // Narrow: none of the forty day-bars has room for "Day N", so none of them paints a label —
  // never `data-label="outside"`, which would mean one day's text sitting on the next day's tile.
  await expect(page.locator('#gantt .fg-bar[data-label]')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-bar-label')).toHaveCount(0);

  // Widening every bar (`gantt.fit` reassigned live, I8) crosses the fit line: every bar now has
  // room, so every one paints its label inside — still never outside. At this width the forty tiles
  // (4800px) no longer all fit the viewport at once, so windowing keeps only the visible ones
  // mounted (`layout/viewport`) — the assertion below counts the rendered set against itself, not
  // against 40, so it holds regardless of how many that windowing happens to mount.
  await page.getByRole('button', { name: 'Widen days' }).click();
  await expect(page.locator('#gantt .fg-bar[data-label="outside"]')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-bar:not([data-label="inside"])')).toHaveCount(0);
  const renderedBars = await page.locator('#gantt .fg-bar').count();
  expect(renderedBars).toBeGreaterThan(0);
  await expect(
    page
      .locator('#gantt .fg-bar', { hasText: /^Day 1$/ })
      .first()
      .locator('.fg-bar-label'),
  ).toHaveText('Day 1');

  // Narrowing back live drops every label again, with no page reload and no remount.
  await page.getByRole('button', { name: 'Narrow days' }).click();
  await expect(page.locator('#gantt .fg-bar[data-label]')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-bar-label')).toHaveCount(0);
});
