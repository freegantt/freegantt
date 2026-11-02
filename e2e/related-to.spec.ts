import { test, expect } from '@playwright/test';

// The connector seam in a real browser: layout/ routes and clips the line, render/ draws it as SVG.
// Only a real browser proves a scrolled window: happy-dom runs no layout, so it has no scroll range.

const FAR_CONNECTOR = 'related:seeded-0:end:seeded-59:start';

const connectorIds = (page: import('@playwright/test').Page) =>
  page
    .locator('#gantt [data-connector-id]')
    .evaluateAll((nodes) => nodes.map((node) => (node as SVGElement).dataset['connectorId']!));

test('a plugin draws a connector for each related pair, and names it for a screen reader', async ({
  page,
}) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const near = page.locator('#gantt [data-connector-id="related:seeded-0:end:seeded-1:start"]');
  await expect(near).toHaveCount(1);
  await expect(near).toHaveAttribute('role', 'img');
  await expect(near).toHaveAttribute('aria-label', /is related to/);
  await expect(near).toHaveAttribute('class', /fg-connector/);
});

test('a connector stays drawn while one end is outside the window and its path crosses it', async ({
  page,
}) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await expect(page.locator(`#gantt [data-connector-id="${FAR_CONNECTOR}"]`)).toHaveCount(1);

  const pane = page.locator('#gantt .fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // Neither end of the pair is rendered now: the first Entry scrolled off the top, the last has
  // not scrolled into view. The long line between them still crosses the window.
  const far = await page.evaluate(() => {
    const ids = (
      window as unknown as { __gantt: { dataset: { entries: { all: { id: string }[] } } } }
    ).__gantt.dataset.entries.all.map((entry) => entry.id);
    const rendered = new Set(
      Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-bar')).map(
        (bar) => bar.dataset['barId']!,
      ),
    );
    return {
      firstRendered: [...rendered].some((id) => id.startsWith(`${ids[0]}`)),
      lastRendered: [...rendered].some((id) => id.startsWith(`${ids[ids.length - 1]}`)),
    };
  });
  expect(far.firstRendered).toBe(false);
  expect(far.lastRendered).toBe(false);
  expect(await connectorIds(page)).toContain(FAR_CONNECTOR);
});

// The connect gesture in a real browser. happy-dom runs no layout, so only a browser proves the ports
// sit beside the bar edges and a pointer can reach them.

type Page = import('@playwright/test').Page;

const barOf = (page: Page, id: string) => page.locator(`#gantt .fg-bar[data-bar-id^="${id}"]`);
const visiblePorts = (page: Page) => page.locator('#gantt .fg-connector-port:not([hidden])');
const portOf = (page: Page, edge: 'start' | 'end') =>
  page.locator(`#gantt .fg-connector-port[data-edge="${edge}"]:not([hidden])`);

async function centerOf(locator: import('@playwright/test').Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the node has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags from `fromId`'s end port to `toId`'s start port, and releases when `release` is true. */
async function dragEndToStart(page: Page, fromId: string, toId: string, release = true): Promise<void> {
  await barOf(page, fromId).hover();
  const from = await centerOf(portOf(page, 'end'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const overTarget = await centerOf(barOf(page, toId));
  await page.mouse.move(overTarget.x, overTarget.y, { steps: 8 });
  const to = await centerOf(portOf(page, 'start'));
  await page.mouse.move(to.x, to.y, { steps: 4 });
  if (release) await page.mouse.up();
}

const connectorBetween = (page: Page, fromId: string, toId: string) =>
  page.locator(`#gantt [data-connector-id="related:${fromId}:end:${toId}:start"]`);

test('hovering a bar shows a port at each edge', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await barOf(page, 'seeded-8').hover();

  await expect(visiblePorts(page)).toHaveCount(2);
  await expect(portOf(page, 'start')).toBeVisible();
  await expect(portOf(page, 'end')).toBeVisible();
});

test('dragging from one port to a port on another bar draws a new connector', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(0);

  await dragEndToStart(page, 'seeded-8', 'seeded-9', false);
  await expect(page.locator('#gantt .fg-connect-preview')).toBeVisible();
  await expect(portOf(page, 'start')).toHaveAttribute('data-active', '');
  await page.mouse.up();

  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(1);
  await expect(page.locator('#connect-log')).toHaveText(/seeded-8 \(end\) → seeded-9 \(start\)/);
  await expect(page.locator('#gantt .fg-connect-preview')).toBeHidden();
});

test('Escape cancels a drag and adds no connector', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await dragEndToStart(page, 'seeded-8', 'seeded-9', false);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-connect-preview')).toBeHidden();
});

test('a drop on the same Entry’s own edge, or on no bar, adds nothing', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await barOf(page, 'seeded-8').hover();
  const from = await centerOf(portOf(page, 'end'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const own = await centerOf(portOf(page, 'start'));
  await page.mouse.move(own.x, own.y, { steps: 6 });
  await page.mouse.up();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();

  await expect(page.locator('#connect-log')).toHaveText('No connect yet.');
});

test('a beforeConnect handler that waits holds the drop, and the line shows it', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await page.locator('#hold-connect').check();

  await dragEndToStart(page, 'seeded-8', 'seeded-9');

  await expect(page.locator('#gantt .fg-connect-preview[data-pending]')).toBeVisible();
  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(0);
  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(1);
  await expect(page.locator('#gantt .fg-connect-preview')).toBeHidden();
});

test('Escape during the hold ends the wait and adds no connector', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await page.locator('#hold-connect').check();

  await dragEndToStart(page, 'seeded-8', 'seeded-9');
  await expect(page.locator('#gantt .fg-connect-preview[data-pending]')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.locator('#gantt .fg-connect-preview')).toBeHidden();
  await page.waitForTimeout(900);
  await expect(connectorBetween(page, 'seeded-8', 'seeded-9')).toHaveCount(0);
});

test('a locked Entry shows no port, and a neighbour still does', async ({ page }) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await expect(page.locator('#locked-note')).toContainText('Seeded entry 4');

  await barOf(page, 'seeded-4').hover();
  await expect(visiblePorts(page)).toHaveCount(0);

  await barOf(page, 'seeded-5').hover();
  await expect(visiblePorts(page)).toHaveCount(2);
});

test('a page with no connect handler draws no port', async ({ page }) => {
  await page.goto('/generic.html');
  const bar = page.locator('#gantt .fg-bar').nth(3);
  await expect(bar).toBeVisible();

  await bar.hover({ force: true });
  await expect(page.locator('#gantt .fg-bar:hover')).toHaveCount(1); // the pointer really is on a bar

  await expect(page.locator('#gantt .fg-connector-port')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-connect-preview')).toHaveCount(0);
});
