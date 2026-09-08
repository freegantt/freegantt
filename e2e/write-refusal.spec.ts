import { test, expect, type Locator, type Page } from '@playwright/test';

// #256: one answer decides whether a cell's value may change, and every writer asks it — the inline
// cell editor, the bar's two resize handles, and the bar move. A unit test can prove the resolution
// agrees with itself. Only a browser can prove the wiring does: that the handle a real engine paints
// is the same edge a real drag is allowed to write. That gap is what #256 filed, and #255 is the
// reason it matters — the one regression #142's own merge produced was invisible to `pnpm verify`
// and caught only here.
//
// `/`'s own page pins one row's finish date (`harness/main.ts`). It refuses that row's `end`, and
// nothing else on the page, so the resize demo the same page exists for keeps working.

declare global {
  interface Window {
    __dataset: import('../src/api/index.js').Dataset<{ cost: number }, { cost: number }>;
    __gantt: import('../src/api/index.js').Gantt;
    __fixedFinishEntryId: string;
  }
}

/** Opens `/` and brings the pinned row into view. The page names which row it pinned, so this file
 *  hardcodes no fixture row — a fixture edit moves the pin and every test below follows it. Only the
 *  windowed rows reach the DOM (I3), so the row is revealed through the public `gantt.reveal` rather
 *  than searched for among whatever happens to be painted. */
async function openPinnedRow(page: Page): Promise<{ bar: Locator; entryId: string }> {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const entryId = await page.evaluate(() => {
    window.__gantt.reveal(window.__dataset.entries.get(window.__fixedFinishEntryId)!.id);
    return window.__fixedFinishEntryId;
  });
  const bar = page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`).first();
  await expect(bar).toBeVisible();
  return { bar, entryId };
}

/** The committed span, read back through the public Dataset — the ground truth for what a drag
 *  wrote, as opposed to what a bar's own (possibly stale) box reports. */
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

  // The start edge writes `start` alone, which this row never pinned, so its handle still paints.
  // That is the half that makes this a real refusal rather than a dead row.
  await expect(page.locator('.fg-bar-handle[data-edge="start"]')).toBeVisible();
  await expect(page.locator('.fg-bar-handle[data-edge="end"]')).toBeHidden();
});

test('a drag at a pinned end edge commits nothing', async ({ page }) => {
  const { bar, entryId } = await openPinnedRow(page);
  const before = await committedSpan(page, entryId);
  const box = (await bar.boundingBox())!;

  // Drags from the bar's own visible right edge, not from a handle's box — a user grabs the edge
  // they can see. Here there is no handle to grab at all, which is the point: the drag must find
  // nothing to arm, rather than arm a move that writes the pinned date anyway.
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
  // bar's own width, which clears the preset's snap unit at any zoom this page opens at — a drag
  // that snaps back to the day it started on commits nothing, and would look exactly like the three
  // refusals above, so this control would then prove nothing.
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
