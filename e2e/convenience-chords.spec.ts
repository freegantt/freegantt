import { test, expect } from '@playwright/test';
import { gotoGeneric } from './row-drag-support.js';

// #262: convenienceChords turns a chord's own default binding off while the command it runs stays
// reachable another way — the toolbar's Undo button, here. A unit test already pins the resolve
// logic (`src/view/convenience-chords.test.ts`); this proves the gate holds for a real keydown
// inside the Gantt, and that the toolbar path it must still leave open really does.

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
  }
}

/** First span bar whose click point is actually on that bar — the same scan
 *  entry-activate.spec.ts uses (rule 3, browser-tests skill: no fixture bar named by id). */
async function unobstructedBar(page: import('@playwright/test').Page) {
  const barId = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (bar.classList.contains('fg-bar-summary')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
      return bar.getAttribute('data-bar-id');
    }
    return null;
  });
  expect(barId).not.toBeNull();
  return page.locator(`#gantt .fg-bar[data-bar-id="${barId}"]`);
}

test('with the undo chord off, Control+Z inside the Gantt leaves an edit standing; the toolbar Undo button still undoes it', async ({
  page,
}) => {
  await gotoGeneric(page);

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const position = { x: 12, y: box!.height / 2 };
  await bar.click({ position });
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const entryId = barId.split(':')[0]!;
  const original = await page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId);

  // Turn undo's own chord off — the per-command map shape of `convenienceChords` — through the
  // harness checkbox, which writes nothing but that one public property (harness/main.ts).
  await page.check('#undo-chord-off-checkbox');

  await page.fill('#rename-input', 'Renamed with undo chord off');
  await page.click('#rename-btn');
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe('Renamed with undo chord off');

  // Real DOM focus inside `#gantt`, the same way a click leaves it (entry-activate.spec.ts),
  // so the keydown bubbles through the container the keymap listens on.
  await bar.click({ position });
  await page.keyboard.press('Control+z');

  // The chord is off; the edit stands. `expect.poll` proves a settled state, not just "no crash".
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe('Renamed with undo chord off');

  // The command itself is still reachable — the toolbar's Undo button runs
  // `gantt.commands.run('freegantt.undo')` (gantt-toolbar.ts), untouched by the chord being off.
  await page.locator('[aria-label="Undo"]').click();
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe(original);
});

test('with every convenience chord off, Control+Z is inert but Escape still clears the selection', async ({
  page,
}) => {
  await gotoGeneric(page);

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const position = { x: 12, y: box!.height / 2 };
  await bar.click({ position });
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const entryId = barId.split(':')[0]!;
  const original = await page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId);

  // Turn every convenience chord off — the boolean `false` shape of `convenienceChords` — through
  // the harness checkbox, which writes nothing but that one public property (harness/main.ts).
  await page.check('#all-chords-off-checkbox');

  await page.fill('#rename-input', 'Renamed with every chord off');
  await page.click('#rename-btn');
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe('Renamed with every chord off');

  await bar.click({ position });
  await expect(page.locator('#selection-readout')).toHaveText(`Selected: ${entryId}`);

  // Control+Z is a convenience chord for `freegantt.undo` — inert with every chord off, so the
  // rename stands.
  await page.keyboard.press('Control+z');
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe('Renamed with every chord off');

  // The browser's own unhandled-Ctrl+Z fallback moves focus back to `#rename-input` (the last
  // field it edited), so the bar needs a fresh click before the next chord — proof itself that the
  // library never called `preventDefault()` on that keydown.
  await bar.click({ position });

  // Escape binds `freegantt.clearSelection` with no `when` at all (gantt-shell.ts) — an obligation
  // chord, so it still fires even though every convenience chord is off.
  await page.keyboard.press('Escape');
  await expect(page.locator('#selection-readout')).toHaveText('No selection');

  // The command itself is still reachable — the toolbar's Undo button runs
  // `gantt.commands.run('freegantt.undo')` (gantt-toolbar.ts), untouched by the chord being off.
  await page.locator('[aria-label="Undo"]').click();
  await expect
    .poll(() => page.evaluate((id) => window.__dataset.entries.get(id)!.name, entryId))
    .toBe(original);
});
