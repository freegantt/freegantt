import { test, expect } from '@playwright/test';

// The reported bug: the timeline pane's zebra did not line up with the grid pane's, and in dark mode
// the timeline showed no zebra at all. The grid pane striped with `:nth-child`, which counts only the
// windowed rows, so the stripes slid one row out of phase as soon as the pane scrolled; the timeline
// pane had no zebra of its own at all and only a consumer plugin painted one.
//
// Only a real browser proves this: jsdom runs no CSS layout, so it neither windows rows by pixel
// height nor resolves `background-color` from the theme tokens (same reasoning as
// e2e/row-bar-alignment.spec.ts).

async function stripeByRowId(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const paint = (el: HTMLElement): string => getComputedStyle(el).backgroundColor;
    const grid = new Map<string, { parity: string; paint: string }>();
    for (const row of Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'))) {
      const id = row.dataset['rowId'];
      if (id !== undefined) grid.set(id, { parity: row.dataset['parity'] ?? '', paint: paint(row) });
    }
    const timeline = new Map<string, { parity: string; paint: string }>();
    for (const band of Array.from(document.querySelectorAll<HTMLElement>('.fg-timeline-pane .fg-row-band'))) {
      const id = band.dataset['rowId'];
      if (id !== undefined) timeline.set(id, { parity: band.dataset['parity'] ?? '', paint: paint(band) });
    }
    return { grid: Object.fromEntries(grid), timeline: Object.fromEntries(timeline) };
  });
}

test('both panes stripe the same rows, before and after a scroll', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();

  const atTop = await stripeByRowId(page);
  expect(Object.keys(atTop.grid).length).toBeGreaterThan(1);
  expect(atTop.timeline).toEqual(atTop.grid);
  expect(new Set(Object.values(atTop.grid).map((row) => row.parity))).toEqual(new Set(['odd', 'even']));

  const pane = page.locator('#gantt .fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  const scrolled = await stripeByRowId(page);
  expect(scrolled.timeline).toEqual(scrolled.grid);
  // The phase survives the scroll: a row that was odd at the top is still odd once it has moved.
  for (const [rowId, row] of Object.entries(scrolled.grid)) {
    const before = atTop.grid[rowId];
    if (before !== undefined) expect(row.parity).toBe(before.parity);
  }
});

test('the timeline zebra paints in dark mode, in the same colour as the grid', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-fg-theme', 'dark');

  const striped = await page.evaluate(() => {
    const band = document.querySelector<HTMLElement>('.fg-timeline-pane .fg-row-band[data-parity="odd"]');
    const row = document.querySelector<HTMLElement>('.fg-grid-pane .fg-row[data-parity="odd"]');
    if (!band || !row) throw new Error('no odd row painted');
    return {
      band: getComputedStyle(band).backgroundColor,
      row: getComputedStyle(row).backgroundColor,
    };
  });
  expect(striped.band).toBe(striped.row);
  // The dark theme's --fg-row-odd-bg — a stripe lighter than the pane it sits on (#1B1D22), not
  // the light theme's darker one, which is what left the timeline looking unstriped in dark mode.
  expect(striped.band).toBe('rgb(32, 35, 42)');
});

test('the last row scrolls fully into view — the pane scrolls its header as well as its rows', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();

  const pane = page.locator('#gantt .fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  const overshoot = await pane.evaluate((el) => {
    const bands = Array.from(el.querySelectorAll<HTMLElement>('.fg-row-band'));
    const last = bands[bands.length - 1];
    if (!last) throw new Error('no row bands painted');
    return last.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom;
  });
  expect(overshoot).toBeLessThanOrEqual(1);
});
