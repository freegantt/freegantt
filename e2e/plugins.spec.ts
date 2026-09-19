import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

// S5.5 visible acceptance (s5.5-tooltips-and-context-menu.md §4, D-S5-13/14): the flagship demo
// (index.html, harness/main.ts) installs both tooltips() and contextMenu() from the start.
// Right-click/menu behaviour (position, defaults filtered by `when`, items() append/reorder,
// click/Escape) is unit-tested end to end in src/extensions/features/context-menu.test.ts — a real
// page's own scroll-into-view races Popup's `dismissOn: 'scroll'` (D-S5-9) too easily to keep an
// e2e right-click scenario stable, so only the hover path (no such race) is covered here.

test('hovering a bar opens a tooltip with the entry name and dates', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary)').first();
  await expect(bar).toBeVisible();

  await bar.hover();
  const tooltip = page.locator('#gantt .fg-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(page.locator('#gantt .fg-tooltip-title')).not.toBeEmpty();
  await expect(page.locator('#gantt .fg-tooltip-dates')).not.toBeEmpty();

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});

// #437: a right-click on the timeline pane's own background, with no bar under the pointer, opens
// the "Collapse all"/"Expand all" menu anchored at the clicked point (the mouse path, D-S5-14 —
// `Shift+F10`'s keyboard path anchors at the pane's own top-left corner instead, context-menu.ts).
// The click lands near the pane top, the same vertical band the sticky grid header and timeline
// header occupy. No `scrollIntoView` call runs first, so this needs none of the scroll-race care
// the file banner above warns about; the click lands on an already-visible point. Before #437,
// `.fg-overlay` carried no z-index and lost to the sticky timeline header, `.fg-header`
// (styles.ts) — the menu painted, but the header painted over it, and the covered part refused
// every click. `document.elementFromPoint()` is what a real pointer resolves against, so it is the
// one check that tells "painted" from "clickable" apart.
test('[#437] a context menu opened near a pane top paints, and hit-tests, above the sticky header', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const timelinePane = page.locator('#gantt .fg-timeline-pane');
  const timelineBox = await timelinePane.boundingBox();
  if (!timelineBox) throw new Error('missing timeline pane bounding box');

  // A point inside the pane but off every bar — the timeline canvas itself, not a row.
  await page.mouse.click(timelineBox.x + timelineBox.width / 2, timelineBox.y + 5, { button: 'right' });

  const menu = page.locator('#gantt .fg-menu');
  await expect(menu).toBeVisible();
  const firstItem = page.locator('#gantt .fg-menu-item').first();
  const firstItemBox = await firstItem.boundingBox();
  if (!firstItemBox) throw new Error('missing menu item bounding box');

  const gridHeaderBox = await page.locator('#gantt .fg-grid-header').boundingBox();
  if (!gridHeaderBox) throw new Error('missing grid header bounding box');
  // A point near the item's own top edge, painted inside the header's vertical range — the fixture
  // drifted if this ever moves outside that range, and a passing elementFromPoint check below would
  // then prove nothing.
  const point = { x: firstItemBox.x + firstItemBox.width / 2, y: firstItemBox.y + 3 };
  expect(point.y).toBeGreaterThanOrEqual(gridHeaderBox.y);
  expect(point.y).toBeLessThanOrEqual(gridHeaderBox.y + gridHeaderBox.height);

  const hitsMenuItem = await page.evaluate(
    (p) => document.elementFromPoint(p.x, p.y)?.closest('.fg-popup') !== null,
    point,
  );
  expect(hitsMenuItem).toBe(true);
});

// #404 acceptance: "shading paints at the default ladder's two hour rungs". ZOOM_PRESETS' finest
// two rungs are hourPreset and hourDayWeekPreset (src/time/presets.ts) — any Gantt reaches them by
// zooming in twice with no configuration, so a first-party shading plugin has to keep painting
// there. index.html (harness/main.ts) installs timeShading() from the start and exposes
// window.__gantt (S3's own test seam), so this asks it for both rungs directly.
//
// A preset switch changes the axis's total pixel width (D-S1.5-2: `ScrollAxis.position` is a raw
// px offset, never re-anchored to a time when content width changes), so the visible window after
// a bare preset assignment is not the same instant range the previous preset showed. `panToDate`
// states the instant this test actually needs — 2026-09-12, a Saturday inside the demo dataset's
// range (`fixtures/demo-dataset.ts`) — instead of relying on wherever the axis happened to leave
// the old pixel position.
test('[#404] timeShading() still paints at both hour zoom rungs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.preset = 'hour';
    window.__gantt.panToDate('2026-09-12', 'center');
  });
  await expect(page.locator('#gantt .fg-range-band.fg-time-shading').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.preset = 'hourDayWeek';
    window.__gantt.panToDate('2026-09-12', 'center');
  });
  await expect(page.locator('#gantt .fg-range-band.fg-time-shading').first()).toBeVisible();
});

// #404: harness/plugins.html installs timeShading() — the shipped built-in, imported from
// 'freegantt' alone, no harness plugin behind it. Bands appear, follow a pan, and the page's own
// checkbox removes the plugin live (no core edit either way). `.fg-time-shading` is the Part every
// timeShading() band carries regardless of which page installs it or what `class` a rule names.
test('[#404] weekend bands appear, follow a pan, and a checkbox removes the plugin live', async ({
  page,
}) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bands = page.locator('#gantt .fg-range-band.fg-time-shading');
  await expect(bands.first()).toBeVisible();
  const bandCountBefore = await bands.count();
  expect(bandCountBefore).toBeGreaterThan(0);

  const firstBandBefore = await bands.first().boundingBox();
  if (!firstBandBefore) throw new Error('missing bounding box');

  // Pans the visible window right, through the same core command (freegantt.panRight) a pointer
  // gesture binds to — real keyboard interaction, not an imperative call into the Gantt. S5.11,
  // D-S5-26: the container itself carries no tabindex any more — `view/roving-focus.ts` owns one
  // tab stop per pane instead, so focus lands on the timeline pane's own bar, the honest tab stop
  // whose bubbled keydown the shell's listener sees (same pattern e2e/hierarchy.spec.ts uses). Plain
  // `ArrowRight` moved off panning too (D-S5-26): `Alt+ArrowRight` is the pan chord now.
  // Keyed on `data-bar-id`, not a bare `.first()`: virtualization can still mount more bars ahead
  // of this one in DOM order right after the page settles (#256's own settle race, widened). A
  // `.first()` locator re-resolves on every retry, so it would then quietly point at a new,
  // unfocused bar instead of reporting that this one lost focus.
  const firstBarId = await page.locator('#gantt .fg-bar').first().getAttribute('data-bar-id');
  expect(firstBarId).toBeTruthy();
  const firstBar = page.locator(`#gantt .fg-bar[data-bar-id="${firstBarId}"]`);
  await firstBar.focus();
  await expect(firstBar).toBeFocused();

  // Presses inside the poll itself (not once, up front): a worker under load can still be settling
  // the page's own initial today-line pan when `firstBandBefore` above was captured, so a single
  // burst of key presses can race that settle. Pressing again on every retry is self-healing either way.
  await expect
    .poll(async () => {
      await page.keyboard.press('Alt+ArrowRight');
      const box = await bands.first().boundingBox();
      return box?.x ?? null;
    })
    .not.toBe(firstBandBefore.x);

  // The checkbox removes the plugin live — every band disappears, no remount of anything else.
  const toggle = page.locator('#time-shading-toggle');
  await toggle.uncheck();
  await expect(bands).toHaveCount(0);

  await toggle.check();
  await expect(bands.first()).toBeVisible();
});

// S5.6, [S5-A2]: harness/plugins.html installs overBudgetRows() — harness/plugins/over-budget-rows.ts,
// written against the public 'freegantt' entry alone. Dogfoods the `rowStripe` half of
// `DecorationInput` (rangeBand is the other, covered by timeShading() above) — a stripe appears
// under every over-budget row, and the page's own checkbox removes the plugin live.
test('[S5.6] over-budget row stripes appear and a checkbox removes the plugin live', async ({ page }) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const stripes = page.locator('#gantt .fg-row-stripe.demo-over-budget-row');
  await expect(stripes.first()).toBeVisible();
  const stripeCountBefore = await stripes.count();
  expect(stripeCountBefore).toBeGreaterThan(0);

  const toggle = page.locator('#over-budget-rows-toggle');
  await toggle.uncheck();
  await expect(stripes).toHaveCount(0);

  await toggle.check();
  await expect(stripes.first()).toBeVisible();
});

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4, D-S5-23/24): harness/editing.html installs
// lockEntries() — harness/plugins/lock-entries.ts, written against the public 'freegantt' entry
// alone — and its checkbox locks entry-15 through the plugin's own store. Two seams, one demo: the
// extension hook ghosts the locked bars while a neighbour drags, and `beforeChange` refuses the drop.
//
// #241, ADR 0026: the locked row draws several bars there, and each one is a child Entry the row
// draws as a segment (`childrenAsSegments`). Every bar on that row has to ghost, and by the same distance — that
// is what `moveEntryTo`'s rigid translate promises, applied once per dated child. The count is read
// off the page, never asserted as a number, so a fixture edit cannot make this test quietly weaker.
test('every bar of a locked row ghosts alongside a dragged neighbour, and the drop is refused', async ({
  page,
}) => {
  await page.goto('/editing.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#lock-entry').check();

  const dragged = page.locator('#gantt .fg-bar[data-bar-id^="entry-14:"]').first();
  const lockedBars = page.locator('#gantt .fg-bar[data-bar-id^="entry-15-"]');
  await expect(dragged).toBeVisible();
  // More than one bar on one row is the whole point of the case: one bar would pass even if the
  // cascade moved a single envelope, which is what this test exists to rule out.
  expect(await lockedBars.count()).toBeGreaterThan(1);

  const leftEdges = async (): Promise<number[]> => {
    const boxes = await Promise.all((await lockedBars.all()).map((bar) => bar.boundingBox()));
    return boxes.map((box) => box?.x ?? Number.NaN);
  };

  const draggedBefore = await dragged.boundingBox();
  const lockedBefore = await leftEdges();
  if (!draggedBefore) throw new Error('missing bounding box');

  await page.mouse.move(draggedBefore.x + Math.min(draggedBefore.width / 2, 20), draggedBefore.y + 6);
  await page.mouse.down();
  await page.mouse.move(draggedBefore.x + Math.min(draggedBefore.width / 2, 20) + 120, draggedBefore.y + 6, {
    steps: 8,
  });

  // The preview is rAF-coalesced, so poll rather than read once: every locked bar moves, because the
  // plugin's extender cascades a `moveEntryTo` edit for every locked child Entry (ADR 0026 — this row
  // draws several bars because it has several children, not because one Entry draws several
  // Segments) into the same draft. The 8px floor clears sub-pixel rounding on a bar that has not
  // moved at all; the drag itself is 120px.
  await expect.poll(async () => (await leftEdges()).every((x, i) => x > lockedBefore[i]! + 8)).toBe(true);
  // Rigid, not stretched: one shared offset for every locked child Entry, so the gaps between the
  // bars survive the ghost. `moveEntryTo` promises this per Entry; a single envelope write over the
  // parent could not even name which child moved.
  const offsets = (await leftEdges()).map((x, i) => Math.round(x - lockedBefore[i]!));
  expect(new Set(offsets).size).toBe(1);

  await page.mouse.up();

  // The drop is refused, so every bar lands back where it started and the page logs the refusal.
  // A store-only commit repaints on the next frame (#161), so every post-commit read polls.
  // The plugin names the locked Entry it found in the changeset, and each bar on this row is its own
  // Entry now (ADR 0026) — so the refusal names a leg, not the row's parent.
  await expect(page.locator('#toast')).toContainText('entry-15-a is locked');
  await expect.poll(leftEdges).toEqual(lockedBefore);
  await expect.poll(async () => (await dragged.boundingBox())?.x).toBe(draggedBefore.x);
  await expect(page.locator('#log')).toContainText('entry-15-a is locked');
});

// #280: harness/plugins.html's "Buffer + risk kinds" toggle installs contextMenu()
// with no `items` filter (harness/plugins.ts) — right-clicking entry-37, a buffer bar, opens the
// ~22-item, ~740px-tall menu the issue reports. `.fg-container` clips at its own edge (styles.ts),
// so a menu this tall used to run past the bottom with no way to reach the lowest items. popup.ts's
// `--fg-popup-max-height` (set from the anchor's own pane on every reposition) and styles.ts's
// `.fg-menu` rule cap the menu at the pane's height and let it scroll its own overflow instead.
test('#280: a menu taller than the pane scrolls, so every item stays reachable', async ({ page }) => {
  // The default viewport already stands taller than a 22-item menu — nothing to clip yet. A
  // shorter pane, still wide enough for the harness page's own chrome, is what makes the pane the
  // binding constraint instead, the same way any consumer's own page layout could.
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = page.locator('#gantt .fg-bar[data-bar-id^="entry-37:"]').first();
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await bar.click({ button: 'right' });

  const menu = page.locator('#gantt .fg-menu');
  await expect(menu).toBeVisible();
  // This test opened one menu. Count it so a later assertion cannot pass against a different node.
  const popup = page.locator('#gantt .fg-popup');
  await expect(popup).toHaveCount(1);

  const items = page.locator('#gantt .fg-menu-item');
  expect(await items.count()).toBeGreaterThan(10);

  const containerBox = await page.locator('#gantt').boundingBox();
  if (!containerBox) throw new Error('missing container bounding box');

  // The clamp itself: `.fg-popup` is the box `--fg-popup-max-height` caps and the one that scrolls
  // (styles.ts), so this stands no taller than the container it must stay inside, even though
  // `.fg-menu` inside it keeps its full, uncapped content height.
  const popupBoxBefore = await popup.boundingBox();
  if (!popupBoxBefore) throw new Error('missing popup bounding box');
  expect(popupBoxBefore.height).toBeLessThanOrEqual(containerBox.height + 1);

  const lastItem = items.last();
  await page.mouse.move(
    popupBoxBefore.x + popupBoxBefore.width / 2,
    popupBoxBefore.y + popupBoxBefore.height / 2,
  );
  await page.mouse.wheel(0, 1000);

  // `boundingBox()` gives `{x, y, width, height}`, not `{top, bottom}` — the container's own bottom
  // edge is `y + height`, not a `.bottom` field it never carries.
  const containerBottom = containerBox.y + containerBox.height;
  await expect
    .poll(async () => {
      const box = await lastItem.boundingBox();
      if (!box) return false;
      return box.y >= containerBox.y - 1 && box.y + box.height <= containerBottom + 1;
    })
    .toBe(true);
  await expect(lastItem).toBeVisible();

  // The scroll landed on the menu's own overflow, not a second popup this gesture happened to open.
  await expect(popup).toHaveCount(1);
});

// #280: today `paneOf` only knows the grid pane and the timeline pane
// (pane-layout.ts) — the overlay a popup mounts into is their sibling, not inside either one. So a
// scroll whose target sits in the menu's own overflow reads as "outside every pane" to popup.ts's
// `scroll` dismiss trigger (D-S5-9), and never matches the anchor's own pane. That already holds by
// accident; this test pins it so the newly-scrollable menu (#280) cannot regress it later.
test('#280: scrolling inside the open menu does not dismiss it', async ({ page }) => {
  // Same shorter pane as the scroll-reachability test above — the menu must actually overflow for
  // this scroll to land inside it at all, rather than trivially not-dismissing a menu with nothing
  // to scroll.
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bar = page.locator('#gantt .fg-bar[data-bar-id^="entry-37:"]').first();
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await bar.click({ button: 'right' });

  const menu = page.locator('#gantt .fg-menu');
  await expect(menu).toBeVisible();
  // `.fg-popup` is the box `--fg-popup-max-height` caps and the one that scrolls (styles.ts) —
  // `.fg-menu` inside it keeps its full, uncapped content height.
  const popup = page.locator('#gantt .fg-popup');
  await expect(popup).toHaveCount(1);

  // Proves the scroll below lands on real overflow, not a popup that already showed every item.
  const hasOverflow = await popup.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(hasOverflow).toBe(true);

  const popupBox = await popup.boundingBox();
  if (!popupBox) throw new Error('missing popup bounding box');
  await page.mouse.move(popupBox.x + popupBox.width / 2, popupBox.y + popupBox.height / 2);
  await page.mouse.wheel(0, 1000);

  await expect.poll(() => popup.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Still the one popup that opened, not dismissed and not replaced by a second one.
  await expect(popup).toHaveCount(1);
  await expect(menu).toBeVisible();
  const items = page.locator('#gantt .fg-menu-item');
  await expect(items.first()).toBeAttached();
});
