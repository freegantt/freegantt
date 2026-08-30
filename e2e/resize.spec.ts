import { test, expect, type Locator } from '@playwright/test';

// Regression: the shared resize-handle pair (D-S3-8) was appended as a sibling of `.fg-bars`
// directly on `timelineHost`, so its `position: absolute` resolved against the pane instead of
// `.fg-bars` — the same coordinate origin a bar's own transform (`syncBars`) uses. `.fg-header`
// sits above `.fg-bars` in normal flow, so the handle pair painted one header-height too high: it
// never covered the bar it belonged to, and dragging a bar's visible edge hit nothing. A jsdom/
// happy-dom unit test cannot catch this — those environments never run CSS layout, so a handle
// positioned against the wrong ancestor lays out identically to one positioned against the right
// one (see also e2e/row-bar-alignment.spec.ts, same reasoning). Fix: append the handle pair inside
// `.fg-bars` itself.

/** A bar fully inside the viewport — `.fg-bars` is wider than the pane at some scroll positions
 *  (S1.12's density floor), so the first bar in DOM order can sit partly or fully off-screen. */
async function visibleBar(page: import('@playwright/test').Page): Promise<Locator> {
  const bars = page.locator('#gantt .fg-bar');
  await bars.first().waitFor();
  const count = await bars.count();
  const viewport = page.viewportSize();
  for (let i = 0; i < count; i++) {
    const bar = bars.nth(i);
    const box = await bar.boundingBox();
    if (box && box.x >= 0 && viewport && box.x + box.width <= viewport.width) return bar;
  }
  throw new Error('no on-screen bar found');
}

test('the resize handle pair lines up with the bar it belongs to (I9-adjacent)', async ({ page }) => {
  await page.goto('/');
  const bar = await visibleBar(page);
  const box = (await bar.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const endHandle = page.locator('.fg-bar-handle[data-edge="end"]');
  await expect(endHandle).toBeVisible();
  const handleBox = (await endHandle.boundingBox())!;

  expect(Math.abs(handleBox.y - box.y)).toBeLessThanOrEqual(1);
});

/** Drags from the bar's own visible right edge, not the handle's own (possibly stale) bounding box
 *  — a real user grabs the edge they can see, not wherever the handle node happens to sit in the
 *  DOM. This is the shape that catches a handle left behind after a commit (see the second
 *  regression test below): querying the handle's own box would just report its actual, wrong
 *  position and "succeed" at hitting it, masking the exact symptom a user hits. */
async function dragBarEndEdgeBy(
  page: import('@playwright/test').Page,
  bar: Locator,
  dx: number,
): Promise<void> {
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + dx, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('dragging the end handle resizes the bar', async ({ page }) => {
  await page.goto('/');
  const bar = await visibleBar(page);
  const box = (await bar.boundingBox())!;

  await dragBarEndEdgeBy(page, bar, 60);

  const resizedBox = (await bar.boundingBox())!;
  expect(resizedBox.width).toBeGreaterThan(box.width);
  expect(resizedBox.x).toBeCloseTo(box.x, 0);
});

// Regression: after a resize commit, the resized entry commonly stays both hovered (the pointer is
// still sitting over it) and selected. `GanttShell#refreshAffordances` only repaints the handle pair
// when `resizableItemId`'s identity changes — it stays the same item across the commit in that case,
// so the gate alone left the handle pair glued to its pre-commit position while the bar itself
// repainted at its new, wider geometry. A second resize attempt at the bar's new visible edge then
// hit nothing, because the real (invisible) handle was still sitting at the old edge. Fix: the
// handle pair's geometry now tracks `syncBars` every frame in `render/dom/index.ts`'s `sync()`, the
// same way a bar's own transform does, not just on `resizableItemId` identity change.
test('a second resize at the bar edge still works after the entry stays selected from the first', async ({
  page,
}) => {
  await page.goto('/');
  const bar = await visibleBar(page);
  await bar.click(); // selects the entry; it stays selected and hovered through both resizes below
  const box = (await bar.boundingBox())!;

  await dragBarEndEdgeBy(page, bar, 60);
  const afterFirst = (await bar.boundingBox())!;
  expect(afterFirst.width).toBeGreaterThan(box.width);

  await dragBarEndEdgeBy(page, bar, 60);
  const afterSecond = (await bar.boundingBox())!;
  expect(afterSecond.width).toBeGreaterThan(afterFirst.width);
});
