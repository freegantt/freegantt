import { test, expect, type Page } from '@playwright/test';

// A Row detail sizes itself. The Gantt measures the panel, so a panel that grows or shrinks moves
// the rows below it in the same paint, and a panel above the visible rows keeps them still.
// The unit tests fake layout. This spec proves the real measurement in each browser engine.

const PANEL = '.demo-details-panel';
const BAR = '#gantt .fg-bar';

async function openPanelUnderTask(page: Page, index: number): Promise<void> {
  await page.goto('/inline-details.html');
  await expect(page.locator(BAR).first()).toBeVisible();
  await page.locator(BAR).nth(index).click();
  await expect(page.locator(PANEL)).toBeVisible();
}

const barTop = (page: Page, index: number): Promise<number> =>
  page
    .locator(BAR)
    .nth(index)
    .evaluate((node) => node.getBoundingClientRect().top);

const setPanelHeight = (page: Page, height: number): Promise<void> =>
  page.locator(PANEL).evaluate((node, value) => {
    node.style.height = `${value}px`;
  }, height);

test('a panel that grows pushes the rows below it down by the growth', async ({ page }) => {
  await openPanelUnderTask(page, 1);
  const before = await barTop(page, 4);

  await setPanelHeight(page, 232);

  await expect.poll(() => barTop(page, 4)).toBe(before + 100);
  await setPanelHeight(page, 100);
  await expect.poll(() => barTop(page, 4)).toBe(before - 32);
});

test('a panel above the visible rows grows and the rows in view stay where they are', async ({ page }) => {
  await openPanelUnderTask(page, 0);
  // A short Gantt leaves room to scroll the first panel fully above the rows in view.
  await page.locator('#gantt').evaluate((node) => {
    node.style.height = '400px';
  });
  await page.locator('#gantt .fg-timeline-pane').evaluate((pane) => {
    pane.scrollTop = 300;
  });
  await expect
    .poll(() => page.locator('#gantt .fg-timeline-pane').evaluate((pane) => pane.scrollTop))
    .toBe(300);
  const visible = await page.locator(BAR).evaluateAll((bars) => {
    const header = document.querySelector('#gantt .fg-grid-spacer')!.getBoundingClientRect().bottom;
    const first = bars.find((bar) => bar.getBoundingClientRect().top > header + 40)!;
    return { label: first.textContent, top: first.getBoundingClientRect().top };
  });

  await setPanelHeight(page, 232);

  await expect
    .poll(async () => {
      const bar = page
        .locator(BAR)
        .filter({ hasText: visible.label ?? '' })
        .first();
      return bar.evaluate((node) => node.getBoundingClientRect().top);
    })
    .toBe(visible.top);
});

test('closing a panel with focus inside it puts focus on its Row', async ({ page }) => {
  await openPanelUnderTask(page, 2);
  await page.locator(`${PANEL} input`).focus();

  await page.locator(`${PANEL} button`).click();

  await expect(page.locator(PANEL)).toBeHidden();
  await expect(page.locator('#gantt .fg-row:focus')).toHaveCount(1);
});

test('the panel opens in the same paint as the rows move', async ({ page }) => {
  await page.goto('/inline-details.html');
  await expect(page.locator(BAR).first()).toBeVisible();
  const gap = await page.evaluate(async () => {
    const bars = document.querySelectorAll<HTMLElement>('#gantt .fg-bar');
    const below = bars[4]!;
    const before = below.getBoundingClientRect().top;
    bars[1]!.click();
    const seen: number[] = [];
    for (let frame = 0; frame < 4; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      seen.push(below.getBoundingClientRect().top - before);
    }
    return seen;
  });
  // After the first paint with the panel, the rows below never sit between two heights.
  expect(new Set(gap.filter((shift) => shift !== 0)).size).toBeLessThanOrEqual(1);
});
