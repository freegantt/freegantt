import { test, expect } from '@playwright/test';

// e2e fixture for S1.9's acceptance checks (plans/s1.9-presets-and-zoom/README.md §6, §9):
// harness/zoom.html mounts one Gantt and exposes it on `window.__gantt` (no wheel/pointer gesture
// controller exists until S4 — this is the wheel-zoom-equivalent the spec asks for, driving
// `zoomBy` imperatively the same way a future gesture handler would).

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

test('[S1-A3] zoomBy keeps the anchored pointer position visually fixed (U2/U3)', async ({ page }) => {
  await page.goto('/zoom.html');
  const pane = page.locator('.fg-timeline-pane');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const paneBefore = await pane.boundingBox();
  if (!paneBefore) throw new Error('missing bounding box');

  // A bar near the pane's own centre, identified by its stable `data-item-id` (not DOM position,
  // which windowing can reshuffle once `zoomBy` changes what's horizontally visible) and not
  // `.first()`: the page now loads panned to the today line with only `todayLineMarginTicks`' worth
  // of margin (S1.13 follow-up), so horizontal culling can drop the dataset's first entries from
  // the DOM outright, or clip them against the pane's own left edge — an edge case this test isn't
  // about.
  const itemId = await page.evaluate(
    (viewportX) => {
      const atAnchor = Array.from(document.querySelectorAll<HTMLElement>('.fg-bar')).find((el) => {
        const rect = el.getBoundingClientRect();
        return viewportX >= rect.left && viewportX <= rect.right;
      });
      return atAnchor?.dataset['itemId'] ?? null;
    },
    paneBefore.x + paneBefore.width / 2,
  );
  if (!itemId) throw new Error('no bar under the pane centre');
  const bar = page.locator(`.fg-bar[data-item-id="${itemId}"]`);
  const barBefore = await bar.boundingBox();
  if (!barBefore) throw new Error('missing bounding box');

  // Anchor exactly on this bar's current left edge, in pane-local (viewport) pixels — the same
  // coordinate a real pointer's clientX-relative-to-pane would supply.
  const anchorX = barBefore.x - paneBefore.x;

  await page.evaluate((x) => window.__gantt.zoomBy(2, x), anchorX);

  // The anchored instant must render at the same pane-local x afterward, even though the bar's own
  // content-space x and the pane's scrollLeft both changed to get there.
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

  // Scoped to the header (S1.12, D-S1.12-9): the grid pane's spacer now mirrors one empty
  // `.fg-band` per header band too, so an unscoped `.fg-band` count would double-count.
  await expect(page.locator('.fg-header .fg-band')).toHaveCount(1);

  await page.evaluate(() => {
    window.__gantt.preset = 'weekAndMonth';
  });

  await expect(page.locator('.fg-header .fg-band')).toHaveCount(2);

  const marker = await page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`.fg-bar[data-item-id="${id}"]`);
    return node?.dataset['e2eMarker'];
  }, itemId);
  expect(marker).toBe('still-here');
});

test('[S1-A6] a multi-year fixture at the day preset scrolls at the density floor instead of compressing', async ({
  page,
}) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.getByLabel('multi-year').check();
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.fit = 'pane';
    window.__gantt.preset = 'day';
  });

  const pane = page.locator('.fg-timeline-pane');
  await expect
    .poll(async () => {
      const { scrollWidth, clientWidth } = await pane.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      return scrollWidth > clientWidth;
    })
    .toBe(true);
});

test('[S1-A8] a three-band preset renders three full-height bands aligned with the grid spacer', async ({
  page,
}) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.preset = 'dayWeekMonth';
  });

  const headerBands = page.locator('.fg-header .fg-band');
  await expect(headerBands).toHaveCount(3);
  const spacerBands = page.locator('.fg-grid-spacer .fg-band');
  await expect(spacerBands).toHaveCount(3);

  const headerBox = await page.locator('.fg-header').boundingBox();
  const spacerBox = await page.locator('.fg-grid-spacer').boundingBox();
  if (!headerBox || !spacerBox) throw new Error('missing bounding box');
  // Sub-pixel layout: one CSS pixel of disagreement is the D-S1.8-12 residue, not a height bug.
  expect(Math.abs(headerBox.height - spacerBox.height)).toBeLessThan(1);

  const bandBox = await headerBands.first().boundingBox();
  if (!bandBox) throw new Error('missing band box');
  expect(bandBox.height).toBeGreaterThan(10);
});

test('[S1-A9] the header stays pinned to the top of the timeline pane while rows scroll under it', async ({
  page,
}) => {
  await page.goto('/large-dataset.html');
  await expect(page.locator('[data-testid="fg-row"]').first()).toBeVisible();

  const header = page.locator('.fg-header');
  const pane = page.locator('.fg-timeline-pane');
  const yBefore = (await header.boundingBox())?.y;
  if (yBefore === undefined) throw new Error('missing header box');

  await pane.evaluate((el) => {
    el.scrollTop = 400;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect.poll(async () => (await header.boundingBox())?.y).toBeCloseTo(yBefore, 0);
});

test('[S1-A10] Today pans so the today line sits in the pane', async ({ page }) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.panToDate('2099-01-01', 'start');
  });

  await page.getByRole('button', { name: 'Today' }).click();

  const line = page.locator('.fg-date-line');
  await expect(line).toBeVisible();
  const pane = page.locator('.fg-timeline-pane');
  await expect
    .poll(async () => {
      const paneBox = await pane.boundingBox();
      const lineBox = await line.boundingBox();
      if (!paneBox || !lineBox) return false;
      return lineBox.x >= paneBox.x - 1 && lineBox.x <= paneBox.x + paneBox.width + 1;
    })
    .toBe(true);
});
