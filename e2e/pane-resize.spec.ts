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
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await contentSizerRight(page);
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1600, height: 800 });
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
  await page.setViewportSize({ width: 1000, height: 800 });
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

  const [rowTops, barTops] = await page.evaluate(() => {
    const parseY = (transform: string, pattern: RegExp): number => {
      const match = pattern.exec(transform);
      return match ? parseFloat(match[1]!) : NaN;
    };
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row')).map((el) =>
      parseY(el.style.transform, /translateY\(([-\d.]+)px\)/),
    );
    const bars = Array.from(document.querySelectorAll<HTMLElement>('.fg-timeline-pane .fg-bar')).map((el) =>
      parseY(el.style.transform, /translate\([-\d.]+px,\s*([-\d.]+)px\)/),
    );
    return [rows, bars];
  });
  expect(rowTops.length).toBeGreaterThan(1);
  expect(rowTops).toEqual(barTops);
});
