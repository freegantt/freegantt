import { test, expect } from '@playwright/test';

// The planner page is the ported design. What is worth pinning is not that it looks right — a
// screenshot would do that badly — but the three claims it exists to make:
//
//   1. Colour is tokens. A bar's phase hue moves between themes with no script re-deriving it.
//   2. A cell the design draws as a picture is a `cellRenderer`, and it paints real nodes.
//   3. A theme the library never heard of is a consumer class over `--fg-*` alone.
//
// Only a real browser answers any of them: jsdom resolves no custom property and runs no CSS.

async function paint(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const spanBar = document.querySelector<HTMLElement>(
      '#gantt .fg-bar:not(.fg-bar-summary):not(.fg-bar-diamond)',
    )!;
    return {
      bar: getComputedStyle(spanBar).backgroundColor,
      pane: getComputedStyle(document.querySelector('#gantt .fg-timeline-pane')!).backgroundColor,
      avatar: getComputedStyle(document.querySelector('.demo-avatar')!).backgroundColor,
      // The toolbar sits above the Gantt, outside `.fg-container`, and paints from the same tokens.
      toolbar: getComputedStyle(document.querySelector('#toolbar .demo-toolbar-row')!).backgroundColor,
    };
  });
}

test('the design is tokens: one page, three themes, no re-derived colour', async ({ page }) => {
  await page.goto('/planner.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const light = await paint(page);
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'dark');
  const dark = await paint(page);

  // The bar and the avatar carry the same phase hue, and both follow the theme — the avatar is a
  // cell renderer and the bar is a bar renderer, and neither computes a colour.
  expect(light.avatar).toBe(light.bar);
  expect(dark.avatar).toBe(dark.bar);
  expect(dark.bar).not.toBe(light.bar);
  expect(dark.pane).not.toBe(light.pane);
  // The page's own chrome follows the theme too. The toolbar reads `--fg-*` and lives outside
  // `.fg-container`, so it only follows while the token blocks select on the pin alone.
  expect(light.toolbar).toBe(light.pane);
  expect(dark.toolbar).toBe(dark.pane);

  // Paper is not a library theme. It rides on top of Light as a class the page defines, and it
  // repaints the Gantt without `data-fg-theme` moving off 'light'.
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Paper' }).click();
  const paper = await paint(page);
  await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'light');
  expect(paper.pane).not.toBe(light.pane);
  expect(paper.bar).not.toBe(light.bar);
  expect(paper.toolbar).toBe(paper.pane);
});

test('the cells the design draws as pictures are real rendered nodes', async ({ page }) => {
  await page.goto('/planner.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // A phase is a group bracket: the library's own shape, reached by structure alone (ADR 0013 —
  // core's own `summary` variant claims a row with children and paints this class (ADR 0018).
  await expect(page.locator('#gantt .fg-bar-summary').first()).toBeVisible();
  // A checkpoint is a diamond, and `diamond()` is core's own shipped glyph (ADR 0022): this page
  // states only which rows wear one, and `diamond()`'s own `css` paints the glyph on `::before`.
  await expect(page.locator('#gantt .fg-bar.fg-bar-diamond').first()).toBeVisible();

  // The progress meter is described, not two anonymous divs.
  const meter = page.locator('.demo-progress-track').first();
  await expect(meter).toHaveAttribute('role', 'img');
  await expect(meter).toHaveAttribute('aria-label', /complete$/);

  // A phase row rolls its children's progress up, duration-weighted, through a named Aggregator.
  const phaseDone = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('#gantt .fg-row[data-entry-id="pre-construction"]');
    return row?.querySelector('.demo-progress-text')?.textContent;
  });
  expect(phaseDone).toBe('100%');
});

test('the checkpoint diamond paints transparent and holds its box width across a zoom step', async ({
  page,
}) => {
  // `toBeVisible()` alone is what let the original defect ship (this file, formerly line 67): a
  // checkpoint that grew with the timescale still reported "visible". This test asserts the two
  // properties that would have gone red — a computed style, and a measured box across a real zoom
  // step driven through the toolbar (`harness/planner-toolbar.ts`'s Zoom in button), not a
  // hand-built `TimeScaleModel`.
  await page.goto('/planner.html');
  const checkpoint = page.locator('#gantt .fg-bar.fg-bar-diamond').first();
  await expect(checkpoint).toBeVisible();

  // The element's own background stays transparent — the diamond's ink is its `::before`, not the
  // element's box (ADR 0022, `DIAMOND_CSS`: `.fg-bar-diamond { background: transparent; }`).
  await expect(checkpoint).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const widthAtDefaultZoom = await checkpoint.evaluate((el) => el.getBoundingClientRect().width);

  await page.locator('button[aria-label="Zoom in"]').click();
  await expect(checkpoint).toBeVisible();
  const widthAfterZoomIn = await checkpoint.evaluate((el) => el.getBoundingClientRect().width);

  expect(widthAfterZoomIn).toBe(widthAtDefaultZoom);
});

test('the new-task button says it is not wired rather than doing half a job', async ({ page }) => {
  await page.goto('/planner.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await page.locator('#gantt .fg-row').count();
  await page.getByRole('button', { name: '+ New task' }).click();
  await expect(page.locator('#readout')).toContainText('not wired up yet');
  expect(await page.locator('#gantt .fg-row').count()).toBe(before);
});
