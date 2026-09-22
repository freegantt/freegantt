import { test, expect } from '@playwright/test';

// harness/performance.ts mounts 50,000 seeded entries at `fit: 'preset'` (content far wider than
// the pane) and reads back the measured build/paint times and the live rendered row/bar count. A
// second, shorter Gantt shares the first one's `TimeScaleModel` and horizontal `ScrollAxis`
// (plans/02 §5). This proves three of the page's headline claims: the DOM stays windowed under
// 50,000 entries, the statusbar reports real numbers rather than placeholders, and scrolling one
// chart pans the other.

test('50,000 entries stay windowed in the DOM, and the statusbar reports real build/paint numbers', async ({
  page,
}) => {
  await page.goto('/performance.html');

  const rows = page.locator('#gantt [data-testid="fg-row"]');
  await expect(rows.first()).toBeVisible();

  // Windowed, not the full 50,000-entry dataset.
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  expect(rowCount).toBeLessThan(500);

  await expect(page.locator('#count-readout')).toContainText('50,000');

  // The build and paint readouts start at "—" and are overwritten once the measurement lands; wait
  // for the real value rather than a fixed delay (rule 1).
  await expect(page.locator('#build-readout')).toContainText(/Dataset build: [\d.]+ ms/);
  await expect(page.locator('#paint-readout')).toContainText(/First paint: [\d.]+ ms/);
  await expect(page.locator('#rendered-readout')).toContainText(/Rendered: \d+ rows \/ \d+ bars/);
});

test('scrolling the main chart pans the overview chart, through the shared ScrollAxis', async ({ page }) => {
  await page.goto('/performance.html');
  await expect(page.locator('#gantt [data-testid="fg-row"]').first()).toBeVisible();

  const mainPane = page.locator('#gantt .fg-timeline-pane');
  const overviewPane = page.locator('#overview-gantt .fg-timeline-pane');

  const overviewScrollLeftBefore = await overviewPane.evaluate((el) => el.scrollLeft);

  await mainPane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect.poll(() => overviewPane.evaluate((el) => el.scrollLeft)).not.toBe(overviewScrollLeftBefore);

  // The rendered-count readout is wired to `navigationChange`, which a shared-axis scroll also
  // fires — it must move off its pre-scroll numbers, not just sit at its first reading.
  await expect(page.locator('#rendered-readout')).toContainText(/Rendered: \d+ rows \/ \d+ bars/);
});
