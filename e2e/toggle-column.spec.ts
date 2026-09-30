import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// A toggle column switches with one click, `Space` or `Enter`, opens no editor, and names itself
// from its column header. The test page declares no ARIA: every role and label comes from the library.

async function open(page: Page): Promise<void> {
  await page.goto('/e2e/toggle-column.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();
}

function cell(page: Page, field: string): Locator {
  return page.locator(`.fg-row[data-entry-id] [role="gridcell"][data-field="${field}"]`).first();
}

function checkbox(page: Page, field: string): Locator {
  return cell(page, field).getByRole('checkbox');
}

test('a click switches the icon and the checked state', async ({ page }) => {
  await open(page);
  await expect(checkbox(page, 'done')).toHaveAttribute('aria-checked', 'false');
  const before = await checkbox(page, 'done').textContent();

  await cell(page, 'done').click();

  await expect(checkbox(page, 'done')).toHaveAttribute('aria-checked', 'true');
  expect(await checkbox(page, 'done').textContent()).not.toBe(before);
  await expect(page.locator('.fg-cell-editor')).toHaveCount(0);
});

test('a double-click switches once and opens no editor', async ({ page }) => {
  await open(page);
  await cell(page, 'flag').dblclick();

  await expect(checkbox(page, 'flag')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.fg-cell-editor')).toHaveCount(0);
});

for (const key of ['Space', 'Enter']) {
  test(`${key} on the focused cell switches it and opens no editor`, async ({ page }) => {
    await open(page);
    await cell(page, 'flag').focus();

    await page.keyboard.press(key);

    await expect(checkbox(page, 'flag')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.fg-cell-editor')).toHaveCount(0);

    await page.keyboard.press(key);
    await expect(checkbox(page, 'flag')).toHaveAttribute('aria-checked', 'false');
  });
}

test('the column header names the checkbox, and the icon is hidden from assistive technology', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('checkbox', { name: 'Done' }).first()).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Flag' }).first()).toBeVisible();
  await expect(cell(page, 'done').locator('[aria-hidden="true"]').first()).toBeAttached();
});

test('a header renderer keeps the header string as its accessible name', async ({ page }) => {
  await open(page);
  const header = page.locator('.fg-col-header[data-field="done"]');
  await expect(header).toHaveText('✔');
  await expect(header).toHaveAttribute('aria-label', 'Done');
  await expect(page.getByRole('columnheader', { name: 'Done' })).toBeVisible();
});
