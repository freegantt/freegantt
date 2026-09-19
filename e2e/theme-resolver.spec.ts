import { test, expect } from '@playwright/test';

// #433: `harness/theme-resolver.html` installs a real `ThemeResolver` at construction time — the
// browser coverage `harness/gantt-toolbar.ts`'s literal-only `ThemeChoice` never gave this path.
// The loop-fix regression test lives in `theme-resolver-loop.spec.ts`; this one drives the demo
// page the way a person would: click the button, watch the Gantt follow.

test('a ThemeResolver keyed on the <html> class follows a real button click, with a bounded call count', async ({
  page,
}) => {
  await page.goto('/theme-resolver.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const container = page.locator('#gantt');
  await expect(container).toHaveAttribute('data-fg-theme', 'light');

  const callsReadout = page.getByTestId('resolver-calls');
  const callsBefore = Number((await callsReadout.textContent())?.match(/\d+/)?.[0] ?? '0');

  await page.getByTestId('toggle-dark-class').click();
  await expect(container).toHaveAttribute('data-fg-theme', 'dark');

  const callsAfter = Number((await callsReadout.textContent())?.match(/\d+/)?.[0] ?? '0');
  // One click is one real flip. A resolver storm (the #433 loop bug) would run this into the
  // hundreds before the assertion above even had a chance to time out.
  expect(callsAfter - callsBefore).toBeLessThan(10);

  await page.getByTestId('toggle-dark-class').click();
  await expect(container).toHaveAttribute('data-fg-theme', 'light');
});
