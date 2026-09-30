import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

// S5.5 visible acceptance (s5.5-tooltips-and-context-menu.md §4): the flagship demo
// (index.html, harness/main.ts) installs both tooltips() and contextMenu() from the start.
// Right-click/menu behaviour (position, defaults filtered by `when`, items() append/reorder,
// click/Escape) is unit-tested end to end in src/extensions/features/context-menu.test.ts — a real
// page's own scroll-into-view races Popup's `dismissOn: 'scroll'` too easily to keep an
// e2e right-click scenario stable, so only the hover path (no such race) is covered here.

test('hovering a bar opens a tooltip with the entry name and dates', async ({ page }) => {
  await page.goto('/generic.html');
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
// the "Collapse all"/"Expand all" menu anchored at the clicked point (the mouse path —
// the context-menu key instead anchors at the pane's own top-left corner, context-menu.ts).
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
  await page.goto('/generic.html');
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
// A preset switch changes the axis's total pixel width (`ScrollAxis.position` is a raw
// px offset, never re-anchored to a time when content width changes), so the visible window after
// a bare preset assignment is not the same instant range the previous preset showed. `panToDate`
// states the instant this test actually needs — the next Saturday, inside the demo dataset's
// range (`fixtures/demo-dataset.ts`, which starts two weeks before today) — instead of relying on wherever the axis happened to leave
// the old pixel position.
test('[#404] timeShading() still paints at both hour zoom rungs', async ({ page }) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const saturday = await page.evaluate(() => {
    const day = new Date();
    day.setUTCHours(12, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + ((6 - day.getUTCDay() + 7) % 7 || 7));
    return day.toISOString();
  });
  await page.evaluate((at) => {
    window.__gantt.preset = 'hour';
    window.__gantt.panToDate(at, 'center');
  }, saturday);
  await expect(page.locator('#gantt .fg-range-band.fg-time-shading').first()).toBeVisible();

  await page.evaluate((at) => {
    window.__gantt.preset = 'hourDayWeek';
    window.__gantt.panToDate(at, 'center');
  }, saturday);
  await expect(page.locator('#gantt .fg-range-band.fg-time-shading').first()).toBeVisible();
});

// #404: harness/e2e/plugins.html installs timeShading() — the shipped built-in, imported from
// 'freegantt' alone, no harness plugin behind it. Bands appear, follow a pan, and the page's own
// checkbox removes the plugin live (no core edit either way). `.fg-time-shading` is the Part every
// timeShading() band carries regardless of which page installs it or what `class` a rule names.
test('[#404] weekend bands appear, follow a pan, and a checkbox removes the plugin live', async ({
  page,
}) => {
  await page.goto('/e2e/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bands = page.locator('#gantt .fg-range-band.fg-time-shading');
  await expect(bands.first()).toBeVisible();
  const bandCountBefore = await bands.count();
  expect(bandCountBefore).toBeGreaterThan(0);

  const firstBandBefore = await bands.first().boundingBox();
  if (!firstBandBefore) throw new Error('missing bounding box');

  // Pans the visible window right, through the same core command (freegantt.panRight) a pointer
  // gesture binds to — real keyboard interaction, not an imperative call into the Gantt. S5.11,
  // the container itself carries no tabindex any more — `view/roving-focus.ts` owns one
  // tab stop per pane instead, so focus lands on the timeline pane's own bar, the honest tab stop
  // whose bubbled keydown the shell's listener sees (same pattern e2e/hierarchy.spec.ts uses). Plain
  // `ArrowRight` moved off panning too: `Alt+ArrowRight` is the pan chord now.
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

// S5.6, [S5-A2]: harness/e2e/plugins.html installs overBudgetRows() — harness/plugins/over-budget-rows.ts,
// written against the public 'freegantt' entry alone. Dogfoods the `rowStripe` half of
// `DecorationInput` (rangeBand is the other, covered by timeShading() above) — a stripe appears
// under every over-budget row, and the page's own checkbox removes the plugin live.
test('[S5.6] over-budget row stripes appear and a checkbox removes the plugin live', async ({ page }) => {
  await page.goto('/e2e/plugins.html');
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

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4): harness/e2e/editing.html installs
// freezePastWork() — harness/plugins/freeze-past-work.ts, written against the public 'freegantt'
// entry alone — and its checkbox freezes every Entry whose work is already past. Two seams, one
// demo: the lock rule closes a past bar's own `start`/`end`, and the place rule refuses a drop into
// a parent whose own work is past too. Both refuse silently, the same way the core lock does: the
// gesture never arms, so no toast and no log line ever reports it.
test('with past work frozen, a past bar does not drag or resize, and a drop into a past parent refuses', async ({
  page,
}) => {
  await page.goto('/e2e/editing.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#freeze-past-work').check();

  // `entry-2` already ended, so the lock rule closes its `start`/`end`: no resize handle paints,
  // and a drag along the timeline leaves it exactly where it started.
  const pastBar = page.locator('#gantt .fg-bar[data-bar-id^="entry-2:"]').first();
  await expect(pastBar).toBeVisible();
  await expect(pastBar.locator('.fg-bar-handle[data-edge="start"]')).toBeHidden();
  await expect(pastBar.locator('.fg-bar-handle[data-edge="end"]')).toBeHidden();

  const pastBefore = await pastBar.boundingBox();
  if (!pastBefore) throw new Error('missing bounding box');
  const pastGrabY = pastBefore.y + pastBefore.height / 2;
  await page.mouse.move(pastBefore.x + Math.min(pastBefore.width / 2, 20), pastGrabY);
  await page.mouse.down();
  await page.mouse.move(pastBefore.x + Math.min(pastBefore.width / 2, 20) + 120, pastGrabY, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pastBar.boundingBox())?.x).toBe(pastBefore.x);
  await expect(page.locator('#undo-btn')).toBeDisabled();

  // `entry-1`'s own dates are dropped and roll up from its one child `entry-4` (ADR 0013), both
  // already past, so its row is a past parent too. `entry-3` is pushed into the future, so the
  // freeze never touches it — dragging its grid row onto `entry-1`'s row crosses that past border.
  const openRow = page.locator('#gantt .fg-row[data-entry-id="entry-3"]');
  const pastParentRow = page.locator('#gantt .fg-row[data-entry-id="entry-1"]');
  const openBefore = await openRow.boundingBox();
  const parentBox = await pastParentRow.boundingBox();
  if (!openBefore || !parentBox) throw new Error('missing bounding box');

  const openGrabX = openBefore.x + openBefore.width - 20;
  await page.mouse.move(openGrabX, openBefore.y + openBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(openGrabX, parentBox.y + parentBox.height / 2, { steps: 8 });
  await page.mouse.up();

  // The drop is refused, so `entry-3` sits at its own row exactly where it started, and nothing
  // in the dataset ever committed.
  await expect.poll(async () => (await openRow.boundingBox())?.y).toBe(openBefore.y);
  await expect(page.locator('#undo-btn')).toBeDisabled();
});

// #280: harness/e2e/plugins.html's "Buffer + risk kinds" toggle installs contextMenu()
// with no `items` filter (harness/e2e/plugins.ts) — right-clicking entry-37, a buffer bar, opens the
// ~22-item, ~740px-tall menu the issue reports. `.fg-container` clips at its own edge (styles.ts),
// so a menu this tall used to run past the bottom with no way to reach the lowest items. popup.ts's
// `--fg-popup-max-height` (set from the anchor's own pane on every reposition) and styles.ts's
// `.fg-menu` rule cap the menu at the pane's height and let it scroll its own overflow instead.
test('#280: a menu taller than the pane scrolls, so every item stays reachable', async ({ page }) => {
  // The default viewport already stands taller than a 22-item menu — nothing to clip yet. A
  // shorter pane, still wide enough for the harness page's own chrome, is what makes the pane the
  // binding constraint instead, the same way any consumer's own page layout could.
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/e2e/plugins.html');
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
  // `boundingBox()` gives `{x, y, width, height}`, not `{top, bottom}` — the container's own bottom
  // edge is `y + height`, not a `.bottom` field it never carries.
  const containerBottom = containerBox.y + containerBox.height;
  const lastItemIsInsideContainer = async () => {
    const box = await lastItem.boundingBox();
    if (!box) return false;
    return box.y >= containerBox.y - 1 && box.y + box.height <= containerBottom + 1;
  };

  // A user scrolls until the last item shows. One wheel gesture is not enough everywhere: Firefox
  // caps a single gesture below one page, so it stops short of the end of this menu. Scroll again
  // until the last item sits inside the container.
  await expect(async () => {
    await page.mouse.wheel(0, 1000);
    expect(await lastItemIsInsideContainer()).toBe(true);
  }).toPass({ timeout: 5000 });
  await expect(lastItem).toBeVisible();

  // The scroll landed on the menu's own overflow, not a second popup this gesture happened to open.
  await expect(popup).toHaveCount(1);
});

// #280: today `paneOf` only knows the grid pane and the timeline pane
// (pane-layout.ts) — the overlay a popup mounts into is their sibling, not inside either one. So a
// scroll whose target sits in the menu's own overflow reads as "outside every pane" to popup.ts's
// `scroll` dismiss trigger, and never matches the anchor's own pane. That already holds by
// accident; this test pins it so the newly-scrollable menu (#280) cannot regress it later.
test('#280: scrolling inside the open menu does not dismiss it', async ({ page }) => {
  // Same shorter pane as the scroll-reachability test above — the menu must actually overflow for
  // this scroll to land inside it at all, rather than trivially not-dismissing a menu with nothing
  // to scroll.
  await page.setViewportSize({ width: 1000, height: 500 });
  await page.goto('/e2e/plugins.html');
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
