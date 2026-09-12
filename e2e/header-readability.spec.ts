import { test, expect } from '@playwright/test';

// e2e coverage for the S1.12 header readability follow-up
// (plans/s1.12-timeline-navigation/header-readability-followup.md, "Not done — pick up here"):
// findings 2-5 were fixed but shipped with no e2e regression test. Follows e2e/zoom.spec.ts's
// pattern — `window.__gantt` on harness/zoom.html, driven with `page.evaluate`.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

// A `preset`/scroll change schedules its redraw on the next animation frame (view/frame-scheduler.ts,
// the single rAF owner) rather than patching the DOM synchronously — reading geometry before that
// frame runs sees stale nodes. Two round trips covers a change made from inside a rAF callback too.
async function waitForNextFrame(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

test('[finding 3] a coarse band tick stays inside the pane even when its own boundary is scrolled past', async ({
  page,
}) => {
  await page.goto('/zoom.html');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  // Switches to the multi-year dataset (~3 years) so weekMonthYear's year band has more than one
  // boundary, then to weekMonthYear itself (coarsest band = year) and scrolls deep into the
  // dataset — the visible year tick's own left boundary (Jan 1) is now off-screen to the left,
  // which is exactly the "year never renders" symptom finding 3 fixed.
  await page.locator('input[name="dataset"][value="multi-year"]').check();
  await expect(bar).toBeVisible();
  await waitForNextFrame(page);
  await page.evaluate(() => {
    window.__gantt.preset = 'weekMonthYear';
  });
  await waitForNextFrame(page);
  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth / 2;
  });
  await waitForNextFrame(page);

  const yearBand = page.locator('.fg-header .fg-band').first();
  const yearTick = yearBand.locator('.fg-tick').first();
  await expect(yearTick).toBeVisible();
  await expect(yearTick).not.toHaveText('');

  const paneBox = await pane.boundingBox();
  const tickBox = await yearTick.boundingBox();
  if (!paneBox || !tickBox) throw new Error('missing bounding box');

  // The regression this guards: the old code positioned the label at the tick's true (possibly
  // off-screen) x unconditionally, so it painted left of the pane's own visible/clipped edge.
  expect(tickBox.x).toBeGreaterThanOrEqual(paneBox.x - 1);
  expect(tickBox.x).toBeLessThan(paneBox.x + paneBox.width);
});

test('[finding 2] a finer band never repeats the year/month a coarser band already shows', async ({
  page,
}) => {
  await page.goto('/zoom.html');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.preset = 'weekAndMonth';
  });
  await waitForNextFrame(page);

  const bands = page.locator('.fg-header .fg-band');
  await expect(bands).toHaveCount(2);

  const monthTickText = await bands.nth(0).locator('.fg-tick').first().textContent();
  expect(monthTickText).toBeTruthy();
  // "Sep 2026" — pull out the 4-digit year and the 3-letter month the month band states.
  const year = monthTickText!.match(/\d{4}/)?.[0];
  const month = monthTickText!.match(/[A-Za-z]{3,}/)?.[0];
  expect(year).toBeTruthy();
  expect(month).toBeTruthy();

  const weekTickText = await bands.nth(1).locator('.fg-tick').first().textContent();
  expect(weekTickText).toBeTruthy();
  expect(weekTickText).not.toContain(year!);
  expect(weekTickText).not.toContain(month!);
});

test('[finding 4] hourPreset never zero-pads a single-digit hour', async ({ page }) => {
  await page.goto('/zoom.html');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.preset = 'hour';
  });
  await waitForNextFrame(page);

  const hourTicks = page.locator('.fg-header .fg-band').first().locator('.fg-tick');
  const texts = await hourTicks.allTextContents();
  expect(texts.length).toBeGreaterThan(0);

  for (const text of texts) {
    // "9:00", never "09:00" — a leading zero before the hour is exactly what D-S1.12's `en-US`
    // CLDR bug produced (finding 4).
    expect(text).toMatch(/^\d{1,2}:\d{2}$/);
    expect(text).not.toMatch(/^0\d:/);
  }
});

test("[finding 5] adjacent tick cells never overlap at a preset's own minTickWidthPx floor", async ({
  page,
}) => {
  await page.goto('/zoom.html');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  // dayWeekMonth's finest (day) band has the tightest shipped floor (28px, per the follow-up doc's
  // finding 5) — the tightest place two neighbouring ticks would collide if the floor regressed.
  await page.evaluate(() => {
    window.__gantt.preset = 'dayWeekMonth';
  });
  await waitForNextFrame(page);

  const dayBand = page.locator('.fg-header .fg-band').last();
  const dayTicks = dayBand.locator('.fg-tick');
  await expect(dayTicks.first()).toBeVisible();
  const count = await dayTicks.count();
  expect(count).toBeGreaterThan(2);

  // Read boxes one at a time, not via Promise.all: a frame boundary between reads can otherwise
  // race a re-render and hand back a stale/detached node.
  const boxes: ({ x: number; width: number } | null)[] = [];
  for (let i = 0; i < count; i++) {
    boxes.push(await dayTicks.nth(i).boundingBox());
  }

  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1];
    const curr = boxes[i];
    if (!prev || !curr) throw new Error('missing bounding box');
    // Each tick's own left edge must be at or past the previous tick's right edge — any overlap
    // means one label's box bled into its neighbour's, the exact "impossible to read" symptom.
    expect(curr.x).toBeGreaterThanOrEqual(prev.x + prev.width - 1);
  }
});
