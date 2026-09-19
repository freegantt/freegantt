import { test, expect } from '@playwright/test';

// Pass-2 branch review (#435 follow-up): `e2e/large-dataset.spec.ts` proves the row layer stays
// windowed under 5,000 one-bar-each rows, and `e2e/bar-label-fit.spec.ts` proves a too-narrow
// `insideOrNone` bar paints (or hides) its label correctly — but neither proves the *bar* layer
// stays windowed when one row carries many bars, the #435 shape this branch made each bar costlier
// for (`render/dom/index.ts`'s `BarLabelToken`, which mounts a hidden `.fg-bar-label` child per
// too-narrow tile). `harness/dense-tile-grid.ts` is 50 rows of 250 day-tiles apiece — both axes far
// bigger than the pane — under `barLabels: 'insideOrNone'`.
//
// Bound derivation: an app author has no public way to read or set the render window's overscan.
// `GanttOptions` (`src/api/gantt.ts`) carries no `overscan` key; `GanttShellOptions.overscan`
// (`src/view/gantt-shell.ts:286`) is one layer further in and unreachable from here — a real gap,
// reported alongside this test rather than papered over. So the bound below does not restate that
// private slack; it measures the pane's own rendered size and the harness page's own tile/row size
// for the *exact* visible slice, then adds a fixed, generous, additive headroom — extra tiles and
// extra rows beyond the edge, the same shape overscan itself takes, not a multiple of the visible
// count — to cover whatever overscan the engine happens to keep. `layout/frame.ts`'s shipped
// default is 128px / 2 rows; the headroom here is several times that, so it stays well clear of the
// real value while remaining far tighter than either "one axis renders unwindowed" scenario below.
test('bar count stays windowed on both axes under a dense tile grid, and the visible set moves on scroll (#435 follow-up)', async ({
  page,
}) => {
  await page.goto('/dense-tile-grid.html');

  const bars = page.locator('[data-testid="fg-bar"]');
  await expect(bars.first()).toBeVisible();

  const geometry = await page.evaluate(() => {
    const pane = document.querySelector('.fg-timeline-pane')!;
    const row = document.querySelector<HTMLElement>('[data-testid="fg-row"]')!;
    return {
      paneWidth: pane.clientWidth,
      paneHeight: pane.clientHeight,
      rowHeightPx: row.getBoundingClientRect().height,
      tileWidthPx: window.__tileWidthPx,
      rowCount: window.__rowCount,
      tilesPerRow: window.__tilesPerRow,
    };
  });

  // The exact visible slice, with no slack: how many whole-or-partial tiles fit the pane's measured
  // width, and how many whole-or-partial rows fit its measured height.
  const visibleTiles = Math.ceil(geometry.paneWidth / geometry.tileWidthPx) + 1;
  const visibleRows = Math.ceil(geometry.paneHeight / geometry.rowHeightPx) + 1;

  // Additive headroom, well above the shipped 128px / 2-row default (see file comment): 40 tiles
  // and 10 rows beyond the exact visible slice, on top of it, in each axis.
  const TILE_HEADROOM = 40;
  const ROW_HEADROOM = 10;
  const boundedCount = (visibleTiles + TILE_HEADROOM) * (visibleRows + ROW_HEADROOM);

  // The bound must actually bind: comfortably under the full dataset, and under either axis
  // rendering unwindowed on its own — every tile of every row (vertical culling intact, horizontal
  // broken, confined to one screenful of rows) or every row rendering its full tile count (vertical
  // culling broken, horizontal intact) both clear it by a wide margin.
  expect(boundedCount).toBeLessThan(geometry.rowCount * geometry.tilesPerRow);
  expect(boundedCount).toBeLessThan(visibleRows * geometry.tilesPerRow);
  expect(boundedCount).toBeLessThan(geometry.rowCount * visibleTiles);

  const idsOf = () => bars.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['barId']));

  const initialCount = await bars.count();
  expect(initialCount).toBeGreaterThan(0);
  expect(initialCount).toBeLessThan(boundedCount);
  const idsAtStart = await idsOf();

  const pane = page.locator('.fg-timeline-pane');

  // Horizontal: scroll to the far right, past many screenfuls of tiles. A reconciler that leaves
  // stale bar nodes behind would grow past `boundedCount`, not just show a different id set.
  await pane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(idsOf).not.toEqual(idsAtStart);
  const idsAfterHorizontalScroll = await idsOf();
  expect(await bars.count()).toBeLessThan(boundedCount);

  // Vertical: scroll to the last row. Re-asserting the bound here, not just after the first scroll,
  // is what catches an accumulating reconciler rather than a one-off over-render.
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(idsOf).not.toEqual(idsAfterHorizontalScroll);
  expect(await bars.count()).toBeLessThan(boundedCount);
});
