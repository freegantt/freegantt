import { test, expect } from '@playwright/test';

// S5.5 visible acceptance (s5.5-tooltips-and-context-menu.md §4, D-S5-13/14): the flagship demo
// (index.html, harness/main.ts) installs both tooltips() and contextMenu() from the start.
// Right-click/menu behaviour (position, defaults filtered by `when`, items() append/reorder,
// click/Escape) is unit-tested end to end in src/extensions/features/context-menu.test.ts — a real
// page's own scroll-into-view races Popup's `dismissOn: 'scroll'` (D-S5-9) too easily to keep an
// e2e right-click scenario stable, so only the hover path (no such race) is covered here.

test('hovering a bar opens a tooltip with the entry name and dates', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-bracket)').first();
  await expect(bar).toBeVisible();

  await bar.hover();
  const tooltip = page.locator('#gantt .fg-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(page.locator('#gantt .fg-tooltip-title')).not.toBeEmpty();
  await expect(page.locator('#gantt .fg-tooltip-dates')).not.toBeEmpty();

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});

// [S5-A2]: harness/plugins.html installs weekendShading() — harness/plugins/weekend-shading.ts,
// written against the public 'freegantt' entry alone (D-S5-15/D-S5-16). Bands appear, follow a
// pan, and the page's own checkbox removes the plugin live (no core edit either way).
test('weekend bands appear, follow a pan, and a checkbox removes the plugin live', async ({ page }) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const bands = page.locator('#gantt .fg-range-band.demo-weekend-band');
  await expect(bands.first()).toBeVisible();
  const bandCountBefore = await bands.count();
  expect(bandCountBefore).toBeGreaterThan(0);

  const firstBandBefore = await bands.first().boundingBox();
  if (!firstBandBefore) throw new Error('missing bounding box');

  // Pans the visible window right, through the same core command (freegantt.panRight) a pointer
  // gesture binds to — real keyboard interaction, not an imperative call into the Gantt. Focus
  // must land on the container itself (the one honest tab stop, view/pane-layout.ts) for the
  // shell's keydown listener to see it — same pattern e2e/hierarchy.spec.ts's own ArrowRight test uses.
  const ganttRoot = page.locator('#gantt');
  await ganttRoot.focus();
  await expect(ganttRoot).toBeFocused();

  // Presses inside the poll itself (not once, up front): a worker under load can still be settling
  // the page's own initial today-line pan when `firstBandBefore` above was captured, so a single
  // burst of key presses can race that settle. Pressing again on every retry is self-healing either way.
  await expect
    .poll(async () => {
      await page.keyboard.press('ArrowRight');
      const box = await bands.first().boundingBox();
      return box?.x ?? null;
    })
    .not.toBe(firstBandBefore.x);

  // The checkbox removes the plugin live — every band disappears, no remount of anything else.
  const toggle = page.locator('#weekend-shading-toggle');
  await toggle.uncheck();
  await expect(bands).toHaveCount(0);

  await toggle.check();
  await expect(bands.first()).toBeVisible();
});

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4, D-S5-23/24): harness/editing.html installs
// lockEntries() — harness/plugins/lock-entries.ts, written against the public 'freegantt' entry
// alone — and its checkbox locks entry-15 through the plugin's own store. Two seams, one demo: the
// extension hook ghosts the locked bar while a neighbour drags, and `beforeChange` refuses the drop.
test('a locked bar ghosts alongside a dragged neighbour, and the drop is refused', async ({ page }) => {
  await page.goto('/editing.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#lock-entry').check();

  const dragged = page.locator('#gantt .fg-bar[data-item-id^="entry-14:"]').first();
  const locked = page.locator('#gantt .fg-bar[data-item-id^="entry-15:"]').first();
  await expect(dragged).toBeVisible();
  await expect(locked).toBeVisible();

  const draggedBefore = await dragged.boundingBox();
  const lockedBefore = await locked.boundingBox();
  if (!draggedBefore || !lockedBefore) throw new Error('missing bounding box');

  await page.mouse.move(draggedBefore.x + Math.min(draggedBefore.width / 2, 20), draggedBefore.y + 6);
  await page.mouse.down();
  await page.mouse.move(draggedBefore.x + Math.min(draggedBefore.width / 2, 20) + 120, draggedBefore.y + 6, {
    steps: 8,
  });

  // The preview is rAF-coalesced, so poll rather than read once: the locked bar moves too, because
  // the plugin's extender wrote its dates into the same draft.
  await expect
    .poll(async () => (await locked.boundingBox())?.x ?? lockedBefore.x)
    .toBeGreaterThan(lockedBefore.x + 8);

  await page.mouse.up();

  // The drop is refused, so both bars land back where they started and the page logs the refusal.
  // A store-only commit repaints on the next frame (#161), so every post-commit read polls.
  await expect(page.locator('#toast')).toContainText('entry-15 is locked');
  await expect.poll(async () => (await locked.boundingBox())?.x).toBe(lockedBefore.x);
  await expect.poll(async () => (await dragged.boundingBox())?.x).toBe(draggedBefore.x);
  await expect(page.locator('#log')).toContainText('refused (locked)');
});
