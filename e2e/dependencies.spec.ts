import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
    __dependencies: import('freegantt').EntryDependencies;
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

async function centerOf(locator: import('@playwright/test').Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the node has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The screen point on the dot of a bar's edge port: 5 px outside the edge, at mid height. */
async function edgeDotOf(page: Page, id: string, edge: 'start' | 'end'): Promise<{ x: number; y: number }> {
  const box = await barOf(page, id).boundingBox();
  if (box === null) throw new Error('the bar has no box');
  return { x: edge === 'start' ? box.x - 5 : box.x + box.width + 5, y: box.y + box.height / 2 };
}

/** Drags from the `fromEdge` port of `fromId` to the `toEdge` port of `toId`, then releases. */
async function dragBetweenPorts(
  page: Page,
  from: { id: string; edge: 'start' | 'end' },
  to: { id: string; edge: 'start' | 'end' },
): Promise<void> {
  await barOf(page, from.id).hover();
  const origin = await edgeDotOf(page, from.id, from.edge);
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  const overTarget = await centerOf(barOf(page, to.id));
  await page.mouse.move(overTarget.x, overTarget.y, { steps: 8 });
  const target = await edgeDotOf(page, to.id, to.edge);
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

test('a connect drag onto a bar that starts too early moves that bar, and undo puts it back', async ({
  page,
}) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const startOf = (id: string) => page.evaluate((entry) => window.__dataset.entries.get(entry)?.start, id);
  const before = await startOf('structure-3');
  const predecessorEnd = await page.evaluate(() => window.__dataset.entries.get('structure-2')?.end);
  expect(predecessorEnd).toBeGreaterThan(before!);

  await dragBetweenPorts(page, { id: 'structure-2', edge: 'end' }, { id: 'structure-3', edge: 'start' });

  await expect.poll(() => startOf('structure-3')).toBe(predecessorEnd);

  await page.evaluate(() => window.__gantt.commands.run('freegantt.undo'));
  await expect(
    page.locator('#gantt [data-connector-id="dependency:structure-2:FS:structure-3"]'),
  ).toHaveCount(0);
  await expect.poll(() => startOf('structure-3')).toBe(before);
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

// Select, move through and delete a connector. A connector line is thin, so a click aims at the
// middle of its stroke, which only a browser can measure.

const lineOf = (page: Page, id: string) => page.locator(`#gantt [data-connector-id="dependency:${id}"]`);

/** The screen point at the middle of a line's stroke. */
async function strokeMiddleOf(
  locator: import('@playwright/test').Locator,
): Promise<{ x: number; y: number }> {
  return locator.evaluate((node) => {
    const path = node as unknown as SVGGeometryElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM()!;
    return { x: point.x * matrix.a + matrix.e, y: point.y * matrix.d + matrix.f };
  });
}

test('every connector reads in the accessibility tree, and one is the tab stop', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await expect(page.getByRole('img', { name: 'Foundation 1 → Foundation 2' })).toHaveCount(1);
  await expect(page.locator('#gantt [data-connector-id][tabindex="0"]')).toHaveCount(1);
});

test('a click on a connector focuses it and leaves the Entry selection alone', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const before = await page.evaluate(() => window.__gantt.selectedEntryIds);

  const point = await strokeMiddleOf(lineOf(page, 'dep-fs'));
  await page.mouse.click(point.x, point.y);

  await expect(lineOf(page, 'dep-fs')).toBeFocused();
  expect(await page.evaluate(() => window.__gantt.selectedEntryIds)).toEqual(before);
});

test('arrow keys move focus between connectors', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const ids = await connectorIds(page);
  const order = await page
    .locator('#gantt [data-connector-id]')
    .evaluateAll((nodes) => nodes.map((node) => (node as SVGElement).dataset['connectorId']!));
  expect(ids.length).toBeGreaterThan(1);

  await page.locator(`#gantt [data-connector-id="${order[0]}"]`).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`#gantt [data-connector-id="${order[1]}"]`)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(`#gantt [data-connector-id="${order[0]}"]`)).toBeFocused();
});

test('Delete on a focused connector removes its Dependency, and one undo restores it', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await lineOf(page, 'dep-fs').focus();

  await page.keyboard.press('Delete');

  await expect(lineOf(page, 'dep-fs')).toHaveCount(0);
  await expect(page.locator('#dependency-readout')).not.toContainText('dep-fs');
  await expect(page.locator('#removal-readout')).toContainText('dep-fs');
  expect(await page.evaluate(() => window.__dataset.entries.has('foundation-1'))).toBe(true);

  await page.evaluate(() => window.__gantt.commands.run('freegantt.undo'));
  await expect(lineOf(page, 'dep-fs')).toHaveCount(1);
  await expect(page.locator('#dependency-readout')).toContainText('dep-fs');
});

test('Delete on a focused bar still removes the Entry, not a Dependency', async ({ page }) => {
  await page.goto('/dependencies.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const dependenciesBefore = await page.evaluate(() => window.__dependencies.all().length);
  await page.locator('#gantt .fg-bar[data-bar-id^="structure-4"]').focus();

  await page.keyboard.press('Delete');

  await expect(page.locator('#gantt .fg-bar[data-bar-id^="structure-4"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__dependencies.all().length)).toBeLessThanOrEqual(
    dependenciesBefore,
  );
  expect(await page.evaluate(() => window.__dataset.entries.has('structure-4'))).toBe(false);
});
