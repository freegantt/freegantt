import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
  }
}

// The Dependency store in a real browser: the plugin stores rows, core routes the connectors.
// Only a real browser has a scroll range and a painted SVG layer.

const connectorIds = (page: Page) =>
  page
    .locator('#gantt [data-connector-id]')
    .evaluateAll((nodes) => nodes.map((node) => (node as SVGElement).dataset['connectorId']!).sort());

const nextFrame = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test('the plugin draws a named connector for each Dependency', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // The four types sit inside the Foundation and Structure groups, near the top of the list.
  for (const id of ['dep-fs', 'dep-ss', 'dep-ff', 'dep-sf']) {
    await expect(page.locator(`#gantt [data-connector-id="dependency:${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-fs"]')).toHaveAttribute(
    'aria-label',
    'Foundation 1 → Foundation 2',
  );
});

test('Replace dependencies swaps the whole set and keeps scroll, zoom and a collapsed group', async ({
  page,
}) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#collapse-foundation-btn').click();
  await page.evaluate(() => window.__gantt.zoomBy(2));
  await nextFrame(page);
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
  const collapsedBefore = await page.evaluate(() => window.__gantt.collapsed);
  expect(collapsedBefore).toContain('foundation');
  const barWidth = () =>
    page.evaluate(
      () =>
        document.querySelector('#gantt .fg-bar[data-bar-id^="structure-1"]')!.getBoundingClientRect().width,
    );
  const zoomBefore = await barWidth();

  await page.locator('#replace-dependencies-btn').click();
  await nextFrame(page);

  await expect(page.locator('#dependency-readout')).toContainText('next-fs');
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-fs"]')).toHaveCount(0);
  expect(await connectorIds(page)).toEqual(expect.arrayContaining(['dependency:next-fs']));
  expect(await paneScroll()).toEqual({ left: 120, top: 40 });
  expect(await barWidth()).toBeCloseTo(zoomBefore, 6);
  expect(await page.evaluate(() => window.__gantt.collapsed)).toEqual(collapsedBefore);
});

test('removing an Entry removes its Dependencies, and undo restores both', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-fs"]')).toHaveCount(1);

  await page.locator('#remove-entry-btn').click();
  await expect(page.locator('#dependency-readout')).not.toContainText('dep-fs');
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-fs"]')).toHaveCount(0);
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-ss"]')).toHaveCount(0);

  await page.evaluate(() => window.__gantt.commands.run('freegantt.undo'));
  await expect(page.locator('#dependency-readout')).toContainText('dep-fs');
  await expect(page.locator('#gantt [data-connector-id="dependency:dep-fs"]')).toHaveCount(1);
});
