import { test, expect } from '@playwright/test';

// S5.8 visible acceptance ([S5-A5], s5.8-inline-editing.md §4): the flagship demo (index.html,
// harness/main.ts) installs `inlineEditing()` alongside tooltips()/contextMenu(). Race handling and
// every capability/Field gate are unit-tested in src/extensions/features/inline-editing.test.ts — a
// real page only needs to prove double-click-to-edit and one commit actually reach the DOM.
//
// A pre-existing harness finding (not this slice's bug, recorded per CLAUDE.md's harness-review
// rule): `index.html`'s `#selection-readout` sits above `#gantt` in normal flow and grows from
// "Selection: (none)" to a longer line the instant a row is first selected, reflowing `#gantt` down
// by about one row's height. A row click is also a select (D-S3-10's grid-row amendment), so a
// genuine two-click double-click at one fixed screen position can have its second click land on
// whatever the reflow put there instead — a real double-click-to-edit usability gap this page should
// fix (give `#selection-readout` a stable box), not something `inlineEditing()` can compensate for.
// Selecting the row once first (settling the reflow) before the real double-click works around it here.

test('double-click a Name cell edits in place and commits on Enter', async ({ page }) => {
  await page.goto('/');
  const cell = page.locator('#gantt .fg-row [data-field="name"]').first();
  await expect(cell).toBeVisible();
  const original = (await cell.textContent())?.trim();
  await cell.click(); // settle the #selection-readout reflow before the real double-click

  await cell.dblclick();
  const input = page.locator('#gantt .fg-cell-editor-control');
  await expect(input).toBeVisible();
  await input.fill('Renamed by e2e');
  await input.press('Enter');

  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);
  await expect(cell).toHaveText('Renamed by e2e');
  expect(original).not.toBe('Renamed by e2e');
});

test('Escape reverts a Budget edit with no commit', async ({ page }) => {
  await page.goto('/');
  const cell = page.locator('#gantt .fg-row [data-field="cost"]').first();
  await expect(cell).toBeVisible();
  const original = await cell.textContent();
  await cell.click(); // settle the #selection-readout reflow before the real double-click

  await cell.dblclick();
  const input = page.locator('#gantt .fg-cell-editor-control');
  await expect(input).toBeVisible();
  await input.fill('$999');
  await input.press('Escape');

  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);
  await expect(cell).toHaveText(original ?? '');
});

// U8, [S5-A5]: hierarchy.html's own "Bring your own editor" checkbox opens `window.prompt` through
// `beforeEntryEdit` instead of the built-in editor (harness/hierarchy.ts).
test('a consumer replaces the editor through beforeEntryEdit (U8)', async ({ page }) => {
  await page.goto('/hierarchy.html');
  await page.locator('#custom-editor-checkbox').check();

  page.once('dialog', (dialog) => dialog.accept('Renamed via prompt'));
  const cell = page.locator('#gantt .fg-row [data-field="name"]').first();
  await expect(cell).toBeVisible();
  await cell.dblclick();

  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);
  await expect(cell).toHaveText('Renamed via prompt');
});
