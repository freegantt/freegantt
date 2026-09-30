import { test, expect, type Locator } from '@playwright/test';

// Regression: the shared resize-handle pair was appended as a sibling of `.fg-bars`
// directly on `timelineHost`, so its `position: absolute` resolved against the pane instead of
// `.fg-bars` — the same coordinate origin a bar's own transform (`syncBars`) uses. `.fg-header`
// sits above `.fg-bars` in normal flow, so the handle pair painted one header-height too high: it
// never covered the bar it belonged to, and dragging a bar's visible edge hit nothing. A jsdom/
// happy-dom unit test cannot catch this — those environments never run CSS layout, so a handle
// positioned against the wrong ancestor lays out identically to one positioned against the right
// one (see also e2e/row-bar-alignment.spec.ts, same reasoning). Fix: append the handle pair inside
// `.fg-bars` itself.

/** A bar fully inside the viewport that shows resize handles on hover.
 *  `.fg-bars` is wider than the pane at some scroll positions (S1.12's density floor), so the
 *  first bar in DOM order can sit off-screen. A `'group'` (rollUpKinds) also paints a bar but
 *  refuses resize, so hover must prove the handle before this helper returns. */
async function visibleResizableBar(page: import('@playwright/test').Page): Promise<Locator> {
  const bars = page.locator('#gantt .fg-bar');
  await bars.first().waitFor();
  // The page pans to today on load, one frame later. Bars hold still only after that.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const count = await bars.count();
  const viewport = page.viewportSize();
  const endHandle = page.locator('.fg-bar-handle[data-edge="end"]');
  for (let i = 0; i < count; i++) {
    const bar = bars.nth(i);
    // A leg of the segmented row shares its row with two other legs, so it is not a plain task bar.
    if (((await bar.getAttribute('data-bar-id')) ?? '').startsWith('entry-16-')) continue;
    await bar.scrollIntoViewIfNeeded();
    const box = await bar.boundingBox();
    // The drags below pull an edge 60px right, so the bar needs that room inside the viewport, and a click may scroll it right.
    if (!box || box.x < 0 || !viewport || box.x + box.width + 200 > viewport.width) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (await endHandle.isVisible()) return bar;
  }
  throw new Error('no on-screen resizable bar found');
}

test('the resize handle pair lines up with the bar it belongs to (I9-adjacent)', async ({ page }) => {
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
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
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
  const box = (await bar.boundingBox())!;

  await dragBarEndEdgeBy(page, bar, 60);

  const resizedBox = (await bar.boundingBox())!;
  expect(resizedBox.width).toBeGreaterThan(box.width);
  expect(resizedBox.x).toBeCloseTo(box.x, 0);
});

// Regression: after a resize commit, the resized entry commonly stays both hovered (the pointer is
// still sitting over it) and selected. `GanttShell#refreshAffordances` only repaints the handle pair
// when `resizableEntryId`'s identity changes — it stays the same Entry across the commit in that case,
// so the gate alone left the handle pair glued to its pre-commit position while the bar itself
// repainted at its new, wider geometry. A second resize attempt at the bar's new visible edge then
// hit nothing, because the real (invisible) handle was still sitting at the old edge. Fix: the
// handle pair's geometry now tracks `syncBars` every frame in `render/dom/index.ts`'s `sync()`, the
// same way a bar's own transform does, not just on `resizableEntryId` identity change.
test('a second resize at the bar edge still works after the entry stays selected from the first', async ({
  page,
}) => {
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
  await bar.click(); // selects the entry; it stays selected and hovered through both resizes below
  const box = (await bar.boundingBox())!;

  await dragBarEndEdgeBy(page, bar, 60);
  const afterFirst = (await bar.boundingBox())!;
  expect(afterFirst.width).toBeGreaterThan(box.width);

  await dragBarEndEdgeBy(page, bar, 60);
  const afterSecond = (await bar.boundingBox())!;
  expect(afterSecond.width).toBeGreaterThan(afterFirst.width);
});

/** Drags from the bar's own visible left edge — the symmetric case of `dragBarEndEdgeBy`. */
async function dragBarStartEdgeBy(
  page: import('@playwright/test').Page,
  bar: Locator,
  dx: number,
): Promise<void> {
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + dx, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

/** The committed span for `entryId`, read back through the public Dataset — the one ground truth
 *  for what a drag actually wrote, as opposed to what the bar's own (possibly stale) box reports. */
async function committedSpan(
  page: import('@playwright/test').Page,
  entryId: string,
): Promise<{ start: number; end: number }> {
  return page.evaluate((id) => {
    const entry = window.__dataset.entries.get(id)!;
    return { start: Number(entry.start), end: Number(entry.end) };
  }, entryId);
}

// #240: dragging one edge past the opposite one must never commit `end < start` —
// `layout/gesture-draft.ts`'s `resizeEdit` clamps the dragged edge to zero length (which keeps
// that legal), never past it. `data-bar-id` is `${entryId}:${segmentIndex}` (`model/ids.ts`'s
// `barId`), so the bar's own attribute is the DOM→Entry trust boundary — no re-derivation of that
// mapping here.
test('dragging the end handle past start commits a zero-length span, never an inverted one (#240)', async ({
  page,
}) => {
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
  const box = (await bar.boundingBox())!;
  const entryId = (await bar.getAttribute('data-bar-id'))!.split(':')[0]!;

  // Past the bar's own start, and well past — this must clamp, not overshoot into an inversion.
  await dragBarEndEdgeBy(page, bar, -(box.width + 400));

  const after = await committedSpan(page, entryId);
  expect(after.end).toBeGreaterThanOrEqual(after.start);
});

test('dragging the start handle past end commits a zero-length span, never an inverted one (#240)', async ({
  page,
}) => {
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
  const box = (await bar.boundingBox())!;
  const entryId = (await bar.getAttribute('data-bar-id'))!.split(':')[0]!;

  await dragBarStartEdgeBy(page, bar, box.width + 400);

  const after = await committedSpan(page, entryId);
  expect(after.end).toBeGreaterThanOrEqual(after.start);
});

test('a second end-handle drag after the first clamps to zero length still refuses to invert (#240)', async ({
  page,
}) => {
  await page.goto('/generic.html');
  const bar = await visibleResizableBar(page);
  const entryId = (await bar.getAttribute('data-bar-id'))!.split(':')[0]!;
  const box = (await bar.boundingBox())!;

  await dragBarEndEdgeBy(page, bar, -(box.width + 400)); // clamps to zero length
  await dragBarEndEdgeBy(page, bar, -50); // dragging further left from an already zero-width bar

  const after = await committedSpan(page, entryId);
  expect(after.end).toBeGreaterThanOrEqual(after.start);
});
