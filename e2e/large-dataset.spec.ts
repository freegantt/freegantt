import { test, expect } from '@playwright/test';

// [S1-A1] (plans/s1.11-close-the-gate/README.md §6, D-S1.11-5): harness/e2e/large-dataset.html mounts
// 5,000 seeded entries at `zoom: 'preset'` (content wider than the pane). The DOM must hold a bounded
// number of rows the whole time, not 5,000 — and the visible id set must actually move on scroll, so
// a bound alone (nothing rendered) can't pass.

test('[S1-A1] only windowed rows exist in the DOM, and the row-id set moves after a scroll', async ({
  page,
}) => {
  await page.goto('/e2e/large-dataset.html');

  const rows = page.locator('[data-testid="fg-row"]');
  await expect(rows.first()).toBeVisible();

  const initialCount = await rows.count();
  expect(initialCount).toBeGreaterThan(0);
  // Bounded by window + overscan, nowhere near the full 5,000-entry dataset.
  expect(initialCount).toBeLessThan(500);

  const idsBefore = await rows.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['rowId']));

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  const currentIds = () => rows.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['rowId']));

  // Poll the actual thing under test, not a proxy: `rows.count() > 0` is already true before the
  // scroll, since rows already exist — it proves nothing about whether the windowed id set has
  // caught up. The re-render runs through FrameScheduler's rAF coalescing (S1.12), so the DOM can
  // still hold the pre-scroll id set for a frame or two after the `scroll` event returns.
  await expect.poll(currentIds).not.toEqual(idsBefore);

  const afterCount = await rows.count();
  expect(afterCount).toBeLessThan(500);
  expect(await currentIds()).not.toEqual(idsBefore);
});
