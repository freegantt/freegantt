import { test, expect } from '@playwright/test';

// The planner page is the ported design. What is worth pinning is not that it looks right — a
// screenshot would do that badly — but the three claims it exists to make:
//
//   1. Colour is tokens. A bar's phase hue moves between themes with no script re-deriving it.
//   2. A cell the design draws as a picture is a `columnRenderer`, and it paints real nodes.
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
  // core's own `summary` variant matches a row with children and paints this class (ADR 0018).
  await expect(page.locator('#gantt .fg-bar-summary').first()).toBeVisible();
  // A checkpoint is a diamond, and `diamond()` is core's own shipped glyph (ADR 0022): this page
  // states only which rows wear one, and `diamond()`'s own `css` paints the glyph on `::before`.
  await expect(page.locator('#gantt .fg-bar.fg-bar-diamond').first()).toBeVisible();

  // The Done cell is core's meter: the graphic is hidden from AT, and the formatted text beside it
  // carries the value once. Never a progressbar, and never a labelled img that restates the number.
  const meter = page.locator('.fg-meter-track').first();
  await expect(meter).toHaveAttribute('aria-hidden', 'true');
  await expect(meter).not.toHaveAttribute('role');
  await expect(page.locator('#gantt [role="progressbar"]')).toHaveCount(0);

  // A phase row rolls its children's progress up, duration-weighted, through a named Aggregator.
  const phaseDone = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('#gantt .fg-row[data-entry-id="pre-construction"]');
    return row?.querySelector('.fg-meter-text')?.textContent;
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

// #436 follow-up: the bar clip is the library's own label's, so it must not reach a bar whose
// content a `barRenderer` owns. This page is that case — `phaseBar` emits its own
// `.demo-bar-label-outside` child at `left: 100%` (harness/planner.html), and a renderer-owned bar
// carries no `data-label` at all (`ownsContent` ⇒ no token, render/dom/index.ts), so the
// `[data-label='outside']` escape hatch can never reach it. A clip on `.fg-bar` itself swallowed
// these labels whole. Same paint-tree query as the #325 test in e2e/grid-scroll.spec.ts, and for
// the same reason: the element keeps correct text and a correct box while clipped, so `toBeVisible`
// and `getBoundingClientRect` both report a healthy label either way.
//
// Two details this page adds over #325's. The demo label is `pointer-events: none`
// (harness/planner.html), which drops it out of `elementFromPoint` whether it paints or not, so the
// probe opts it back in for the one call and restores it. And the second half asserts the negative:
// with the old clip put back by hand, the same probe must report the label gone. Without that, a
// probe broken in any other way would report this test green forever.
test('a barRenderer that places a child outside the bar is not clipped by the library (#436)', async ({
  page,
}) => {
  await page.goto('/planner.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const outsideLabel = page.locator('#gantt .demo-bar-label-outside').first();
  expect(await page.locator('#gantt .demo-bar-label-outside').count()).toBeGreaterThan(0);

  const isPaintedAtItsOwnBox = (clipTheBar: boolean) =>
    outsideLabel.evaluate((label, clip: boolean) => {
      const bar = label.closest('.fg-bar') as HTMLElement;
      // A renderer-owned bar is exactly the case with no token to hang an escape hatch on.
      if (bar.dataset['label'] !== undefined) throw new Error('expected a bar with no data-label');
      if (clip) bar.style.overflow = 'hidden';
      (label as HTMLElement).style.pointerEvents = 'auto';
      const rect = label.getBoundingClientRect();
      const atPoint = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      (label as HTMLElement).style.pointerEvents = '';
      bar.style.overflow = '';
      return atPoint !== null && label.contains(atPoint);
    }, clipTheBar);

  await expect.poll(() => isPaintedAtItsOwnBox(false)).toBe(true);
  await expect.poll(() => isPaintedAtItsOwnBox(true)).toBe(false);
});
