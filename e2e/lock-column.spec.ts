import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// The padlock column paints its header icon and its cell icons in one column. They share a centre.

const PAGES = ['/editing-and-data.html', '/generic.html'];

async function centreX(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).not.toBeNull();
  return box!.x + box!.width / 2;
}

for (const path of PAGES) {
  test(`${path}: the padlock header icon sits over the cell icons`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('.fg-row[data-entry-id]').first()).toBeVisible();
    const header = await centreX(page, '.fg-col-header[data-field="locked"] svg');
    const cell = await centreX(page, '.fg-row[data-entry-id] [data-field="locked"] svg');
    expect(Math.abs(header - cell)).toBeLessThanOrEqual(2);
  });

  test(`${path}: a locked and an unlocked padlock draw different shapes`, async ({ page }) => {
    await page.goto(path);
    const cells = page.locator('.fg-row[data-entry-id] [data-field="locked"]');
    const before = await cells.nth(1).locator('svg').innerHTML();
    await cells.nth(1).click();
    await expect(cells.nth(1).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect(await cells.nth(1).locator('svg').innerHTML()).not.toBe(before);
  });

  test(`${path}: the padlock header draws in the colour of the other header labels`, async ({ page }) => {
    await page.goto(path);
    const colour = (selector: string): Promise<string> =>
      page
        .locator(selector)
        .first()
        .evaluate((node) => getComputedStyle(node).color);
    const lock = await colour('.fg-col-header[data-field="locked"] .fg-col-header-label');
    const other = await colour('.fg-col-header[data-field="name"]');
    expect(lock).toBe(other);
  });
}
