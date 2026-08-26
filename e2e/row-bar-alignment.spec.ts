import { test, expect } from '@playwright/test';

// Regression: the base stylesheet gave `.fg-header`/`.fg-band` no explicit height. Their only
// children, `.fg-tick` elements, are `position: absolute` (view/styles.ts) — an absolutely
// positioned child does not contribute to its relatively positioned parent's auto height, so the
// header collapsed to near-zero in the timeline pane. The grid pane's spacer (view/pane-layout.ts,
// D-S1.8-11), meanwhile, still reserved a fixed `--fg-header-height` (fallback 20px). The two
// panes disagreed about how tall the header was, so every grid row sat well below its own bar —
// grid pane rows are the DOM's real geometry, and by the time bars appeared they had crept up
// under (and behind) the header instead of starting below it, matching the report that entries
// "don't align with entries on the left" and sit "high" enough to cover the timeline.
//
// A jsdom/happy-dom unit test cannot catch this: those environments never run CSS layout, so an
// element that collapses to zero height there behaves identically to one that doesn't. Only a
// real browser lays out `.fg-header`/`.fg-band`'s auto height from absolutely positioned children,
// so this has to be a Playwright test (see also e2e/harness.spec.ts's D1 test, same reasoning).
test('every grid pane row lines up with its own bar in the timeline pane (I9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const rows = page.locator('.fg-grid-pane .fg-row');
  const bars = page.locator('#gantt .fg-bar');

  const rowCount = await rows.count();
  const barCount = await bars.count();
  expect(rowCount).toBeGreaterThan(1);
  expect(rowCount).toBe(barCount);

  // Both panes are native page geometry at this point (no fixture ids hardcoded) — sort each set
  // top-to-bottom and pair them off positionally, exactly like `computeFrame` pairs a `FrameRow`
  // with its `FrameBar` by shared array index.
  const rowTops = (await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))).sort(
    (a, b) => a - b,
  );
  const barTops = (await bars.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))).sort(
    (a, b) => a - b,
  );

  // Sub-pixel rounding between the two panes' independent transforms is the only expected slop.
  const PIXEL_TOLERANCE = 1;
  for (let i = 0; i < rowTops.length; i++) {
    expect(Math.abs(rowTops[i]! - barTops[i]!)).toBeLessThanOrEqual(PIXEL_TOLERANCE);
  }
});

// Same defect, from the other direction: a collapsed header lets the first bar's top land above
// (or level with) the header's own bottom edge instead of strictly below it — "covering the
// timeline" from the report.
test('bars render below the header band, never under it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const headerBottom = await page.locator('.fg-header').evaluate((el) => el.getBoundingClientRect().bottom);
  const firstBarTop = await page
    .locator('#gantt .fg-bar')
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);

  expect(firstBarTop).toBeGreaterThanOrEqual(headerBottom);
});
