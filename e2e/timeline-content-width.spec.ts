import { test, expect } from '@playwright/test';

// S1.12 bug, found during the handoff review: a coarse preset's boundary tick is one full calendar
// unit wide and can be many times wider than a dataset shorter than that unit. `.fg-header`
// had no width of its own and no clip, so that oversized tick leaked past `frame.contentWidth` and
// inflated the timeline pane's native `scrollWidth` — the pane looked like it never shrank back down
// on zoom-out. `harness/e2e/data.html`'s dataset (`demoEntryInputs.slice(0, 8)`, ~3 weeks) is shorter
// than every preset from `weekMonthYear` up, so it is the fixture that already carries this case.

test('[timeline-content-width] the pane never scrolls past contentWidth on a short dataset, at any preset', async ({
  page,
}) => {
  // dayPreset's minTickWidthPx rose from 32 to 96 in the header readability follow-up (finding 5),
  // so this ~19-day dataset's own initial ('day' preset) content width is now ~1824px — the default
  // 1280px viewport's timeline pane (~990px client width) sits below that floor before any zoom
  // click, which the test's own premise ("this dataset is short enough to never hit a floor") no
  // longer holds at that viewport. Widened so the pane's client width clears the floor with margin at
  // every preset this test walks through (measured directly against the running harness).
  await page.setViewportSize({ width: 2400, height: 1100 });
  await page.goto('/e2e/data.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  const zoomOutBtn = page.locator('button[aria-label="Zoom out"]');
  const zoomInBtn = page.locator('button[aria-label="Zoom in"]');

  async function assertNoOverscroll(): Promise<void> {
    const { scrollWidth, clientWidth } = await pane.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    // 'pane' fit (the default) fills the pane exactly for a dataset shorter than the coarsest
    // preset's tick unit — scrollWidth must never exceed clientWidth by more than rounding.
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  }

  await assertNoOverscroll();
  for (let i = 0; i < 6; i++) {
    await zoomOutBtn.click();
    await assertNoOverscroll();
  }
  for (let i = 0; i < 6; i++) {
    await zoomInBtn.click();
    await assertNoOverscroll();
  }
});

// #436: a zero-length entry parked on the range's own end floors its painted box at
// minBarWidthPx, centred on its own instant (barSpan, layout/frame.ts) — centred past
// contentWidth's own right edge, with nothing to shift it back, before this fix. At `fit: 'pane'`
// (the default), contentWidth === paneWidth by construction, so the pane's ScrollAxis computes a
// max of 0 and can never see the native scroll range that overhang opens — the two-Gantt desync
// `harness/e2e/scroll-sync.ts` never had a fixture to catch (see its own `fit: 'pane'` pair, added for
// this same issue).
test('[timeline-content-width] a zero-length entry at the range end never scrolls the pane past contentWidth (#436)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/e2e/entries-outside-the-range.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  const { scrollWidth, clientWidth } = await pane.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

// #436 (severe case): a Dataset wider than its own `range` — the normal shape for a caller
// prefetching so pan/zoom never re-fetches — used to paint entries the overscan buffer alone pulls
// past `contentWidth`'s own edge, with no bound of its own (`layout/frame.ts`'s `barSpan`, the
// 'exact' span path). `harness/e2e/entries-outside-the-range.html` carries both shapes: `straddling`
// (starts inside `range`, ends past it — trimmed, not dropped) and `out-after` (entirely past
// `range.end` — dropped outright, never a FrameBar).
test('[timeline-content-width] entries outside the dataset range never widen the pane past contentWidth (#436)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/e2e/entries-outside-the-range.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  // The wholly out-of-range entry never becomes a bar at all — nothing for a reader to click on
  // outside the range the caller asked to see. `data-bar-id` (not `data-entry-id`, which the row
  // still carries) is the bar's own identity (`dom-contract.ts`).
  await expect(page.locator('[data-bar-id^="out-after:"]')).toHaveCount(0);

  const pane = page.locator('.fg-timeline-pane');
  const { scrollWidth, clientWidth } = await pane.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
