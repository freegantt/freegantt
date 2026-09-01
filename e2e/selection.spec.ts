import { test, expect } from '@playwright/test';

async function nativeHighlight(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** First span bar whose click point is actually on that bar. Group brackets span the full
 *  dataset, so Playwright then scrolls them under the sticky header and the click never lands. */
async function unobstructedBar(page: import('@playwright/test').Page) {
  const itemId = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (bar.classList.contains('fg-bar-bracket')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
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

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a bar does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.dblclick({ position: { x: 12, y: box!.height / 2 } });
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
