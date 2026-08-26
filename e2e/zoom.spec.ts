import { test, expect } from '@playwright/test';

// e2e fixture for S1.9's acceptance checks (plans/s1.9-presets-and-zoom/README.md §6, §9):
// harness/zoom.html mounts one Gantt and exposes it on `window.__gantt` (no wheel/pointer gesture
// controller exists until S4 — this is the wheel-zoom-equivalent the spec asks for, driving
// `zoomBy` imperatively the same way a future gesture handler would).

declare global {
  interface Window {
    __gantt: import('../src/api/index.js').Gantt;
  }
}

test('zoomBy keeps the anchored pointer position visually fixed (U2/U3)', async ({ page }) => {
  await page.goto('/zoom.html');
  const pane = page.locator('.fg-timeline-pane');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  const paneBefore = await pane.boundingBox();
  const barBefore = await bar.boundingBox();
  if (!paneBefore || !barBefore) throw new Error('missing bounding box');

  // Anchor exactly on this bar's current left edge, in pane-local (viewport) pixels — the same
  // coordinate a real pointer's clientX-relative-to-pane would supply.
  const anchorX = barBefore.x - paneBefore.x;

  await page.evaluate((x) => window.__gantt.zoomBy(2, x), anchorX);

  // The anchored instant (this bar's start) must render at the same pane-local x afterward, even
  // though the bar's own content-space x and the pane's scrollLeft both changed to get there.
  await expect
    .poll(async () => {
      const paneAfter = await pane.boundingBox();
      const barAfter = await bar.boundingBox();
      if (!paneAfter || !barAfter) return null;
      return barAfter.x - paneAfter.x;
    })
    .toBeGreaterThan(anchorX - 2);

  const paneAfter = await pane.boundingBox();
  const barAfter = await bar.boundingBox();
  if (!paneAfter || !barAfter) throw new Error('missing bounding box');
  expect(Math.abs(barAfter.x - paneAfter.x - anchorX)).toBeLessThan(2);

  // The zoom actually did something — the bar is wider than before (2x pxPerMs).
  expect(barAfter.width).toBeGreaterThan(barBefore.width * 1.5);
});

test('a preset switch redraws header bands with no bar remount (U1, I8)', async ({ page }) => {
  await page.goto('/zoom.html');
  const bar = page.locator('.fg-bar').first();
  await expect(bar).toBeVisible();

  const itemId = await bar.getAttribute('data-item-id');
  expect(itemId).toBeTruthy();

  // Tag the live DOM node so a remount (a fresh element replacing it) is detectable even though
  // the replacement would carry the same data-item-id.
  await page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`.fg-bar[data-item-id="${id}"]`)!;
    node.dataset['e2eMarker'] = 'still-here';
  }, itemId);

  await expect(page.locator('.fg-band')).toHaveCount(1);

  await page.evaluate(() => {
    window.__gantt.preset = 'weekAndMonth';
  });

  await expect(page.locator('.fg-band')).toHaveCount(2);

  const marker = await page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`.fg-bar[data-item-id="${id}"]`);
    return node?.dataset['e2eMarker'];
  }, itemId);
  expect(marker).toBe('still-here');
});
