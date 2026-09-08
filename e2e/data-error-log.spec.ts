import { test, expect } from '@playwright/test';

// T1-4: `watchAllErrors` used to subscribe once at module scope, over the dataset/gantt pair that
// existed when the page loaded. Importing a document replaces both — `Dataset.fromJSON` and a fresh
// `Gantt` — so every refusal after an import went unreported: the old subscription still watched
// entries the import had already discarded. `bindErrors()` now rebinds it alongside
// `bindDataset()`/`bindGantt()`, so a refusal after an import still reaches the log.

function logLines(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('#log div').allTextContents();
}

test('a refusal after importing a document still reaches the error log (T1-4)', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.click('#export-btn');
  await expect(page.locator('#document-json')).not.toHaveValue('');
  await page.click('#import-btn');
  const bar = page.locator('#gantt .fg-bar').first();
  await expect(bar).toBeVisible();

  // The lock checkbox always locks the first entry (harness/data.ts's firstEntryId()); select the
  // same bar so move-fwd-btn's write actually targets the locked entry.
  await bar.click();
  await expect(page.locator('#move-fwd-btn')).toBeEnabled();
  // D-S2-25: locks the first entry; the lock plugin's own beforeChange refuses any later
  // changeset that touches it.
  await page.check('#lock-checkbox');
  await expect(page.locator('#lock-checkbox')).toBeChecked();

  const rowsBefore = await logLines(page);

  await page.click('#move-fwd-btn');

  await expect
    .poll(async () => logLines(page))
    .toEqual(expect.arrayContaining([expect.stringContaining('error ·')]));
  const rowsAfter = await logLines(page);
  expect(rowsAfter.length).toBeGreaterThan(rowsBefore.length);
});
