import { test, expect } from '@playwright/test';

test.describe('theme (system dark)', () => {
  test.use({ colorScheme: 'dark' });

  test('Light pins the Gantt pane to the light tokens, Dark pins the dark tokens', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('freegantt-harness-theme'));
    await page.goto('/');
    const bar = page.locator('#gantt .fg-bar:not(.fg-bar-bracket):not(.fg-bar-diamond)').first();
    await expect(bar).toBeVisible();

    const pane = page.locator('#gantt .fg-timeline-pane');
    const rowLabel = page.locator('#gantt .fg-grid-pane .fg-row-label').first();

    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'light');
    await expect
      .poll(async () => pane.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(255, 255, 255)');
    await expect
      .poll(async () => rowLabel.evaluate((el) => getComputedStyle(el).color))
      .toBe('rgb(22, 25, 31)');

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'dark');
    await expect
      .poll(async () => pane.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(23, 27, 34)');
    await expect
      .poll(async () => rowLabel.evaluate((el) => getComputedStyle(el).color))
      .toBe('rgb(232, 236, 243)');
    await expect.poll(async () => bar.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(16, 19, 26)');
  });
});
