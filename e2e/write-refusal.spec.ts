import { test, expect, type Locator, type Page } from '@playwright/test';

// #256: one answer decides whether a cell's value may change. Every writer asks it: the inline cell
// editor, the bar's two resize handles, and the bar move.
//
// A unit test proves the resolution agrees with itself. Only a browser proves the wiring does. The
// handle a real engine paints must be the same edge a real drag may write. That gap is what #256
// filed. #255 is why it matters: the one regression #142's own merge produced never reached
// `pnpm verify`, and only the browser suite caught it.
//
// `/` pins one row's finish date (`harness/main.ts`). It refuses that row's `end` and nothing else,
// so the resize demo the same page exists for keeps working.

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
    __fixedFinishEntryId: string;
  }
}

/** Opens `/` and brings the pinned row into view. The page names which row it pinned, so this file
 *  hardcodes no fixture row. A fixture edit moves the pin, and every test below follows it.
 *
 *  Only the windowed rows reach the DOM (I3). So this reveals the row through the public
 *  `gantt.reveal`, rather than search whatever happens to be painted. */
async function openPinnedRow(page: Page): Promise<{ bar: Locator; entryId: string }> {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const entryId = await page.evaluate(() => {
    window.__gantt.reveal(window.__dataset.entries.get(window.__fixedFinishEntryId)!.id);
    return window.__fixedFinishEntryId;
  });
  const bar = page.locator(`#gantt .fg-bar[data-bar-id^="${entryId}:"]`).first();
  await expect(bar).toBeVisible();
  return { bar, entryId };
}

/** The committed span, read back through the public Dataset. It is the ground truth for what a drag
 *  wrote. A bar's own box can be stale, and reports geometry rather than a write. */
async function committedSpan(page: Page, entryId: string): Promise<{ start: number; end: number }> {
  return page.evaluate((id) => {
    const entry = window.__dataset.entries.get(id)!;
    return { start: Number(entry.start), end: Number(entry.end) };
  }, entryId);
}

async function hover(page: Page, bar: Locator): Promise<void> {
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test('a pinned end paints no end handle, and still paints the start handle', async ({ page }) => {
  const { bar } = await openPinnedRow(page);

  await hover(page, bar);

  // The start edge writes `start` alone, and this row never pinned that. So its handle still
  // paints. That half is what makes this a real refusal rather than a dead row.
  await expect(page.locator('.fg-bar-handle[data-edge="start"]')).toBeVisible();
  await expect(page.locator('.fg-bar-handle[data-edge="end"]')).toBeHidden();
});

test('a drag at a pinned end edge commits nothing', async ({ page }) => {
  const { bar, entryId } = await openPinnedRow(page);
  const before = await committedSpan(page, entryId);
  const box = (await bar.boundingBox())!;

  // Drags from the bar's own visible right edge, not from a handle's box. A user grabs the edge
  // they can see. Here no handle exists to grab, which is the point. The drag must find nothing to
  // arm, rather than arm a move that writes the pinned date anyway.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  expect(await committedSpan(page, entryId)).toEqual(before);
});

test('a bar move is refused too, because a move writes the pinned date as well', async ({ page }) => {
  const { bar, entryId } = await openPinnedRow(page);
  const before = await committedSpan(page, entryId);
  const box = (await bar.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  expect(await committedSpan(page, entryId)).toEqual(before);
});

test('the start edge of a pinned row still resizes and commits', async ({ page }) => {
  const { bar, entryId } = await openPinnedRow(page);
  const before = await committedSpan(page, entryId);
  const box = (await bar.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x, box.y + box.height / 2);
  await page.mouse.down();
  // Inward, the same direction `resize.spec.ts` drags a start edge. The delta is a third of the
  // bar's own width. That clears the preset's snap unit at any zoom this page opens at.
  //
  // A smaller drag can snap back to the day it started on and commit nothing. That looks exactly
  // like the three refusals above, and this control would then prove nothing.
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const after = await committedSpan(page, entryId);
  expect(after.start).toBeGreaterThan(before.start);
  expect(after.end).toBe(before.end);
});

test('a pinned cell refuses the inline editor, and its neighbour still opens one', async ({ page }) => {
  const { entryId } = await openPinnedRow(page);
  const row = page.locator(`#gantt .fg-grid-pane [data-entry-id="${entryId}"]`).first();
  await expect(row).toBeVisible();

  await row.locator('[data-field="end"]').first().dblclick();
  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(0);

  // The same row's Start is untouched, so the page proves the refusal is one cell wide.
  await row.locator('[data-field="start"]').first().dblclick();
  await expect(page.locator('#gantt .fg-cell-editor')).toHaveCount(1);
});

// The other half of the same answer, and the blunt one: `/data.html` closes End for the whole
// Dataset through the core-Field override #142 shipped (`fields: [{ key: 'end', editable: 'api' }]`).
// That path had no harness call site at all until #256, and no browser ever drove it. The page's own
// Move buttons still shift the date, which is what `'api'` means and why that page can hold it
// (ADR 0015).
test('a Field closed to the grid closes the end handle on every row', async ({ page }) => {
  await page.goto('/data.html');
  const bars = page.locator('#gantt .fg-bar');
  await expect(bars.first()).toBeVisible();

  // Hover each painted bar in turn: one row that still offered an end handle would fail this.
  for (let i = 0; i < (await bars.count()); i++) {
    const box = await bars.nth(i).boundingBox();
    if (box === null) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.fg-bar-handle[data-edge="end"]')).toBeHidden();
  }
});

// ADR 0015, the other door: `entries.update()` reads the same `Field.editable` the grid reads, at a
// lower threshold. `/data.html` declares both states the two thresholds tell apart — `contractId` is
// `editable: false` (a lock, refused at every door), and End is `'api'` (the Move buttons write it;
// no cell and no handle do).
//
// A unit test proves the resolver agrees with itself. Only a browser proves the page a consumer
// really writes gets the same two answers.
test("entries.update() refuses a locked Field, and writes an 'api' one", async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const locked = await page.evaluate(() => {
    const dataset = window.__dataset as import('freegantt').Dataset<{ contractId?: string }>;
    try {
      dataset.entries.update('task-a', { contractId: 'C-0000' });
      return 'wrote it';
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown error';
    }
  });
  expect(locked).toBe('field-not-editable');

  // The same page's End cell is dead, and this write still lands: that is the whole of `'api'`.
  const end = await page.evaluate(() => {
    window.__dataset.entries.update('task-a', { end: '2026-01-25' });
    return Number(window.__dataset.entries.get('task-a')!.end);
  });
  expect(end).toBe(Date.parse('2026-01-26T00:00:00Z'));
});
