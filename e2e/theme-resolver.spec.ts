import { test, expect } from '@playwright/test';

// #433: `harness/theme-resolver.html` installs a real `ThemeResolver` at construction time — the
// browser coverage `harness/gantt-toolbar.ts`'s literal-only `ThemeChoice` never gave this path.
// The loop-fix regression test (raw resolver call counts) lives in `theme-resolver-loop.spec.ts`;
// this one drives the demo page the way a person would: click the button, watch the Gantt follow.

test('a ThemeResolver keyed on the <html> class follows a real button click, with exactly one themeChange per click', async ({
  page,
}) => {
  await page.goto('/theme-resolver.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const container = page.locator('#gantt');
  await expect(container).toHaveAttribute('data-fg-theme', 'light');

  const flipsReadout = page.getByTestId('theme-flips');
  await expect(flipsReadout).toHaveText('0 theme flips');

  await page.getByTestId('toggle-dark-class').click();
  await expect(container).toHaveAttribute('data-fg-theme', 'dark');
  // One click is one real flip. A resolver storm (the #433 loop bug) would keep firing themeChange
  // and this count would run away instead of landing on exactly one.
  await expect(flipsReadout).toHaveText('1 theme flip');

  await page.getByTestId('toggle-dark-class').click();
  await expect(container).toHaveAttribute('data-fg-theme', 'light');
  await expect(flipsReadout).toHaveText('2 theme flips');
});
