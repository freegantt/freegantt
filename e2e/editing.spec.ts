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

test('[S5-A5] double-click a Name cell edits in place and commits on Enter', async ({ page }) => {
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
  await input.fill('999');
  await input.press('Escape');

  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);
  await expect(cell).toHaveText(original ?? '');
});

// U8, [S5-A5]: hierarchy.html's own "Bring your own editor" checkbox opens `window.prompt` through
// `beforeEntryEdit` instead of the built-in editor (harness/hierarchy.ts).
test('[S5-A5] a consumer replaces the editor through beforeEntryEdit (U8)', async ({ page }) => {
  await page.goto('/hierarchy.html');
  await page.locator('#custom-editor-checkbox').check();

  page.once('dialog', (dialog) => dialog.accept('Renamed via prompt'));
  const cell = page.locator('#gantt .fg-row [data-field="name"]').first();
  await expect(cell).toBeVisible();
  await cell.dblclick();

  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);
  await expect(cell).toHaveText('Renamed via prompt');
});

// #158: an open editor must stay glued to its own cell while the pane scrolls. It mounts in the grid
// row layer (`ctx.view.rowLayer`), the element the pane's scroll already moves, so the browser
// carries both boxes in one frame — the earlier overlay mount had to chase the cell from a `scroll`
// listener, which lands a frame late and reads as jitter. jsdom cannot show that: this needs a real
// scroll in a real browser. A vetoed edit is what keeps an editor open long enough to scroll at all
// (#137 F5) — the harness has no veto, so an untouched editor left open serves the same purpose.
test('an open editor stays over its cell while the pane scrolls (#158)', async ({ page }) => {
  await page.goto('/');
  const cell = page.locator('#gantt .fg-row [data-field="name"]').first();
  await expect(cell).toBeVisible();
  await cell.click(); // settle the #selection-readout reflow before the real double-click

  await cell.dblclick();
  const editor = page.locator('#gantt .fg-cell-editor');
  await expect(editor).toBeVisible();

  const offsetToCell = async (): Promise<{ x: number; y: number }> => {
    const [a, b] = [await editor.boundingBox(), await cell.boundingBox()];
    return { x: Math.round(a!.x - b!.x), y: Math.round(a!.y - b!.y) };
  };
  expect(await offsetToCell()).toEqual({ x: 0, y: 0 });

  const timelinePane = page.locator('.fg-timeline-pane');
  await timelinePane.evaluate((el) => {
    el.scrollTop = 60;
  });
  await expect.poll(async () => timelinePane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Still open, still exactly over its own cell — which has itself moved up with the scroll.
  await expect(editor).toHaveCount(1);
  expect(await offsetToCell()).toEqual({ x: 0, y: 0 });
});

// Review R4/SP1: a cell that offers an editor but cannot open one here names the reason, in a notice
// mounted over the cell (`.fg-cell-notice`, `data-reason`). Two of its properties need a real
// browser, because happy-dom measures no layout. First, the notice must be pointer-transparent: the
// next double-click has to reach the cell underneath it, or the grid soft-locks. `elementFromPoint`
// over the cell's own centre is that assertion — a real hit test, which is the one thing a layout
// engine answers and happy-dom cannot. (A second `dblclick` proves nothing here: the pointer press
// dismisses the notice first, so Playwright's own actionability check passes either way.) Second,
// the notice must land on its own cell rather than somewhere absurd.
//
// `program` is the reachable refusal on this page: it is the demo tree's outermost row with
// children, and Budget (the `cost` Field) declares both `editable` and a `sum` rollup. ADR 0013
// makes having children the whole predicate, so every row with children refuses the same way, and a
// childless row edits normally.
test('a refused cell names the reason, and the notice lets the next click through (R4)', async ({ page }) => {
  await page.goto('/');
  const groupRow = page.locator('#gantt .fg-row[data-entry-id="program"]');
  const rolledUp = groupRow.locator('[data-field="cost"]');
  await expect(rolledUp).toBeVisible();
  await rolledUp.click(); // settle the #selection-readout reflow before the real double-click

  await rolledUp.dblclick();
  const notice = page.locator('#gantt .fg-cell-notice[data-reason]');
  await expect(notice).toHaveAttribute('data-reason', 'derived-value');
  await expect(notice).toContainText('comes from its children');
  await expect(page.locator('#gantt .fg-cell-editor-control')).toHaveCount(0);

  // Over its own cell, not somewhere absurd.
  const [noticeBox, cellBox] = [await notice.boundingBox(), await rolledUp.boundingBox()];
  expect(Math.round(noticeBox!.x - cellBox!.x)).toBe(0);
  expect(Math.round(noticeBox!.y - cellBox!.y)).toBe(0);

  // The notice is over the cell and takes no pointer: a hit test at the cell's own centre answers
  // with the cell, never with the notice. Without that the next double-click cannot reach any cell.
  const hit = await page.evaluate(
    ({ x, y }) => {
      const node = document.elementFromPoint(x, y);
      return {
        isNotice: node?.closest('.fg-cell-notice') !== null,
        isCell: node?.closest('[data-field="cost"]') !== null,
      };
    },
    { x: cellBox!.x + cellBox!.width / 2, y: cellBox!.y + cellBox!.height / 2 },
  );
  expect(hit).toEqual({ isNotice: false, isCell: true });

  // And a double-click still reaches an editable cell afterwards.
  await groupRow.locator('[data-field="name"]').dblclick();
  await expect(page.locator('#gantt .fg-cell-editor-control')).toBeVisible();
});
