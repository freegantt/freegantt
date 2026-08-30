import { test, expect } from '@playwright/test';

// S1.12 bug, found during the handoff review: a coarse preset's boundary tick is one full calendar
// unit wide (D-S1.7-4) and can be many times wider than a dataset shorter than that unit. `.fg-header`
// had no width of its own and no clip, so that oversized tick leaked past `frame.contentWidth` and
// inflated the timeline pane's native `scrollWidth` — the pane looked like it never shrank back down
// on zoom-out. `harness/data.html`'s dataset (`demoEntryInputs.slice(0, 8)`, ~3 weeks) is shorter
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
  await page.goto('/data.html');
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
