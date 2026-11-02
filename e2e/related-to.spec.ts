import { test, expect } from '@playwright/test';

// The connector seam in a real browser: layout/ routes and clips the line, render/ draws it as SVG.
// Only a real browser proves a scrolled window: happy-dom runs no layout, so it has no scroll range.

const connectorIds = (page: import('@playwright/test').Page) =>
  page
    .locator('#gantt [data-connector-id]')
    .evaluateAll((nodes) => nodes.map((node) => (node as SVGElement).dataset['connectorId']!));

test('a plugin draws a connector for each related pair, and names it for a screen reader', async ({
  page,
}) => {
  await page.goto('/related-to.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const near = page.locator('#gantt [data-connector-id="related:near"]');
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
  await expect(page.locator('#gantt [data-connector-id="related:far"]')).toHaveCount(1);

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
  expect(await connectorIds(page)).toContain('related:far');
});
