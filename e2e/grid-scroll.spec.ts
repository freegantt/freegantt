import { test, expect } from '@playwright/test';

// #126: a plain wheel over the grid pane used to do nothing at all — the grid pane was never a
// scroller and nothing forwarded wheel input from it into the timeline pane's shared scroll
// (D-S1.8-1, D-S1.8-13). The timeline pane stays the single native *vertical* scroller — the
// assertion below reads its scrollTop, matching e2e/harness.spec.ts's own scroll assertion,
// just triggered from the grid pane instead.
test('a plain wheel over the grid pane scrolls rows, matching the timeline pane (#126)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const timelinePane = page.locator('.fg-timeline-pane');
  expect(await timelinePane.evaluate((el) => el.scrollTop)).toBe(0);

  await page.locator('.fg-grid-pane').hover();
  await page.mouse.wheel(0, 2000);

  await expect.poll(async () => timelinePane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

// #126: fixed-width grid columns can already be given a pixel width that never shrinks
// (GridColumn.width -> flex: 0 0 auto). Several summing past gridWidth used to clip silently
// (`.fg-grid-pane { overflow: hidden }`) — harness/grid-scroll.ts configures four 120px columns
// inside a 220px pane so the overflow is real, and D-S1.8-13 gives the pane its own independent
// horizontal scroller to reach it.
test('the grid pane scrolls horizontally to reach columns that overflow it (#126)', async ({ page }) => {
  await page.goto('/grid-scroll.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const gridPane = page.locator('#gantt .fg-grid-pane');
  const overflow = await gridPane.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeGreaterThan(0);

  expect(await gridPane.evaluate((el) => el.scrollLeft)).toBe(0);
  await gridPane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });

  await expect.poll(async () => gridPane.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  // The last configured column ('duration') is now reachable, where before it was clipped off
  // the right edge with no way to scroll to it.
  await expect(page.locator('#gantt .fg-col-header', { hasText: 'Duration' })).toBeInViewport();
});

// #139: the pane above only overflowed because the fixture sized all four columns by hand. A Grid
// column is fixed-width by default now, so the same four columns written as bare field names
// overflow the same 220px pane and reach the same horizontal scroller — the gap #139 reported.
test('grid columns overflow and scroll with no width authored anywhere (#139)', async ({ page }) => {
  await page.goto('/grid-scroll.html');
  await expect(page.locator('#gantt-default .fg-bar').first()).toBeVisible();

  const gridPane = page.locator('#gantt-default .fg-grid-pane');
  expect(await gridPane.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);

  // Every column keeps the width it was given rather than squeezing to fit the pane.
  const widths = await page
    .locator('#gantt-default .fg-col-header')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(widths).toEqual([240, 120, 120, 100]);

  await gridPane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect.poll(async () => gridPane.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('#gantt-default .fg-col-header', { hasText: 'Duration' })).toBeInViewport();
});

// #139: `flex` is the opt-out, and it still works — a flex column shrinks to whatever the fixed
// columns beside it leave, so the pane never gains a scrollbar it did not need.
test('a flex column shares the leftover room instead of forcing overflow (#139)', async ({ page }) => {
  await page.goto('/grid-scroll.html');
  await expect(page.locator('#gantt-flex .fg-bar').first()).toBeVisible();

  const gridPane = page.locator('#gantt-flex .fg-grid-pane');
  expect(await gridPane.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);

  const widths = await page
    .locator('#gantt-flex .fg-col-header')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  // A 220px pane holding one 120px fixed Start column: Name takes the 100px left over, and the two
  // together fill the pane exactly rather than overflowing it.
  expect(widths).toEqual([100, 120]);
});
