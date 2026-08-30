import { test, expect } from '@playwright/test';

async function nativeHighlight(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

test('clicking a bar does not highlight bar or page text', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#gantt .fg-bar').first().click();
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a bar does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#gantt .fg-bar').first().dblclick();
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a row label does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const label = page.locator('#gantt .fg-row-label').first();
  await expect(label).toBeVisible();
  await label.dblclick();
  expect(await nativeHighlight(page)).toBe('');
});
