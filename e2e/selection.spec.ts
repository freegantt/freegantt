import { test, expect } from '@playwright/test';

async function nativeHighlight(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.getSelection()?.toString() ?? '');
}

/** First span bar whose click point is actually on that bar. Group brackets span the full
 *  dataset, so Playwright then scrolls them under the sticky header and the click never lands. */
async function unobstructedBar(page: import('@playwright/test').Page) {
  const itemId = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (bar.classList.contains('fg-bar-bracket')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
      return bar.getAttribute('data-item-id');
    }
    return null;
  });
  expect(itemId).not.toBeNull();
  return page.locator(`#gantt .fg-bar[data-item-id="${itemId}"]`);
}

/** The first grid row whose Entry draws more than one bar, found at test time. The demo dataset
 *  gives one Entry several Segments, and a fixed row packs them all onto one line. */
async function rowWithSeveralBars(page: import('@playwright/test').Page): Promise<string> {
  const entryId = await page.evaluate(() => {
    const root = document.querySelector('#gantt');
    if (root === null) return null;
    for (const row of Array.from(root.querySelectorAll<HTMLElement>('.fg-row[data-entry-id]'))) {
      const id = row.dataset['entryId'];
      if (id === undefined) continue;
      if (root.querySelectorAll(`.fg-bar[data-item-id^="${id}:"]`).length > 1) return id;
    }
    return null;
  });
  expect(entryId).not.toBeNull();
  return entryId!;
}

/** A bar of one Entry the pointer can really land on: scrolled into view, and the topmost element
 *  at its own click point. Segments can overlap, so the second check earns its keep.
 *
 *  Centered, not `scrollIntoViewIfNeeded()`: a bar already at the pane's bottom edge leaves no room
 *  below it for a right-click menu, and opening one there re-triggers a real defect (`Popup`'s
 *  `focus: 'trap'` calls the focus-trapped item's plain `.focus()` with no `preventScroll`, which
 *  can scroll the pane to keep that item visible and the popup's own `dismissOn: 'scroll'` then
 *  closes the menu it just opened — filed for `src/extensions/popup.ts`/`focus-trap.ts`, not a
 *  timing race this file can wait out). Centering the bar first sidesteps the edge case; it does
 *  not fix it. */
async function pickableBarOf(page: import('@playwright/test').Page, entryId: string) {
  const bars = page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`);
  const count = await bars.count();
  for (let index = 0; index < count; index++) {
    const bar = bars.nth(index);
    await bar.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const landsOnIt = await bar.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = Math.min(rect.left + 12, rect.right - 2);
      const at = document.elementFromPoint(x, rect.top + rect.height / 2);
      return at !== null && el.contains(at);
    });
    if (landsOnIt) return bar;
  }
  throw new Error(`no bar of ${entryId} is under the pointer`);
}

/** Which bars of one Entry carry the `selected` token right now, by Item id. */
async function selectedBarIds(page: import('@playwright/test').Page, entryId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const bars = document.querySelectorAll<HTMLElement>(`#gantt .fg-bar[data-item-id^="${id}:"]`);
    return Array.from(bars)
      .filter((bar) => (bar.dataset['state'] ?? '').split(' ').includes('selected'))
      .map((bar) => bar.dataset['itemId'] ?? '');
  }, entryId);
}

/** `data-state` is a token list — the assertion asks for the token, never for the whole string. */
async function barStates(page: import('@playwright/test').Page, entryId: string): Promise<string[]> {
  return page.evaluate((id) => {
    const bars = document.querySelectorAll<HTMLElement>(`#gantt .fg-bar[data-item-id^="${id}:"]`);
    return Array.from(bars, (bar) => bar.dataset['state'] ?? '');
  }, entryId);
}

/** `count` distinct bars a real pointer can land on — the same criteria as `unobstructedBar`, so a
 *  right-click test can build a multi-bar Selection without naming any fixture bar by id. */
async function unobstructedBars(page: import('@playwright/test').Page, count: number) {
  const itemIds = await page.evaluate((wanted) => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return [];
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? pane.getBoundingClientRect().top;
    const paneRect = pane.getBoundingClientRect();
    const found: string[] = [];
    for (const bar of Array.from(pane.querySelectorAll<HTMLElement>('.fg-bar'))) {
      if (found.length >= wanted) break;
      if (bar.classList.contains('fg-bar-bracket')) continue;
      const rect = bar.getBoundingClientRect();
      if (rect.top < headerBottom + 1) continue;
      if (rect.bottom > paneRect.bottom) continue;
      if (rect.right < paneRect.left || rect.left > paneRect.right) continue;
      if (rect.width <= 8 || rect.height <= 8) continue;
      const x = Math.min(rect.left + 12, rect.right - 2);
      const y = rect.top + rect.height / 2;
      const atPoint = document.elementFromPoint(x, y);
      if (atPoint === null || !bar.contains(atPoint)) continue;
      const id = bar.getAttribute('data-item-id');
      if (id !== null) found.push(id);
    }
    return found;
  }, count);
  expect(itemIds.length).toBe(count);
  return itemIds.map((id) => page.locator(`#gantt .fg-bar[data-item-id="${id}"]`));
}

/** Zooms the timeline to the one multi-Segment Entry's own span, found at test time from the
 *  public Dataset. `panToToday()` (`harness/main.ts`) otherwise leaves two of its three Segments
 *  outside the time window, so `rowWithSeveralBars` finds a row but sees only one bar in it. */
async function showSegmentedSpan(page: import('@playwright/test').Page): Promise<void> {
  const entryId = await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    if (entry === undefined) throw new Error('the dataset has no multi-segment entry');
    window.__gantt.zoomToSpan({ start: entry.start, end: entry.end });
    return String(entry.id);
  });
  await expect(page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`).nth(1)).toBeVisible();
}

/** Opens the entry menu for `bar` and returns the menu item for `commandId`, visible and ready. */
async function openEntryMenu(bar: import('@playwright/test').Locator, commandId: string) {
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.page().mouse.click(box!.x + 12, box!.y + box!.height / 2, { button: 'right' });
  const item = bar.page().locator(`.fg-menu-item[data-command="${commandId}"]`);
  await expect(item).toBeVisible();
  return item;
}

/** A pointer click on a freshly opened menu item was seen to time out ("element was detached from
 *  the DOM, retrying") although the locator had already resolved to a real button. Reading the
 *  live element at click time avoids the race the popup's own reflow creates. */
async function clickMenuItem(item: import('@playwright/test').Locator): Promise<void> {
  await item.evaluate((el) => (el as HTMLElement).click());
}

/** A point inside the timeline pane, below its sticky header, that lands on no bar — found by
 *  scanning the rendered pane instead of naming a fixture coordinate (rule 3, browser-tests skill). */
async function emptyTimelinePoint(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane');
    if (pane === null) return null;
    const rect = pane.getBoundingClientRect();
    const header = pane.querySelector('.fg-header');
    const headerBottom = header?.getBoundingClientRect().bottom ?? rect.top;
    const STEP = 15;
    for (let y = headerBottom + 5; y < rect.bottom - 5; y += STEP) {
      for (let x = rect.left + 5; x < rect.right - 5; x += STEP) {
        const el = document.elementFromPoint(x, y);
        if (el === null || !pane.contains(el)) continue;
        if (el.closest('.fg-bar') !== null) continue;
        return { x, y };
      }
    }
    return null;
  });
  expect(point).not.toBeNull();
  return point!;
}

test('a grid-row click paints every bar of that row (#185)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await showSegmentedSpan(page);

  const entryId = await rowWithSeveralBars(page);
  const row = page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`);
  // A cell past the label cell: the twisty lives in the label cell, and a twisty click collapses
  // the row instead of selecting it.
  await row.locator('.fg-row-cell').first().click();

  await expect
    .poll(async () =>
      (await barStates(page, entryId)).every((state) => state.split(' ').includes('selected')),
    )
    .toBe(true);
});

test('a bar click paints that bar alone; the grid row still paints them all (#185)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await showSegmentedSpan(page);

  const entryId = await rowWithSeveralBars(page);
  const bar = await pickableBarOf(page, entryId);
  const itemId = (await bar.getAttribute('data-item-id'))!;
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });

  // The pointer named one bar of a row that draws several, so the paint runs that far only.
  await expect.poll(async () => selectedBarIds(page, entryId)).toEqual([itemId]);
  // The Selection holds one Segment (ADR 0010), and the row paints selected because it owns that
  // Segment — a row paints selected when the Selection holds any Segment of any Entry it owns.
  const row = page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`);
  await expect(row).toHaveAttribute('data-state', /\bselected\b/);

  // A click in the grid pane names a row, not a bar, so the whole Entry paints again.
  await row.locator('.fg-row-cell').first().click();
  await expect
    .poll(async () =>
      (await barStates(page, entryId)).every((state) => state.split(' ').includes('selected')),
    )
    .toBe(true);
});

test('a selected bar keeps its paint when it remounts after a scroll (#185)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const itemId = (await bar.getAttribute('data-item-id'))!;
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  await expect(bar).toHaveAttribute('data-state', /\bselected\b/);

  const pane = page.locator('#gantt .fg-timeline-pane');
  const scrolledLeft = await pane.evaluate((el) => el.scrollLeft);
  await pane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(page.locator(`#gantt .fg-bar[data-item-id="${itemId}"]`)).toHaveCount(0);

  await pane.evaluate((el, left) => {
    el.scrollLeft = left;
  }, scrolledLeft);
  const remounted = page.locator(`#gantt .fg-bar[data-item-id="${itemId}"]`);
  await expect(remounted).toHaveCount(1);
  await expect(remounted).toHaveAttribute('data-state', /\bselected\b/);
});

test('clicking a bar does not highlight bar or page text', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.click({ position: { x: 12, y: box!.height / 2 } });
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a bar does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = await unobstructedBar(page);
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  await bar.dblclick({ position: { x: 12, y: box!.height / 2 } });
  expect(await nativeHighlight(page)).toBe('');
});

test('double-clicking a row label does not highlight text from the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const label = page.locator('#gantt .fg-row-label').first();
  await expect(label).toBeVisible();
  await label.dblclick();
  expect(await nativeHighlight(page)).toBe('');
});

test('a right-click keeps a multi-bar Selection when it lands inside it, and clears it on an empty timeline miss (#199/#205)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bars = await unobstructedBars(page, 2);
  const firstBar = bars[0]!;
  const secondBar = bars[1]!;
  const firstBox = await firstBar.boundingBox();
  const secondBox = await secondBar.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  await firstBar.click({ position: { x: 12, y: firstBox!.height / 2 } });
  await secondBar.click({ position: { x: 12, y: secondBox!.height / 2 }, modifiers: ['Control'] });

  const readout = page.locator('#selection-readout');
  const bothSelected = await readout.textContent();
  expect(bothSelected).toContain(',');

  // A right-click on a bar that is part of the Selection leaves the Selection untouched (#199).
  await page.mouse.click(secondBox!.x + 12, secondBox!.y + secondBox!.height / 2, { button: 'right' });
  await expect(readout).toHaveText(bothSelected!);
  await page.keyboard.press('Escape'); // close the menu the right-click opened

  // A right-click on an empty timeline point still clears the Selection (#199/#205 follow-up).
  const empty = await emptyTimelinePoint(page);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await expect(readout).toHaveText('Selection: (none)');
});

test('a right-click Delete on one bar removes that bar alone; Lock reaches the record (#212)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await showSegmentedSpan(page);

  const entryId = await rowWithSeveralBars(page);
  const bars = page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`);
  const barsBefore = await bars.count();

  const bar = await pickableBarOf(page, entryId);
  const deleteItem = await openEntryMenu(bar, 'freegantt.deleteSelection');
  await clickMenuItem(deleteItem);

  // The Segment picked is gone; the other two, and the Entry's row, are not (#212 table row 1).
  await expect.poll(() => bars.count()).toBe(barsBefore - 1);
  await expect(page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`)).toBeVisible();

  const remaining = await pickableBarOf(page, entryId);
  const lockItem = await openEntryMenu(remaining, 'demo.lockEntry');
  await clickMenuItem(lockItem);

  // Lock reads `entryIds`: it names the record, not the one Segment the menu opened on (table row 3).
  await expect(page.locator('#log')).toContainText(`entries · ${entryId} · locked`);
});

test('a right-click Delete on the grid row removes the row; Lock reaches the record (#212)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await showSegmentedSpan(page);

  const entryId = await rowWithSeveralBars(page);
  const row = page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`);
  // A cell past the label cell: the twisty lives in the label cell, and a twisty click collapses
  // the row instead of opening its menu.
  const rowCell = row.locator('.fg-row-cell').nth(1);
  const cellBox = await rowCell.boundingBox();
  expect(cellBox).not.toBeNull();
  await page.mouse.click(cellBox!.x + 12, cellBox!.y + cellBox!.height / 2, { button: 'right' });
  const deleteItem = page.locator('.fg-menu-item[data-command="freegantt.deleteSelection"]');
  await expect(deleteItem).toBeVisible();
  await clickMenuItem(deleteItem);

  // Deleting from the row removes every Segment the row owns, so the Entry, and its row, go too
  // (#212 table row 2) — no special case for "the row's last Segment".
  await expect(row).toHaveCount(0);
  await expect(page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await showSegmentedSpan(page);
  const reloadedEntryId = await rowWithSeveralBars(page);
  const reloadedRow = page.locator(`#gantt .fg-row[data-entry-id="${reloadedEntryId}"]`);
  const reloadedCellBox = await reloadedRow.locator('.fg-row-cell').nth(1).boundingBox();
  expect(reloadedCellBox).not.toBeNull();
  await page.mouse.click(reloadedCellBox!.x + 12, reloadedCellBox!.y + reloadedCellBox!.height / 2, {
    button: 'right',
  });
  const lockItem = page.locator('.fg-menu-item[data-command="demo.lockEntry"]');
  await expect(lockItem).toBeVisible();
  await clickMenuItem(lockItem);

  // Lock reads `entryIds` on the row path too: the whole record locks (#212 table row 4).
  await expect(page.locator('#log')).toContainText(`entries · ${reloadedEntryId} · locked`);
});
