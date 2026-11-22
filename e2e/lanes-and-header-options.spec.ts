import { test, expect, type Page } from '@playwright/test';

// Row height, Lanes, the header tick renderer, tick lines and the today column are live options.
// A unit test proves the frame geometry. This spec proves a real browser paints it.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

async function openPage(page: Page): Promise<void> {
  await page.goto('/hierarchy-and-timeline.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
}

const firstRowBandHeight = (page: Page): Promise<number> =>
  page
    .locator('#gantt .fg-row-band')
    .first()
    .evaluate((band) => band.getBoundingClientRect().height);

test('a rowHeight resolver sets the height of every row', async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    window.__gantt.rowHeight = () => 44;
  });
  await expect.poll(() => firstRowBandHeight(page)).toBe(44);
});

test('lanes make a row as tall as its lanes, and draw one guide per lane', async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    window.__gantt.lanes = { count: () => 2, of: () => 1 };
  });
  // 10 padding + 30 lane + 6 gap + 30 lane + 10 padding, from the default lane tokens.
  await expect.poll(() => firstRowBandHeight(page)).toBe(86);
  const guides = page.locator('#gantt .fg-row-band').first().locator('.fg-lane');
  await expect(guides).toHaveCount(2);
});

test('a bar sits in the lane its rule names', async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    window.__gantt.lanes = { count: () => 2, of: () => 1 };
  });
  const guides = page.locator('#gantt .fg-row-band').first().locator('.fg-lane');
  await expect(guides).toHaveCount(2);
  const secondLane = (await guides.nth(1).boundingBox())!;
  const bar = (await page.locator('#gantt .fg-bar').first().boundingBox())!;
  expect(bar.y).toBeCloseTo(secondLane.y, 0);
  expect(bar.height).toBeCloseTo(secondLane.height, 0);
});

test('a header tick renderer paints its own content and stamps its flags', async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    window.__gantt.headerTickRenderer = () => ({ content: { tag: 'span', text: 'T' }, flags: ['marked'] });
  });
  const marked = page.locator('#gantt .fg-tick[data-flag~="marked"]');
  await expect(marked.first()).toBeVisible();
  await expect(marked.first()).toHaveText('T');
});

test('tickLines none draws no tick line', async ({ page }) => {
  await openPage(page);
  await expect(page.locator('#gantt .fg-tick-line').first()).toBeAttached();
  await page.evaluate(() => {
    window.__gantt.tickLines = 'none';
  });
  await expect(page.locator('#gantt .fg-tick-line')).toHaveCount(0);
});

test('the today column paints after every other band under the bars', async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    window.__gantt.todayLine = '2026-03-04T12:00:00Z';
    window.__gantt.todayColumn = true;
  });
  await expect(page.locator('#gantt .fg-today-column')).toHaveCount(1);
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#gantt .fg-decorations-under > .fg-range-band')).map((band) =>
      band.classList.contains('fg-today-column') ? 'today' : 'other',
    ),
  );
  expect(order.at(-1)).toBe('today');
});
