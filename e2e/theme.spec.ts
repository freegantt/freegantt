import { test, expect } from '@playwright/test';

test.describe('theme (system dark)', () => {
  test.use({ colorScheme: 'dark' });

  test('Light pins the Gantt pane to the light tokens, Dark pins the dark tokens', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'light');
    const lightPane = await page
      .locator('.fg-timeline-pane')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const lightRow = await page
      .locator('.fg-grid-pane .fg-row-label')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(lightPane).toBe('rgb(250, 250, 247)');
    expect(lightRow).toBe('rgb(26, 24, 21)');

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('#gantt')).toHaveAttribute('data-fg-theme', 'dark');
    const darkPane = await page
      .locator('.fg-timeline-pane')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const darkRow = await page
      .locator('.fg-grid-pane .fg-row-label')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(darkPane).toBe('rgb(21, 22, 26)');
    expect(darkRow).toBe('rgb(236, 234, 227)');
    const darkBarLabel = await page
      .locator('#gantt .fg-bar')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(darkBarLabel).toBe('rgb(26, 24, 21)');
  });
});
