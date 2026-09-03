import { test, expect } from '@playwright/test';

// S5.5 visible acceptance (s5.5-tooltips-and-context-menu.md §4, D-S5-13/14): the flagship demo
// (index.html, harness/main.ts) installs both tooltips() and contextMenu() from the start.
// Right-click/menu behaviour (position, defaults filtered by `when`, items() append/reorder,
// click/Escape) is unit-tested end to end in src/extensions/features/context-menu.test.ts — a real
// page's own scroll-into-view races Popup's `dismissOn: 'scroll'` (D-S5-9) too easily to keep an
// e2e right-click scenario stable, so only the hover path (no such race) is covered here.

test('hovering a bar opens a tooltip with the entry name and dates', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-bracket)').first();
  await expect(bar).toBeVisible();

  await bar.hover();
  const tooltip = page.locator('#gantt .fg-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(page.locator('#gantt .fg-tooltip-title')).not.toBeEmpty();
  await expect(page.locator('#gantt .fg-tooltip-dates')).not.toBeEmpty();

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});
