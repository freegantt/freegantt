import { test, expect } from '@playwright/test';

// [S2-A4] (plans/s2-data-core/s2.7-close-the-gate.md §2, plans/00 §4 gate condition 3): the
// changeset log in harness/data.html is built from each committed ChangeSet alone (D-S2-17), never
// by re-reading the dataset. `from` is what makes this falsifiable — a log built from a re-read can
// produce `to` but never `from`, since the dataset has already moved on by the time it is read.

function logLines(page: import('@playwright/test').Page) {
  return page.locator('#log div').allTextContents();
}

test('[S2-A4] rename logs from and to for the name field', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const select = page.locator('#entry-select');
  const firstOption = await select.locator('option').first().textContent();
  const entryId = firstOption!.split(' — ')[0]!;
  const before = (await page.locator('#rename-input').inputValue()).trim();

  await page.fill('#rename-input', 'Renamed by e2e');
  await page.click('#rename-btn');

  const rows = await logLines(page);
  const row = rows.find((line) => line.includes(`${entryId} · name`));
  expect(row).toBeDefined();
  expect(row).toContain(`${before} → Renamed by e2e`);
});

test('[S2-A4] move +1 day logs from and to for start and end', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const entryId = (await page.locator('#entry-select option').first().textContent())!.split(' — ')[0]!;

  await page.click('#move-fwd-btn');

  const rows = await logLines(page);
  const startRow = rows.find((line) => line.includes(`${entryId} · start`));
  const endRow = rows.find((line) => line.includes(`${entryId} · end`));
  expect(startRow).toBeDefined();
  expect(endRow).toBeDefined();

  for (const row of [startRow!, endRow!]) {
    const transition = row.split(' · ').pop()!;
    expect(transition).toMatch(/^\d+ → \d+$/);
    const [fromText, toText] = transition.split(' → ');
    expect(Number(toText)).toBeGreaterThan(Number(fromText));
  }
});

test('[S2-A4] undo logs an [undo]-tagged row whose to is the original value', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const entryId = (await page.locator('#entry-select option').first().textContent())!.split(' — ')[0]!;
  const original = (await page.locator('#rename-input').inputValue()).trim();

  await page.fill('#rename-input', 'Renamed before undo');
  await page.click('#rename-btn');
  await expect(page.locator('#undo-btn')).toBeEnabled();

  await page.click('#undo-btn');

  const rows = await logLines(page);
  const undoRow = rows.find((line) => line.startsWith('[undo]') && line.includes(`${entryId} · name`));
  expect(undoRow).toBeDefined();
  expect(undoRow).toContain(`Renamed before undo → ${original}`);
});
