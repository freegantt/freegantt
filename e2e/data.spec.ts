import { test, expect } from '@playwright/test';

// [S2-A4] (plans/s2-data-core/s2.7-close-the-gate.md §2, plans/00 §4 gate condition 3): the
// changeset log in harness/data.html is built from each committed ChangeSet alone (D-S2-17), never
// by re-reading the dataset. `from` is what makes this falsifiable — a log built from a re-read can
// produce `to` but never `from`, since the dataset has already moved on by the time it is read.
//
// Rename/move/remove act on `gantt.selectedEntryIds`. The test clicks a rendered bar rather than a fixture
// id, so a fixture edit does not break the log assertion.

function logLines(page: import('@playwright/test').Page) {
  return page.locator('#log div').allTextContents();
}

/** Item.id is `${entryId}:${segmentIndex}` (plans/01 §2.4). Segment index is the suffix after the
 *  last colon; the entry id is everything before it. */
function entryIdFromItemId(itemId: string): string {
  const colon = itemId.lastIndexOf(':');
  return colon === -1 ? itemId : itemId.slice(0, colon);
}

async function selectFirstBar(
  page: import('@playwright/test').Page,
): Promise<{ entryId: string; name: string }> {
  // A `fg-bar-summary` (a roll-up parent's own bar) draws no Segment of its own (ADR 0012, ADR
  // 0013 restores it) — selection.spec.ts's own bar-picking helpers skip it for the same reason.
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary)').first();
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page.locator('#rename-btn')).toBeEnabled();
  const itemId = await bar.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();
  return {
    entryId: entryIdFromItemId(itemId!),
    name: (await page.locator('#rename-input').inputValue()).trim(),
  };
}

test('[S2-A4] rename logs from and to for the name field', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const { entryId, name: before } = await selectFirstBar(page);

  await page.fill('#rename-input', 'Renamed by e2e');
  await page.click('#rename-btn');

  const rows = await logLines(page);
  const row = rows.find((line) => line.includes(`${entryId} · name`));
  expect(row).toBeDefined();
  expect(row).toContain(`${before} → Renamed by e2e`);
});

test('[S2-A4] move +1 day logs from and to for start and end', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const { entryId } = await selectFirstBar(page);

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
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const { entryId, name: original } = await selectFirstBar(page);

  await page.fill('#rename-input', 'Renamed before undo');
  await page.click('#rename-btn');
  await expect(page.locator('#undo-btn')).toBeEnabled();

  await page.click('#undo-btn');

  const rows = await logLines(page);
  const undoRow = rows.find((line) => line.startsWith('[undo]') && line.includes(`${entryId} · name`));
  expect(undoRow).toBeDefined();
  expect(undoRow).toContain(`Renamed before undo → ${original}`);
});
