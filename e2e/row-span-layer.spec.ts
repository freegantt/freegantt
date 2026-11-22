import { test, expect, type Page } from '@playwright/test';

// A panel opens under one task, as wide as the whole Gantt, and pushes the rows below it down.
// The unit tests prove `rowBox`. This spec proves the layer follows the rows in a real browser:
// it moves with vertical scroll, stays still on a horizontal pan, hides under the header, and
// keeps its own keys.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

const PANEL = '.demo-details-panel';
const FOURTH_BAR = '#gantt .fg-bar >> nth=3';

async function openPanelUnderTask(page: Page, index: number): Promise<void> {
  await page.goto('/inline-details.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await page.locator('#gantt .fg-bar').nth(index).click();
  await expect(page.locator(PANEL)).toBeVisible();
}

const top = (page: Page, selector: string): Promise<number> =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => node.getBoundingClientRect().top);

const scrollTimeline = (page: Page, to: { top?: number; left?: number }): Promise<void> =>
  page.evaluate((target) => {
    const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!;
    if (target.top !== undefined) pane.scrollTop = target.top;
    if (target.left !== undefined) pane.scrollLeft = target.left;
  }, to);

test('the panel opens under its row, spans both panes and pushes the rows below down', async ({ page }) => {
  await page.goto('/inline-details.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const nextBarBefore = await top(page, FOURTH_BAR);
  await page.locator('#gantt .fg-bar').nth(2).click();
  await expect(page.locator(PANEL)).toBeVisible();

  const gantt = await page.locator('#gantt').evaluate((node) => node.getBoundingClientRect().width);
  const panel = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());
  expect(Math.round(panel.width)).toBe(Math.round(gantt));
  const nextBarAfter = await top(page, FOURTH_BAR);
  expect(nextBarAfter - nextBarBefore).toBe(132);

  await page.locator(`${PANEL} button`).click();
  await expect(page.locator(PANEL)).toBeHidden();
  expect(await top(page, FOURTH_BAR)).toBe(nextBarBefore);
});

test('the layer follows vertical scroll and stays still on a horizontal pan', async ({ page }) => {
  await openPanelUnderTask(page, 6);
  const before = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());

  await scrollTimeline(page, { top: 60 });
  await expect.poll(async () => before.top - (await top(page, PANEL))).toBe(60);

  await scrollTimeline(page, { left: 200 });
  const panned = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());
  expect(panned.left).toBe(before.left);
  expect(panned.width).toBe(before.width);
});

test('content scrolled up under the header is hidden', async ({ page }) => {
  await openPanelUnderTask(page, 1);
  await scrollTimeline(page, { top: 150 });
  const headerBottom = await page
    .locator('#gantt .fg-grid-spacer')
    .evaluate((node) => node.getBoundingClientRect().bottom);
  await expect.poll(() => top(page, PANEL)).toBeLessThan(headerBottom);
  const clip = await page.locator('#gantt .fg-span-layer-clip').evaluate((node) => ({
    top: node.getBoundingClientRect().top,
    overflow: getComputedStyle(node).overflow,
  }));
  expect(clip.top).toBeCloseTo(headerBottom, 0);
  expect(clip.overflow).toBe('hidden');
});

test('a key pressed in mounted content never reaches the Gantt', async ({ page }) => {
  await openPanelUnderTask(page, 2);
  await page.evaluate(() => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Status');
    select.innerHTML = '<option>Open</option><option>Done</option>';
    document.querySelector('.demo-details-panel')!.append(select);
  });
  const selected = (): Promise<string[]> => page.evaluate(() => window.__gantt.selectedEntryIds.map(String));
  const scrollY = (): Promise<number> =>
    page.evaluate(() => document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!.scrollTop);
  const selectedBefore = await selected();
  const scrollBefore = await scrollY();

  for (const target of [`${PANEL} input`, `${PANEL} button`, `${PANEL} select`]) {
    await page.locator(target).focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'Home', 'End', 'Escape']) {
      await page.keyboard.press(key);
    }
    expect(await selected(), target).toEqual(selectedBefore);
    expect(await scrollY(), target).toBe(scrollBefore);
  }

  await page.locator(`${PANEL} input`).focus();
  await page.keyboard.type('hello');
  await expect(page.locator(`${PANEL} input`)).toHaveValue('hello');
});
