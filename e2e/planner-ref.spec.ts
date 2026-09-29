import { test, expect } from '@playwright/test';

// #618: the `#` column shows a work row's number, and nothing for a phase (a row with children) —
// `fixtures/planner-dataset.ts`'s own rule. A vertical drag that gives a work row its first child
// must blank that cell the moment the tree changes, and Undo must bring the number back.

test('a work row that gains its first child shows no number, and Undo restores it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const refCell = (entryId: string) =>
    page.locator(`#gantt .fg-row[data-entry-id="${entryId}"] [data-field="ref"]`);

  const numberBefore = await refCell('permits').textContent();
  expect(numberBefore).toMatch(/^\d+$/);

  // Drag a sibling work row ("geotech") onto "permits"'s row band — a vertical-only move onto the
  // middle zone, which reparents it under "permits" and makes "permits" a phase.
  const bar = page.locator('#gantt .fg-bar[data-bar-id^="geotech:"]').first();
  await bar.scrollIntoViewIfNeeded();
  const barBox = (await bar.boundingBox())!;
  const grabX = barBox.x + 8;
  const grabY = barBox.y + barBox.height / 2;

  const targetRow = page.locator('#gantt .fg-row[data-entry-id="permits"]');
  const targetRowId = await targetRow.getAttribute('data-row-id');
  const targetBand = page.locator(`#gantt .fg-row-band[data-row-id="${targetRowId}"]`);
  await targetBand.scrollIntoViewIfNeeded();
  const targetBox = (await targetBand.boundingBox())!;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => refCell('permits').textContent()).toBe('');

  await page.locator('[aria-label="Undo"]').click();

  await expect.poll(() => refCell('permits').textContent()).toBe(numberBefore);
});
