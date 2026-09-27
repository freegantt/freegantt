import { test, expect } from '@playwright/test';

// S0 acceptance (plans/03-slices.md): "Harness shows fixture entries as bars positioned
// correctly against time." Smoke-checks what the DOM unit test (src/api/gantt.test.ts)
// already proves headlessly, but in a real browser.
test('harness renders the fixture dataset as positioned bars', async ({ page }) => {
  await page.goto('/generic.html');

  const bars = page.locator('#gantt .fg-bar');
  await expect(bars.first()).toBeVisible();

  const count = await bars.count();
  expect(count).toBeGreaterThan(1);

  const box = await bars.first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

// Regression: GanttShell.render() hardcoded computeFrame's culling window to (0,0), so scrolling past
// the first screenful of rows culled everything to nothing — the pane went blank instead of
// showing the rows actually scrolled into view.
//
// The timeline pane is the native scroller (S1.8, D-D) — `#gantt` itself no longer scrolls.
test('scrolling to the bottom of the frame shows rows, not a blank pane', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(page.locator('.fg-grid-pane .fg-row').first()).toBeVisible();
  const rowCount = await page.locator('.fg-grid-pane .fg-row').count();
  expect(rowCount).toBeGreaterThan(0);

  const scrollTop = await pane.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
});

// Regression (found while chasing the report above): PaneLayout applied both `overflow: hidden`
// and the follow-scroll `translateY` to the same row-layer element. A CSS transform
// moves an element's painted position but NOT the coordinate space its own `overflow: hidden`
// clips against (that clip is fixed to the element's local, pre-transform box) — so once scrolled
// far enough, every row's local offset fell outside that local clip window and got painted as
// nothing, even though the row nodes were still in the DOM with correct text and correct
// `getBoundingClientRect()` geometry. Neither `toBeVisible()` nor a `getBoundingClientRect()`
// overlap check catches this: both report the element's geometry, not whether a pixel of it is
// actually painted on screen. `elementFromPoint` is the one query that consults the paint tree, so
// it is the only reliable way to assert a row is truly visible, not just correctly positioned.
test('grid pane rows are actually painted after scrolling, not just correctly positioned (#regression)', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.fg-grid-pane .fg-row').first()).toBeVisible();

  // A row scrolled into view must have a hit-test inside it land on that same row — proof it is
  // really painted there, not clipped away by an ancestor whose clip window rode off with the
  // transform. The target is the last row fully inside `.fg-rows-clip` (not a fixture name).
  // `scrollTop = scrollHeight` can leave the last tree row only a sliver inside the pane; that
  // sliver's center hits the clip layer, which is not this regression.
  //
  // Polled, not read once: the scroll fires a re-render through FrameScheduler's rAF coalescing
  // (S1.12), so the row set/positions can still be mid-update for a frame or two after the
  // `scroll` event returns. `toBeVisible()` above only proves *a* row exists, not that layout has
  // settled — polling this whole hit-test is what actually waits for that settling.
  const computeHit = () =>
    page.evaluate(() => {
      const clip = document.querySelector('.fg-rows-clip')!;
      const clipRect = clip.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.fg-grid-pane .fg-row'));
      // Hit-test a row that sits fully inside the clip, not the last sliver at scrollHeight.
      // Tree rows (S4.6) leave that last row only a few pixels inside the pane; elementFromPoint
      // at the clip edge lands on `.fg-rows-clip` even when the rest of the window is painted.
      const fullyInside = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= clipRect.top && rect.bottom <= clipRect.bottom && rect.height > 0;
      });
      const lastRow =
        fullyInside.at(-1) ??
        rows.reduce<HTMLElement | undefined>((lowest, row) => {
          const rect = row.getBoundingClientRect();
          const top = Math.max(rect.top, clipRect.top);
          const bottom = Math.min(rect.bottom, clipRect.bottom);
          if (bottom - top < 8) return lowest;
          if (!lowest) return row;
          return rect.top > lowest.getBoundingClientRect().top ? row : lowest;
        }, undefined);
      const candidates = fullyInside.length > 0 ? fullyInside : lastRow ? [lastRow] : [];
      for (const row of candidates) {
        const label = row.querySelector<HTMLElement>('.fg-row-label-text, .fg-row-cell');
        const probe = label ?? row;
        const probeRect = probe.getBoundingClientRect();
        if (probeRect.width <= 0 || probeRect.height <= 0) continue;
        const cx = probeRect.left + probeRect.width / 2;
        const cy = probeRect.top + probeRect.height / 2;
        const atPoint = document.elementFromPoint(cx, cy);
        if (atPoint !== null && row.contains(atPoint)) {
          return { found: true as const, overlapsPane: true, isSameElement: true };
        }
      }
      return { found: candidates.length > 0, overlapsPane: true, isSameElement: false };
    });

  await expect.poll(computeHit, { timeout: 2000 }).toEqual({
    found: true,
    overlapsPane: true,
    isSameElement: true,
  });
});

// D1 (plans/s1.8-pane-layout/README.md): the row-label gutter used to sit
// inside the scrollable content, so the timeline pane's native scrollable range was
// `gridWidth + contentWidth` wide though only `contentWidth` of it was timeline. This is the real
// `scrollWidth` assertion happy-dom cannot express (src/view/gantt-shell.test.ts's D1 test reads the
// content sizer's own transform instead, for that reason) — only a real layout engine settles it.
test('the timeline pane has no row-label gutter in its scrollable content (D1)', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  const scrollWidth = await pane.evaluate((el) => el.scrollWidth);
  const gridPaneWidth = await page.locator('.fg-grid-pane').evaluate((el) => el.clientWidth);

  // The content sizer (render/dom/index.ts) is the library's own statement of how wide the
  // timeline's content is — reading its painted right edge, not comparing scrollWidth to
  // clientWidth, works whether or not the current preset's density floor (S1.12) makes
  // the content genuinely wider than the pane. What D1 guards against is the gutter being counted
  // a second time: `scrollWidth` must track the sizer's own extent, not sizer-extent + gridWidth.
  // getBoundingClientRect() is viewport-relative, so a scrolled pane (e.g. panToToday on load)
  // moves the sizer's painted rect left by exactly el.scrollLeft — add it back so this reads the
  // sizer's extent against the pane's unscrolled content origin, matching scrollWidth's own frame.
  // `.fg-content-sizer` is the sizer's own name (render/dom/index.ts). This read used to take the
  // pane's first `aria-hidden` child instead, which was the sizer only for as long as the sizer was
  // the pane's one hidden layer — the tick-line layer is hidden too, mounts earlier, and is
  // pane-wide rather than content-wide, so the old scan measured that and read 7154px of gap.
  const sizerRight = await pane.evaluate((el) => {
    const sizer = el.querySelector<HTMLElement>('.fg-content-sizer')!;
    return sizer.getBoundingClientRect().right - el.getBoundingClientRect().left + el.scrollLeft;
  });

  // A few px of slack for borders/rounding; the old defect's exact shape was scrollWidth landing
  // a whole gridPaneWidth past the sizer's own right edge, so failing well short of that gap is
  // enough to prove the gutter isn't folded into the scrollable content.
  expect(Math.abs(scrollWidth - sizerRight)).toBeLessThan(gridPaneWidth / 2);
});

test('generic demo shows Budget column, deep tree indent, and grouped rows', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await expect(page.locator('#gantt .fg-row [data-field="cost"]').first()).toBeVisible();
  await expect(page.locator('#gantt .fg-row [data-field="end"]').first()).toBeVisible();
  await expect
    .poll(async () => page.locator('#gantt .fg-row [data-field="start"]').first().textContent())
    .toMatch(/\d{1,2}:\d{2}/);
  // End shows the last covered day, date only, by design: no clock time.
  await expect
    .poll(async () => page.locator('#gantt .fg-row [data-field="end"]').first().textContent())
    .not.toMatch(/\d{1,2}:\d{2}/);

  const maxDepth = () =>
    page
      .locator('#gantt .fg-row')
      .evaluateAll((nodes) =>
        Math.max(
          0,
          ...nodes.map((node) => Number((node as HTMLElement).style.getPropertyValue('--fg-row-depth'))),
        ),
      );
  // Program → workstream → work → grandchild is four levels (depth 0..3).
  await expect.poll(maxDepth).toBeGreaterThanOrEqual(3);

  const treeIds = await page
    .locator('#gantt .fg-row')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['rowId'] ?? ''));

  await page.getByRole('button', { name: 'Group by team' }).click();
  await expect(page.getByRole('button', { name: 'Show tree' })).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator('#gantt .fg-row')
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['rowId'] ?? '')),
    )
    .not.toEqual(treeIds);
});

// #421: the generic demo's segmented row. `entry-16` has three child Entries, and
// `childrenAsSegments` puts them on the parent's own row — the picture a Segment used to draw
// before ADR 0026 retired it. The bench button opens the segments back into rows, and the same three Entries
// become three ordinary rows. This pins both halves, because one config key moves between them.
//
// Counts bars only against the rows they sit on, never in total: the timeline culls a bar outside
// the visible window, so "how many legs are drawn" answers a question about culling, not segmenting.
test('a segmented row draws its children as bars, and opening the segments back into rows gives them rows', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const segmentedRow = page.locator('#gantt .fg-row[data-entry-id="entry-16"]');
  const legRows = page.locator('#gantt .fg-row[data-entry-id^="entry-16-"]');
  const legBars = page.locator('#gantt .fg-bar[data-bar-id^="entry-16-"]');
  const parentBar = page.locator('#gantt .fg-bar[data-bar-id^="entry-16:"]');

  // Segmented: the parent keeps one row, its three legs get none, and the parent draws no bar of its
  // own — `wholeSpanUnlessSegments` returns nothing for a segmented row’s subject, so no rail paints over the legs.
  await expect(segmentedRow).toHaveCount(1);
  await expect(legRows).toHaveCount(0);
  await expect(parentBar).toHaveCount(0);
  expect(await legBars.count()).toBeGreaterThan(0);

  // Every leg that is drawn sits on the parent's row, not on a row of its own.
  const rowBox = (await segmentedRow.boundingBox())!;
  for (const bar of await legBars.all()) {
    const barBox = (await bar.boundingBox())!;
    expect(barBox.y).toBeGreaterThanOrEqual(rowBox.y - 1);
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(rowBox.y + rowBox.height + 1);
  }

  // Released: the same three Entries become three ordinary rows, and the parent draws its own
  // rolled-up bar again.
  await page.locator('#segment-row-btn').click();
  await expect(legRows).toHaveCount(3);
  await expect(parentBar).toHaveCount(1);
});
