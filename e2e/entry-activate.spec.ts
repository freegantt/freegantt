import { test, expect } from '@playwright/test';

// #434: entryActivate over a real page — the click and key paths generic.html's own readout
// wires (harness/main.ts), and the opt-in double-click behind the bench's own checkbox
// (#dblclick-activates-checkbox). A unit test already pins the event payload and the capability
// precedence (`src/api/gantt.test.ts`); this proves the same wiring survives real browser focus
// and real pointer events, not `dispatchEvent`.

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

test('a plain click activates the bar’s own Entry', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  await bar.click({ position: { x: 12, y: box!.height / 2 } });

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click)`);
});

test('Enter on the just-clicked (now focused) bar activates it again, cause "key"', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  // A real click both activates (cause "click") and, being on a tabIndex-bearing bar, gives it
  // real DOM focus — the same focus `Enter` reads (D-S5-39).
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click)`);

  await page.keyboard.press('Enter');

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (key)`);
});

test('a double-click activates by its leading click alone until dblclickActivates is opted in, then by "dblclick"', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const barId = (await bar.getAttribute('data-bar-id'))!;
  const name = await entryNameOfBar(page, barId);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const position = { x: 12, y: box!.height / 2 };

  // Default `dblclickActivates: false`: the double-click's own leading click still activates —
  // the readout must never read "(dblclick)" here.
  await bar.dblclick({ position });
  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (click)`);

  await page.locator('#dblclick-activates-checkbox').check();
  await bar.dblclick({ position });

  await expect(page.locator('#activation-readout')).toHaveText(`Activated: ${name} (dblclick)`);
});
