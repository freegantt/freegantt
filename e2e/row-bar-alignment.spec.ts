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
//
// `--fg-bar-height` (bar height): a bar no longer fills its row, it centres in it, so "lines up"
// no longer means "the same top" — it means the bar's top sits the row's top plus half the
// leftover between the row's height and the bar's own shorter height.
test('every grid pane row lines up with its own bar in the timeline pane, centred (I9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // Matched by entry id, not by sorted position/count: the row layer windows purely on vertical
  // scroll, but the bar layer also culls on the horizontal viewport (S1.12's density floor,
  // D-S1.12-2/3, can make fitDataset's content wider than the pane, so a visible row can
  // legitimately have no bar in view at the current scroll position at some viewport widths).
  // I9 only claims a row and its OWN entry's bar agree in y — not that every row has a bar.
  const pairs = await page.evaluate(() => {
    const rowTopByEntryId = new Map<string, { top: number; height: number }>();
    for (const row of Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'))) {
      const rowId = row.dataset['rowId'];
      const entryId = rowId;
      const box = row.getBoundingClientRect();
      if (entryId) rowTopByEntryId.set(entryId, { top: box.top, height: box.height });
    }
    const matched: Array<{
      entryId: string;
      rowTop: number;
      rowHeight: number;
      barTop: number;
      barHeight: number;
    }> = [];
    for (const bar of Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-bar'))) {
      const barId = bar.dataset['barId']; // "<entryId>:<segmentIndex>"
      const entryId = barId?.split(':')[0];
      const row = entryId ? rowTopByEntryId.get(entryId) : undefined;
      if (entryId && row !== undefined) {
        const barBox = bar.getBoundingClientRect();
        matched.push({
          entryId,
          rowTop: row.top,
          rowHeight: row.height,
          barTop: barBox.top,
          barHeight: barBox.height,
        });
      }
    }
    return matched;
  });

  expect(pairs.length).toBeGreaterThan(1);
  // Sub-pixel rounding between the two panes' independent transforms is the only expected slop.
  const PIXEL_TOLERANCE = 1;
  for (const { entryId, rowTop, rowHeight, barTop, barHeight } of pairs) {
    const expectedBarTop = rowTop + (rowHeight - barHeight) / 2;
    expect(
      Math.abs(expectedBarTop - barTop),
      `entry ${entryId}: bar top must centre inside its row's band`,
    ).toBeLessThanOrEqual(PIXEL_TOLERANCE);
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
