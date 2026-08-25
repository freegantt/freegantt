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

// Regression (found while chasing the report above): PaneLayout applied both `overflow: hidden`
// and the follow-scroll `translateY` (D-S1.8-1) to the same row-layer element. A CSS transform
// moves an element's painted position but NOT the coordinate space its own `overflow: hidden`
// clips against (that clip is fixed to the element's local, pre-transform box) — so once scrolled
// far enough, every row's local offset fell outside that local clip window and got painted as
// nothing, even though the row nodes were still in the DOM with correct text and correct
// `getBoundingClientRect()` geometry. Neither `toBeVisible()` nor a `getBoundingClientRect()`
// overlap check catches this: both report the element's geometry, not whether a pixel of it is
// actually painted on screen. `elementFromPoint` is the one query that consults the paint tree, so
// it is the only reliable way to assert a row is truly visible, not just correctly positioned.
test('grid pane rows are actually painted after scrolling, not just correctly positioned (#regression)', async ({
  page,
}) => {
  await page.goto('/');

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.fg-grid-pane .fg-row').first()).toBeVisible();

  // The last dataset entry ('Sprint 2', fixtures/sample-project.ts) must be the one scrolled into
  // view, and a hit-test inside it must land on that same row element — proof it is really painted
  // there, not clipped away by an ancestor whose clip window rode off with the transform. The hit
  // point is the middle of the row's overlap with the grid pane's own box, not the row's own
  // center: `scrollTop = scrollHeight` can leave the last row only partly inside the pane, and its
  // own center would then legitimately fall in the clipped-off sliver — a false failure that has
  // nothing to do with this regression.
  const hit = await page.evaluate(() => {
    const gridPane = document.querySelector('.fg-grid-pane')!;
    const gridPaneRect = gridPane.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'));
    const sprintTwo = rows.find((row) => row.textContent === 'Sprint 2');
    if (!sprintTwo) return { found: false as const };
    const rect = sprintTwo.getBoundingClientRect();
    const top = Math.max(rect.top, gridPaneRect.top);
    const bottom = Math.min(rect.bottom, gridPaneRect.bottom);
    if (bottom <= top) return { found: true as const, overlapsPane: false as const, isSameElement: false };
    const cx = rect.x + rect.width / 2;
    const cy = (top + bottom) / 2;
    const atPoint = document.elementFromPoint(cx, cy);
    return { found: true as const, overlapsPane: true as const, isSameElement: atPoint === sprintTwo };
  });

  expect(hit.found).toBe(true);
  expect(hit.overlapsPane).toBe(true);
  expect(hit.isSameElement).toBe(true);
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
