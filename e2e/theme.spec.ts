import { test, expect } from '@playwright/test';

test.describe('theme (system dark)', () => {
  test.use({ colorScheme: 'dark' });

  test('Light pins the Gantt pane to the light tokens, Dark pins the dark tokens', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('freegantt-harness-theme'));
    await page.goto('/generic.html');
    const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary):not(.fg-bar-diamond)').first();
    await expect(bar).toBeVisible();

    const pane = page.locator('#gantt .fg-timeline-pane');
    const rowLabel = page.locator('#gantt .fg-grid-pane .fg-row-label').first();

    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-fg-theme', 'light');
    await expect
      .poll(async () => pane.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(255, 255, 255)');
    await expect
      .poll(async () => rowLabel.evaluate((el) => getComputedStyle(el).color))
      .toBe('rgb(26, 24, 21)');

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-fg-theme', 'dark');
    await expect
      .poll(async () => pane.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(27, 29, 34)');
    await expect
      .poll(async () => rowLabel.evaluate((el) => getComputedStyle(el).color))
      .toBe('rgb(236, 234, 227)');
    await expect.poll(async () => bar.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(22, 24, 29)');
  });

  // The page around the Gantt paints from the same `--fg-*` tokens (harness-chrome.css), so it can
  // never sit light while the chart is dark. The Gantt stays on 'auto' and reads the page's pin.
  test('the page chrome and the Gantt follow one theme', async ({ page }) => {
    await page.goto('/generic.html');
    await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

    const chrome = () =>
      page.evaluate(() => ({
        pageInk: getComputedStyle(document.querySelector('.page-head h1')!).color,
        rowInk: getComputedStyle(document.querySelector('#gantt .fg-row-label')!).color,
        ganttTheme: window.__gantt.resolvedTheme,
      }));

    for (const theme of ['Light', 'Dark', 'Paper'] as const) {
      await page.getByRole('button', { name: theme, exact: true }).click();
      const read = await chrome();
      expect(read.pageInk, theme).toBe(read.rowInk);
      expect(read.ganttTheme, theme).toBe(theme === 'Dark' ? 'dark' : 'light');
    }
  });
});
