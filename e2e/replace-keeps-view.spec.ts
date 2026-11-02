import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
  }
}

// A consumer replaces every entry at once. `entries.syncAll()` keeps the view: scroll position,
// zoom, and collapsed groups. The Sync button on this page calls it with the whole server list.
test('a full sync keeps scroll, zoom and a collapsed group', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // The group with the fewest descendants: collapsing a big one would leave a page too short to scroll.
  const parentId = await page.evaluate(() => {
    const groups = window.__dataset.entries.all.filter((entry) => entry.hasChildren);
    return groups.sort((a, b) => a.descendants().length - b.descendants().length)[0]?.id;
  });
  if (parentId === undefined) throw new Error('the page holds no parent entry');

  await page.evaluate((id) => window.__gantt.collapse(id), parentId);
  await page.evaluate(() => window.__gantt.zoomBy(2));
  // The zoom paints on the next frame, so wait for it before any reading.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  await page.evaluate(() => {
    const pane = document.querySelector('#gantt .fg-timeline-pane')!;
    pane.scrollLeft = 120;
    pane.scrollTop = 40;
  });
  const paneScroll = () =>
    page.evaluate(() => {
      const pane = document.querySelector('#gantt .fg-timeline-pane')!;
      return { left: pane.scrollLeft, top: pane.scrollTop };
    });
  await expect.poll(paneScroll).toEqual({ left: 120, top: 40 });
  // Zoom reads as pixels per millisecond on a bar that spans. A sync can re-date entries and move
  // the dataset range, so the bar on screen may differ after it. The ratio does not.
  const pixelsPerMillisecond = (): Promise<number | undefined> =>
    page.evaluate(() => {
      for (const bar of Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-bar[data-bar-id]'))) {
        const entry = window.__dataset.entries.get(bar.dataset['barId']!.split(':')[0]!);
        if (entry === undefined || entry.hasChildren || entry.start === undefined || entry.end === undefined)
          continue;
        return bar.getBoundingClientRect().width / (Number(entry.end) - Number(entry.start));
      }
      return undefined;
    });
  const zoomBefore = await pixelsPerMillisecond();
  expect(zoomBefore).toBeGreaterThan(0);
  const collapsedBefore = await page.evaluate(() => window.__gantt.collapsed);
  expect(collapsedBefore).toContain(parentId);

  await page.locator('#sync-all-btn').click();
  await expect(page.locator('#log div').first()).toContainText('synced from the server');

  expect(await paneScroll()).toEqual({ left: 120, top: 40 });
  expect(await pixelsPerMillisecond()).toBeCloseTo(zoomBefore!, 9);
  expect(await page.evaluate(() => window.__gantt.collapsed)).toEqual(collapsedBefore);
});
