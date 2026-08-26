import { test, expect } from '@playwright/test';

// [S1-A1] (plans/s1.11-close-the-gate/README.md §6, D-S1.11-5): harness/large-dataset.html mounts
// 5,000 seeded entries at `zoom: 'preset'` (content wider than the pane). The DOM must hold a bounded
// number of rows the whole time, not 5,000 — and the visible id set must actually move on scroll, so
// a bound alone (nothing rendered) can't pass.

test('[S1-A1] only windowed rows exist in the DOM, and the row-id set moves after a scroll', async ({
  page,
}) => {
  await page.goto('/large-dataset.html');

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
  await expect.poll(async () => rows.count()).toBeGreaterThan(0);

  const afterCount = await rows.count();
  expect(afterCount).toBeLessThan(500);

  const idsAfter = await rows.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset['rowId']));
  expect(idsAfter).not.toEqual(idsBefore);
});
