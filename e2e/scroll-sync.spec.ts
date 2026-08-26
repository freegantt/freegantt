import { test, expect } from '@playwright/test';

// S1.5 README §7: the two cases happy-dom cannot express, because there `scrollTop` is a plain
// property that neither clamps nor fires an event — so both checks pass vacuously in
// src/view/scroll-attachment.test.ts. harness/scroll-sync.html mounts two Gantts sharing one
// ScrollModel: #tall has every fixture entry, #short has the first 20 (fewer rows -> a smaller max).
//
// The timeline pane is the native scroller (S1.8, D-D/D-S1.8-1) — `#tall`/`#short` themselves no
// longer scroll, so every read/write below targets each container's `.fg-timeline-pane` child.

async function scrollTops(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    tall: document.querySelector('#tall .fg-timeline-pane')!.scrollTop,
    short: document.querySelector('#short .fg-timeline-pane')!.scrollTop,
  }));
}

test('a model-driven write does not feed back into another panTo (echo case, D-S1.5-6)', async ({ page }) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#tall .fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = 150;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await scrollTops(page)).tall).toBeGreaterThan(0);
  const first = await scrollTops(page);
  // #short has plenty of headroom at 150 (its own max is well over that), so it tracks exactly.
  expect(first.short).toBe(first.tall);

  // If the model-driven write into #short's element fed back into another panTo, the shared
  // position would keep nudging every settle tick. Poll for a few ticks and confirm it never
  // moves again after settling once.
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(await scrollTops(page)).toEqual(first);
  }
});

test('a shorter chart pins at its own max while the taller one keeps going, and resumes (U3)', async ({
  page,
}) => {
  await page.goto('/scroll-sync.html');
  await expect(page.locator('#tall .fg-bar').first()).toBeVisible();

  const shortMax = await page.evaluate(() => {
    const el = document.querySelector('#short .fg-timeline-pane')!;
    return el.scrollHeight - el.clientHeight;
  });
  expect(shortMax).toBeGreaterThan(0);

  // Scroll #tall far past #short's max.
  await page.evaluate(() => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = 100_000;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await scrollTops(page)).short).toBe(shortMax);
  const pinned = await scrollTops(page);
  expect(pinned.tall).toBeGreaterThan(pinned.short);

  // Scroll back to a point under #short's max: it resumes tracking with zero remembered state.
  const resumeAt = Math.floor(shortMax / 2);
  await page.evaluate((y) => {
    const el = document.querySelector('#tall .fg-timeline-pane')!;
    el.scrollTop = y;
    el.dispatchEvent(new Event('scroll'));
  }, resumeAt);
  await expect.poll(async () => (await scrollTops(page)).short).toBe(resumeAt);
  const resumed = await scrollTops(page);
  expect(resumed.tall).toBe(resumeAt);
});
