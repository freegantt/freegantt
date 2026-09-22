import { test, expect } from '@playwright/test';

async function nativeHighlight(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** First span bar whose click point is actually on that bar. Group brackets span the full
 *  dataset, so Playwright then scrolls them under the sticky header and the click never lands. */
async function unobstructedBar(page: import('@playwright/test').Page) {
  const barId = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (bar.classList.contains('fg-bar-summary')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
      return bar.getAttribute('data-bar-id');
    }
    return null;
  });
  expect(barId).not.toBeNull();
  return page.locator(`#gantt .fg-bar[data-bar-id="${barId}"]`);
}

/** `count` distinct bars a real pointer can land on — the same criteria as `unobstructedBar`, so a
 *  right-click test can build a multi-bar Selection without naming any fixture bar by id. */
async function unobstructedBars(page: import('@playwright/test').Page, count: number) {
  const barIds = await page.evaluate((wanted) => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return [];
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    const found: string[] = [];
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (found.length >= wanted) break;
      if (bar.classList.contains('fg-bar-summary')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
      const id = bar.getAttribute('data-bar-id');
      if (id !== null) found.push(id);
    }
    return found;
  }, count);
  expect(barIds.length).toBe(count);
  return barIds.map((id) => page.locator(`#gantt .fg-bar[data-bar-id="${id}"]`));
}

/** A point inside the timeline pane, below its sticky header, that lands on no bar — found by
 *  scanning the rendered pane instead of naming a fixture coordinate (rule 3, browser-tests skill). */
async function emptyTimelinePoint(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const rect = pane.getBoundingClientRect();
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? rect.top;
    const STEP = 15;
    for (let y = headerBottom + 5; y < rect.bottom - 5; y += STEP) {
      for (let x = rect.left + 5; x < rect.right - 5; x += STEP) {
        const el = document.elementFromPoint(x, y);
        if (el === null || !pane.contains(el)) continue;
        if (el.closest('.fg-bar') !== null) continue;
        return { x, y };
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  return point!;
}

test('a selected bar keeps its paint when it remounts after a scroll (#185)', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  await expect(bar).toHaveAttribute('data-state', /\bselected\b/);

  const pane = page.locator('#gantt .fg-timeline-pane');
  const scrolledLeft = await pane.evaluate((el) => el.scrollLeft);
  await pane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.locator(`#gantt .fg-bar[data-bar-id="${barId}"]`)).toHaveCount(0);

  await pane.evaluate((el, left) => {
    el.scrollLeft = left;
  }, scrolledLeft);
  const remounted = page.locator(`#gantt .fg-bar[data-bar-id="${barId}"]`);
  await expect(remounted).toHaveCount(1);
  await expect(remounted).toHaveAttribute('data-state', /\bselected\b/);
});

test('clicking a bar does not highlight bar or page text', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a bar does not highlight text from the page', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.dblclick({ position: { x: 12, y: box!.height / 2 } });
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a row label does not highlight text from the page', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const label = page.locator('#gantt .fg-row-label').first();
  await expect(label).toBeVisible();
  await label.dblclick();
  expect(await nativeHighlight(page)).toBe('');
});

test('a right-click keeps a multi-bar Selection when it lands inside it, and clears it on an empty timeline miss (#199/#205)', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bars = await unobstructedBars(page, 2);
  const firstBar = bars[0]!;
  const secondBar = bars[1]!;
  const firstBox = await firstBar.boundingBox();
  const secondBox = await secondBar.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  await firstBar.click({ position: { x: 12, y: firstBox!.height / 2 } });
  await secondBar.click({ position: { x: 12, y: secondBox!.height / 2 }, modifiers: ['Control'] });

  const readout = page.locator('#selection-readout');
  const bothSelected = await readout.textContent();
  expect(bothSelected).toContain(',');

  // A right-click on a bar that is part of the Selection leaves the Selection untouched (#199).
  await page.mouse.click(secondBox!.x + 12, secondBox!.y + secondBox!.height / 2, { button: 'right' });
  await expect(readout).toHaveText(bothSelected!);
  await page.keyboard.press('Escape'); // close the menu the right-click opened

  // A right-click on an empty timeline point still clears the Selection (#199/#205 follow-up).
  const empty = await emptyTimelinePoint(page);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await expect(readout).toHaveText('No selection');
});
