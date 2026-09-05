import { test, expect } from '@playwright/test';

// The literal repro for #8: "Load the harness, resize the browser window: the timeline does not
// re-fit." happy-dom cannot express this — it lays out nothing, so its ResizeObserver never
// fires (proven in src/view/pane-size-attachment.test.ts, which is why that suite injects a fake).
// Only a real engine can prove attachPaneSize actually reaches the browser's own resize signal.

// `frame.contentWidth` is not exposed directly, but the content sizer (render/dom/index.ts) is
// translated to `contentWidth - 1` (S1.8, D-S1.8-1/D-S1.8-2 — no gutter added to the timeline pane's
// content any more) and is otherwise invisible — reading its actual painted right edge (via
// `getBoundingClientRect`, relative to the pane's own left edge) is the least invasive way to read
// the fitted content width from outside the library. This avoids parsing the `transform` string
// directly, which breaks silently if the library ever changes how it expresses the same offset
// (a second translate, `matrix()`, a different unit). It now lives inside `.fg-timeline-pane`, not
// directly under `#gantt` (the grid pane is a sibling that carries no sizer of its own).
async function contentSizerRight(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const pane = document.querySelector('.fg-timeline-pane')!;
    const sizer = Array.from(pane.children).find(
      (el) => el instanceof HTMLElement && el.getAttribute('aria-hidden') === 'true',
    ) as HTMLElement;
    const paneRect = pane.getBoundingClientRect();
    const sizerRect = sizer.getBoundingClientRect();
    return sizerRect.right - paneRect.left;
  });
}

async function dragSplitterBy(page: import('@playwright/test').Page, deltaX: number): Promise<void> {
  const splitter = page.locator('.fg-splitter');
  const box = await splitter.boundingBox();
  if (!box) throw new Error('splitter has no box');
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, y, { steps: 5 });
  await page.mouse.up();
}

test('resizing the window re-fits the axis (#8)', async ({ page }) => {
  // Both widths wide enough that the sample dataset's day-preset density floor (S1.12,
  // D-S1.12-2/3) does not clamp fitDataset's pxPerMs at either end — a floored pane doesn't move
  // its content edge on resize by design (the point of the floor is to scroll instead of squish),
  // so a resize test has to stay above that floor to observe a re-fit at all. The full demo dataset
  // spans ~83 days at dayPreset's minTickWidthPx of 96 (raised from 32 in the header readability
  // follow-up, finding 5), so the floor itself is ~7968px — these widths were measured directly
  // against the running harness to confirm both clear it (below it, per commit f2ab918, the pane
  // stops re-fitting on resize by design and this test would no longer be testing what it says).
  await page.setViewportSize({ width: 8600, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await contentSizerRight(page);
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 9600, height: 800 });
  // The resize observation is queued by the browser, not synchronous with setViewportSize.
  await expect.poll(async () => contentSizerRight(page), { timeout: 2000 }).not.toBe(before);

  const after = await contentSizerRight(page);
  // fitDataset: content ends exactly at the timeline pane's own right edge, in both sizes.
  const paneWidth = await page.locator('.fg-timeline-pane').evaluate((el) => el.clientWidth);
  expect(Math.abs(after - paneWidth)).toBeLessThan(2);
});

// #139: dragging the splitter to the right used to open dead space beside the last column, because
// nothing capped the grid pane at its own content. The drag now stops at the last column's right
// edge — the pane can still be dragged narrower, and the columns then overflow and scroll (#126).
test('the splitter stops at the last column instead of opening dead space (#139)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const columnsWidth = await page
    .locator('#gantt .fg-col-header')
    .evaluateAll((cells) => cells.reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0));
  const gridPane = page.locator('#gantt .fg-grid-pane');
  const paneWidth = async (): Promise<number> => gridPane.evaluate((el) => el.clientWidth);

  // The page asks for `gridWidth: 'fitColumns'` (#157), so the pane opens on its columns' edge
  // before the first paint rather than on a number the page hand-computed.
  expect(await paneWidth()).toBe(columnsWidth);

  // Narrower is always legal: the columns overflow and the pane scrolls to reach them (#126).
  await dragSplitterBy(page, -200);
  expect(await paneWidth()).toBeLessThan(columnsWidth);
  expect(await gridPane.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);

  // Dragging back out stops hard against the columns' edge, not 600px past it.
  await dragSplitterBy(page, 600);
  expect(await paneWidth()).toBe(columnsWidth);
  expect(await gridPane.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
});

// #157: `gridWidth: 'fitColumns'` is a standing instruction, not a width read once. The harness
// toggles its Budget column at runtime, which is the honest test — a real column set changing under
// a pane that was never told a number.
test("'fitColumns' re-measures when the column set changes (#157)", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const gridPane = page.locator('#gantt .fg-grid-pane');
  const paneWidth = async (): Promise<number> => gridPane.evaluate((el) => el.clientWidth);
  const columnsWidth = async (): Promise<number> =>
    page
      .locator('#gantt .fg-col-header')
      .evaluateAll((cells) => cells.reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0));

  const withBudget = await paneWidth();
  expect(withBudget).toBe(await columnsWidth());

  await page.locator('#toggle-budget-btn').click();
  await expect.poll(paneWidth, { timeout: 2000 }).toBeLessThan(withBudget);
  expect(await paneWidth()).toBe(await columnsWidth());

  await page.locator('#toggle-budget-btn').click();
  await expect.poll(paneWidth, { timeout: 2000 }).toBe(withBudget);
});

// U1/U4 (plans/s1.8-pane-layout/README.md §0): dragging the splitter moves both panes live, and
// re-fits the time axis with no reload and no explicit render()/setPaneSize() call from the test —
// the timeline pane's own ResizeObserver is the only thing that has to fire.
test('dragging the splitter re-fits the axis with no other call (U4)', async ({ page }) => {
  // Wide enough that the pane stays above the S1.12 density floor (see the #8 test above) both
  // before and after the 120px drag — otherwise the content edge legitimately does not move.
  await page.setViewportSize({ width: 8800, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const gridWidthBefore = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);
  const contentRightBefore = await contentSizerRight(page);

  // Drags left: this page's grid pane already sits at its columns' own edge, and #139 will not let
  // a drag take it past that, so leftward is the direction that still moves it.
  await dragSplitterBy(page, -120);

  const gridWidthAfter = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);
  expect(gridWidthAfter).toBeLessThan(gridWidthBefore);

  // The timeline pane grew, so fitDataset re-fits pxPerMs up — the sizer's right edge moves
  // with no call this test made beyond the drag itself.
  await expect.poll(async () => contentSizerRight(page), { timeout: 2000 }).not.toBe(contentRightBefore);

  const paneWidthAfter = await page.locator('.fg-timeline-pane').evaluate((el) => el.clientWidth);
  const contentRightAfter = await contentSizerRight(page);
  expect(Math.abs(contentRightAfter - paneWidthAfter)).toBeLessThan(2);
});

// U1: both panes stay pixel-aligned during and after a drag, not just before it (I9) — the grid
// pane's row layer and the timeline pane's bars both read `top`/`y` from the same `frame.rows`, so a
// drag that changes only horizontal geometry must never disturb that vertical agreement.
test('both panes stay pixel-aligned after a splitter drag (U1)', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await dragSplitterBy(page, -80);

  // Matched by entry id, not by array position/count: the row layer windows purely on vertical
  // scroll, but the bar layer also culls on the horizontal viewport (S1.12's density floor,
  // D-S1.12-2/3, routinely makes fitDataset's content wider than the pane for this dataset, so
  // some visible rows legitimately have no bar in view right now). I9 only claims that a row and
  // its OWN entry's bar agree in y — not that every row has a bar. Positions come from
  // `getBoundingClientRect()`, not a parsed `transform` string, so this survives the library
  // changing how it expresses the same offset.
  const pairs = await page.evaluate(() => {
    const rowTopByEntryId = new Map<string, number>();
    for (const row of Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'))) {
      const rowId = row.dataset['rowId'];
      const entryId = rowId;
      if (entryId) rowTopByEntryId.set(entryId, row.getBoundingClientRect().top);
    }
    const matched: Array<{ entryId: string; rowTop: number; barTop: number }> = [];
    for (const bar of Array.from(document.querySelectorAll<HTMLElement>('.fg-timeline-pane .fg-bar'))) {
      const itemId = bar.dataset['itemId']; // "<entryId>:<segmentIndex>"
      const entryId = itemId?.split(':')[0];
      const rowTop = entryId ? rowTopByEntryId.get(entryId) : undefined;
      if (entryId && rowTop !== undefined) {
        matched.push({ entryId, rowTop, barTop: bar.getBoundingClientRect().top });
      }
    }
    return matched;
  });

  expect(pairs.length).toBeGreaterThan(1);
  for (const { entryId, rowTop, barTop } of pairs) {
    expect(barTop, `entry ${entryId}: bar top must match its row top`).toBeCloseTo(rowTop, 0);
  }
});
