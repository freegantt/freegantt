import { test, expect } from '@playwright/test';

// ADR 0029: the app pushes the theme; the library never asks. `harness/theme-push.html` demos both
// recipes off one toggle — this drives the page the way a person would: click the button, watch
// both Gantts follow.
//
// Recipe 1 (`pushedGantt`) writes `gantt.theme` directly, so its own container carries
// `data-fg-theme`. Recipe 2 (`pinnedGantt`) sits on `'auto'` inside a pinned wrapper: `'auto'`
// writes no attribute of its own, so the test reads `resolvedTheme` off `window.__ganttPinned`
// instead of an attribute that was never going to be there.

declare global {
  interface Window {
    __ganttPinned: { resolvedTheme: 'light' | 'dark' };
  }
}

test('one toggle pushes the theme both ways: a direct write and a data-fg-theme pin', async ({ page }) => {
  await page.goto('/theme-push.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const pushedContainer = page.getByTestId('gantt-pushed');
  const pinnedWrapper = page.getByTestId('pinned-wrapper');
  const resolvedPinnedTheme = () => page.evaluate(() => window.__ganttPinned.resolvedTheme);

  await expect(pushedContainer).toHaveAttribute('data-fg-theme', 'light');
  await expect(pinnedWrapper).not.toHaveAttribute('data-fg-theme');
  expect(await resolvedPinnedTheme()).toBe('light');

  const flipsReadout = page.getByTestId('theme-flips');
  await expect(flipsReadout).toHaveText('0 theme flips');

  await page.getByTestId('toggle-dark-mode').click();
  // Recipe 1: the app wrote `gantt.theme = 'dark'` straight onto this Gantt.
  await expect(pushedContainer).toHaveAttribute('data-fg-theme', 'dark');
  // Recipe 2: the app pinned the wrapper, and the inner Gantt (`theme: 'auto'`) reads it back.
  await expect(pinnedWrapper).toHaveAttribute('data-fg-theme', 'dark');
  await expect(flipsReadout).toHaveText('2 theme flips');
  expect(await resolvedPinnedTheme()).toBe('dark');

  await page.getByTestId('toggle-dark-mode').click();
  await expect(pushedContainer).toHaveAttribute('data-fg-theme', 'light');
  await expect(pinnedWrapper).toHaveAttribute('data-fg-theme', 'light');
  await expect(flipsReadout).toHaveText('4 theme flips');
  expect(await resolvedPinnedTheme()).toBe('light');
});
