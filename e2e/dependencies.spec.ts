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

// The connect drag in a real browser. Only a browser has ports beside the bar edges and a pointer
// that can reach them.

const barOf = (page: Page, id: string) => page.locator(`#gantt .fg-bar[data-bar-id^="${id}"]`);
const portOf = (page: Page, edge: 'start' | 'end') =>
  page.locator(`#gantt .fg-connector-port[data-edge="${edge}"]:not([hidden])`);

async function centerOf(locator: import('@playwright/test').Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the node has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags from the `fromEdge` port of `fromId` to the `toEdge` port of `toId`, then releases. */
async function dragBetweenPorts(
  page: Page,
  from: { id: string; edge: 'start' | 'end' },
  to: { id: string; edge: 'start' | 'end' },
): Promise<void> {
  await barOf(page, from.id).hover();
  const origin = await centerOf(portOf(page, from.edge));
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  const overTarget = await centerOf(barOf(page, to.id));
  await page.mouse.move(overTarget.x, overTarget.y, { steps: 8 });
  const target = await centerOf(portOf(page, to.edge));
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();
}

test('dragging from an end port to a start port creates a Finish-to-start Dependency, and undo removes it', async ({
  page,
}) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const created = page.locator('#gantt [data-connector-id="dependency:structure-2:FS:structure-3"]');
  await expect(created).toHaveCount(0);

  await dragBetweenPorts(page, { id: 'structure-2', edge: 'end' }, { id: 'structure-3', edge: 'start' });

  await expect(created).toHaveCount(1);
  await expect(page.locator('#dependency-readout')).toContainText('structure-2:FS:structure-3 (FS, 0d)');

  await page.evaluate(() => window.__gantt.commands.run('freegantt.undo'));
  await expect(created).toHaveCount(0);
  await expect(page.locator('#dependency-readout')).not.toContainText('structure-2:FS:structure-3');
});

test('dragging from a start port to a start port creates a Start-to-start Dependency, and undo removes it', async ({
  page,
}) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const created = page.locator('#gantt [data-connector-id="dependency:structure-2:SS:structure-4"]');
  await expect(created).toHaveCount(0);

  await dragBetweenPorts(page, { id: 'structure-2', edge: 'start' }, { id: 'structure-4', edge: 'start' });

  await expect(created).toHaveCount(1);
  await expect(page.locator('#dependency-readout')).toContainText('structure-2:SS:structure-4 (SS, 0d)');

  await page.evaluate(() => window.__gantt.commands.run('freegantt.undo'));
  await expect(created).toHaveCount(0);
});
