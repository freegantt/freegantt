import { test, expect } from '@playwright/test';
import { gotoGeneric } from './row-drag-support.js';

// #434: entryActivate over a real page — the click and key paths generic.html's own readout
// wires (harness/main.ts), and the pointer-trigger choice behind the bench's own select
// (#pointer-activation-select: 'click' | 'dblclick'). A unit test already pins the event payload
// and the capability precedence (`src/api/gantt.test.ts`); this proves the same wiring survives
// real browser focus and real pointer events, not `dispatchEvent`. The readout's own count (a
// running total since page load, `×N`) is what tells a real fix apart from the bug it fixes: a
// double-click that fires `entryActivate` three times reads the same last cause a single-fire
// double-click does, so only the count catches it.

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
  }
}

/** First span bar whose click point is actually on that bar — the same scan `selection.spec.ts`
 *  uses (rule 3, browser-tests skill: no fixture bar named by id). */
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

/** The bar's own Entry name, read through the public Dataset — never hardcoded (rule 3). A
 *  `data-bar-id` is `entryId:partIndex` (`model/ids.ts`); this fixture draws one part per bar. */
async function entryNameOfBar(page: import('@playwright/test').Page, barId: string): Promise<string> {
  const entryId = barId.split(':')[0]!;
  const name = await page.evaluate((id) => window.__dataset.entries.get(id)?.name, entryId);
  expect(name).not.toBeUndefined();
  return name!;
}

test('a plain click activates the bar’s own Entry, once', async ({ page }) => {
  await gotoGeneric(page);

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  await bar.click({ position: { x: 12, y: box!.height / 2 } });

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click) ×1`);
});

test('Enter on the just-clicked (now focused) bar activates it again, cause "key"', async ({ page }) => {
  await gotoGeneric(page);

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  // A real click both activates (cause "click") and, being on a tabIndex-bearing bar, gives it
  // real DOM focus — the same focus `Enter` reads.
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click) ×1`);

  await page.keyboard.press('Enter');

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (key) ×2`);
});

test('default mode: a real double-click activates once, not three times', async ({ page }) => {
  await gotoGeneric(page);
  await expect(page.locator('#pointer-activation-select')).toHaveValue('click');

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const position = { x: 12, y: box!.height / 2 };

  // The browser sends two `click`s and one `dblclick` for this one gesture. Default
  // `pointerActivation: 'click'` must count it once — the bug this branch fixes counted it three
  // times, indistinguishable from a single fire by cause alone, which is why the count is the
  // assertion, not just the trailing "(click)".
  await bar.dblclick({ position });

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click) ×1`);
});

test('double-click mode: a single click activates nothing', async ({ page }) => {
  await gotoGeneric(page);

  await page.locator('#pointer-activation-select').selectOption('dblclick');

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  await bar.click({ position: { x: 12, y: box!.height / 2 } });

  // Opting in to `'dblclick'` replaces click as the trigger — it does not add a second one — so a
  // lone click must leave the readout at its page-load text, never a "(click) ×1".
  await expect(page.locator('#activation-readout')).toHaveText('Not activated');
});

test('double-click mode: a real double-click activates exactly once, cause "dblclick"', async ({ page }) => {
  await gotoGeneric(page);

  await page.locator('#pointer-activation-select').selectOption('dblclick');

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  await bar.dblclick({ position: { x: 12, y: box!.height / 2 } });

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (dblclick) ×1`);
});
