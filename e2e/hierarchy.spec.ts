import { test, expect } from '@playwright/test';

// S4.11 (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md §2): hierarchy.html exercises tree
// collapse, live row-source re-resolution, pack-mode heights, segmented drag + undo, and tree keyboard.

async function gotoHierarchy(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/hierarchy.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();
}

function timelinePane(page: import('@playwright/test').Page) {
  return page.locator('#gantt .fg-timeline-pane');
}

async function gotoHierarchyShort(page: import('@playwright/test').Page): Promise<void> {
  await gotoHierarchy(page);
  const pane = timelinePane(page);
  await page.locator('#gantt').evaluate((el) => {
    (el as HTMLElement).style.height = '220px';
  });
  // 220px is the demo short pane; wait until layout has applied it, then scroll to the bottom.
  await expect.poll(async () => pane.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(220);
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
}

async function entryWithSegments(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    return entry === undefined ? undefined : String(entry.id);
  });
  if (id === undefined) throw new Error('the dataset has no multi-segment entry');
  return id;
}

function barsForEntry(page: import('@playwright/test').Page, entryId: string) {
  return page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`);
}

/** The left edge of every bar the locator matches, in DOM order — what a rigid drag shifts by one
 *  and the same delta (#200). */
async function barLefts(bars: import('@playwright/test').Locator): Promise<number[]> {
  const count = await bars.count();
  const lefts: number[] = [];
  for (let index = 0; index < count; index++) {
    const box = await bars.nth(index).boundingBox();
    expect(box).not.toBeNull();
    lefts.push(box!.x);
  }
  return lefts;
}

async function showSegmentedSpan(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    if (entry === undefined) throw new Error('the dataset has no multi-segment entry');
    window.__gantt.zoomToSpan({ start: entry.start, end: entry.end });
  });
  const entryId = await entryWithSegments(page);
  await expect(barsForEntry(page, entryId).nth(1)).toBeVisible();
}

async function dragBarBy(
  page: import('@playwright/test').Page,
  bar: import('@playwright/test').Locator,
  dx: number,
): Promise<void> {
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + Math.min(box!.width / 2, 20);
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

async function rowIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator('#gantt .fg-row')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['rowId'] ?? ''));
}

test('twisty collapses a subtree and aria-expanded flips', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  await expect(childRow).toBeVisible();
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();

  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);
});

test('[S4-A3] switching row source changes the row set and keeps the scroll offset', async ({ page }) => {
  await gotoHierarchyShort(page);

  const pane = timelinePane(page);
  await page.click('#expand-all-btn');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  const before = await pane.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const treeIds = await rowIds(page);

  await page.selectOption('#rows-mode', 'grouped');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
  await expect.poll(async () => rowIds(page)).not.toEqual(treeIds);

  await page.selectOption('#rows-mode', 'tree');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
});

test('pack mode grows a packed row and shifts the rows below', async ({ page }) => {
  await gotoHierarchyShort(page);

  const entryId = await entryWithSegments(page);
  const packedRow = page.locator(`.fg-row[data-row-id="${entryId}"]`);
  const beforePacked = await packedRow.boundingBox();
  expect(beforePacked).not.toBeNull();

  const rows = page.locator('#gantt .fg-row');
  const count = await rows.count();
  let below: import('@playwright/test').Locator | undefined;
  for (let i = 0; i < count; i++) {
    const box = await rows.nth(i).boundingBox();
    if (box !== null && box.y > beforePacked!.y + beforePacked!.height - 1) {
      below = rows.nth(i);
      break;
    }
  }
  expect(below).toBeDefined();
  const beforeBelow = await below!.boundingBox();
  expect(beforeBelow).not.toBeNull();

  await page.selectOption('#height-mode', 'pack');

  await expect
    .poll(async () => {
      const afterPacked = await packedRow.boundingBox();
      return afterPacked !== null && afterPacked.height > beforePacked!.height;
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const afterBelow = await below!.boundingBox();
      return afterBelow !== null && afterBelow.y > beforeBelow!.y;
    })
    .toBe(true);
});

test('a segment drag moves one bar and Undo restores it', async ({ page }) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const bar = bars.nth(1);
  const sibling = bars.first();
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  const siblingBefore = await sibling.boundingBox();
  expect(before).not.toBeNull();
  expect(siblingBefore).not.toBeNull();

  // #211: a click names the bar the pointer landed on — that bar is the pick, and only a pick's own
  // Segment moves on the drag that follows. The three Segments overlap at this zoom, so the click
  // goes through the mouse directly — a locator `click()` refuses to act while a sibling bar of the
  // same Entry sits over the target's own centre.
  await page.mouse.click(before!.x + Math.min(before!.width / 2, 20), before!.y + before!.height / 2);
  await dragBarBy(page, bar, 120);

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after !== null && Math.abs(after.x - before!.x) > 8;
    })
    .toBe(true);

  const siblingAfter = await sibling.boundingBox();
  expect(siblingAfter).not.toBeNull();
  expect(Math.abs(siblingAfter!.x - siblingBefore!.x)).toBeLessThan(2);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await bar.boundingBox();
      return restored !== null && Math.abs(restored.x - before!.x);
    })
    .toBeLessThan(2);
});

test('a row click paints and moves every bar of the entry, and one Undo restores them all', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  await expect(bars.nth(1)).toBeVisible();
  expect(await bars.count()).toBe(3);
  const before = await barLefts(bars);

  // #211: a grid-row click selects the whole Entry with no pick — every Segment paints selected, so
  // the drag that follows steps every Segment by the same delta (D-S3-19).
  const row = page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`);
  await row.locator('.fg-row-cell').first().click();
  await dragBarBy(page, bars.nth(1), 120);

  await expect
    .poll(async () => {
      const after = await barLefts(bars);
      return after.every((x, index) => Math.abs(x - before[index]!) > 8);
    })
    .toBe(true);

  const moved = await barLefts(bars);
  const deltas = moved.map((x, index) => x - before[index]!);
  expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(2);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await barLefts(bars);
      return Math.max(...restored.map((x, index) => Math.abs(x - before[index]!)));
    })
    .toBeLessThan(2);
});

test('the handle pair brackets the whole entry and the start handle grows its first bar', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const first = bars.first();
  const last = bars.nth(2);
  // #211: hovering the bar shows the handle pair with no pick recorded for the Entry, so the pair
  // brackets the envelope — a click here would instead pick this one bar and narrow the pair to it
  // alone (see the picked-bar unit coverage in render/dom/index.test.ts).
  const hoverBox = (await last.boundingBox())!;
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);

  // The entry is wider than the pane, so its earliest bar starts left of the pane's own edge. Pan
  // right-to-left until that bar — and the start handle on it — sits inside the pane.
  await timelinePane(page).evaluate((el) => {
    el.scrollLeft -= 400;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await bars.first().boundingBox())!.x).toBeGreaterThan(600);

  const startHandle = page.locator('#gantt .fg-bar-handle[data-edge="start"]');
  const endHandle = page.locator('#gantt .fg-bar-handle[data-edge="end"]');
  await expect(startHandle).toBeVisible();
  await expect(endHandle).toBeVisible();

  // #211: with no pick, a resize acts on the Entry's envelope, so the pair straddles all three bars.
  const firstBefore = (await first.boundingBox())!;
  const lastBefore = (await last.boundingBox())!;
  const startBox = (await startHandle.boundingBox())!;
  const endBox = (await endHandle.boundingBox())!;
  expect(Math.abs(startBox.x + startBox.width / 2 - firstBefore.x)).toBeLessThan(6);
  expect(Math.abs(endBox.x + endBox.width / 2 - (lastBefore.x + lastBefore.width))).toBeLessThan(6);

  // Drag the start handle back: it moves the earliest Segment's start, nothing else.
  const grabX = startBox.x + startBox.width / 2;
  const grabY = startBox.y + startBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX - 60, grabY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const firstAfter = await first.boundingBox();
      return firstAfter !== null && firstAfter.width - firstBefore.width;
    })
    .toBeGreaterThan(8);

  // Only the earliest Segment grew: the latest one sits exactly where it did.
  const lastAfter = (await last.boundingBox())!;
  expect(Math.abs(lastAfter.x - lastBefore.x)).toBeLessThan(2);
  expect(Math.abs(lastAfter.width - lastBefore.width)).toBeLessThan(2);
});

test('ArrowRight expands and ArrowLeft collapses; focus stays on the Gantt', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);

  const ganttRoot = page.locator('#gantt');
  const parentId = await parentRow.getAttribute('data-row-id');
  expect(parentId).toBeTruthy();
  await page.locator(`#gantt .fg-bar[data-item-id^="${parentId}:"]`).first().click();
  await ganttRoot.focus();
  await expect(ganttRoot).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toBeVisible();
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  await expect(ganttRoot).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);
  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(ganttRoot).toBeFocused();
});
