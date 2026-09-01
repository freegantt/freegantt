import { test, expect } from '@playwright/test';

async function nativeHighlight(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** First bar whose box sits fully below the sticky header. The generic demo's first `.fg-bar` is the
 *  Program group bracket, which paints under the header and cannot receive a click. */
async function unobstructedBar(page: import('@playwright/test').Page) {
  const itemId = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      return bar.getAttribute('data-item-id');
    }
    return null;
  });
  expect(itemId).not.toBeNull();
  return page.locator(`#gantt .fg-bar[data-item-id="${itemId}"]`);
}

test('clicking a bar does not highlight bar or page text', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await (await unobstructedBar(page)).click();
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a bar does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await (await unobstructedBar(page)).dblclick();
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
