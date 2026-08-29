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
  // so a resize test has to stay above that floor to observe a re-fit at all.
  await page.setViewportSize({ width: 3000, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await contentSizerRight(page);
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 3600, height: 800 });
  // The resize observation is queued by the browser, not synchronous with setViewportSize.
  await expect.poll(async () => contentSizerRight(page), { timeout: 2000 }).not.toBe(before);

  const after = await contentSizerRight(page);
  // fitDataset: content ends exactly at the timeline pane's own right edge, in both sizes.
  const paneWidth = await page.locator('.fg-timeline-pane').evaluate((el) => el.clientWidth);
  expect(Math.abs(after - paneWidth)).toBeLessThan(2);
});

// U1/U4 (plans/s1.8-pane-layout/README.md §0): dragging the splitter moves both panes live, and
// re-fits the time axis with no reload and no explicit render()/setPaneSize() call from the test —
// the timeline pane's own ResizeObserver is the only thing that has to fire.
test('dragging the splitter re-fits the axis with no other call (U4)', async ({ page }) => {
  // Wide enough that the pane stays above the S1.12 density floor (see the #8 test above) both
  // before and after the 120px drag — otherwise the content edge legitimately does not move.
  await page.setViewportSize({ width: 3200, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const gridWidthBefore = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);
  const contentRightBefore = await contentSizerRight(page);

  await dragSplitterBy(page, 120);

  const gridWidthAfter = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);
  expect(gridWidthAfter).toBeGreaterThan(gridWidthBefore);

  // The timeline pane shrank, so fitDataset re-fits pxPerMs down — the sizer's right edge moves
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
      const rowId = row.dataset['rowId']; // "row:<entryId>"
      const entryId = rowId?.slice('row:'.length);
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
