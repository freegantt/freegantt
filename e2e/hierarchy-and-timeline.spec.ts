import { test, expect, type Page } from '@playwright/test';

// harness/hierarchy-and-timeline.ts merges the old hierarchy/owning-parent/bar-label-fit/zoom/
// entries-outside-the-range demo pages into one. This spec proves a slice of each: row sources
// re-resolve live, a fixed range hides entries that fall outside it, and an owning parent's dates
// hold still while its children move.

async function gotoHierarchyAndTimeline(page: Page): Promise<void> {
  await page.goto('/hierarchy-and-timeline.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
}

test('switching row source to grouped replaces the tree with team rows', async ({ page }) => {
  await gotoHierarchyAndTimeline(page);

  const labelsBefore = await page.locator('#gantt .fg-row-label').allTextContents();
  expect(labelsBefore).not.toContain('alpha');

  await page.selectOption('#rows-mode', 'grouped');

  await expect.poll(async () => page.locator('#gantt .fg-row-label').allTextContents()).toContain('alpha');
});

test('a fixed range hides entries that start or end outside it, fit-to-data shows them again', async ({
  page,
}) => {
  await gotoHierarchyAndTimeline(page);

  const barsBefore = await page.locator('#gantt .fg-bar').count();

  await page.selectOption('#range-mode', 'fixed');
  await expect.poll(() => page.locator('#gantt .fg-bar').count()).toBeLessThan(barsBefore);

  await page.selectOption('#range-mode', 'fit');
  await expect.poll(() => page.locator('#gantt .fg-bar').count()).toBe(barsBefore);
});

test('the owning parent keeps its own dates while a child moves (#470)', async ({ page }) => {
  await gotoHierarchyAndTimeline(page);
  await expect(page.locator('#owning-parent-gantt .fg-bar-summary')).toBeVisible();

  const phaseBefore = await page.evaluate(() => {
    const entry = window.__owningParentGantt.dataset.entries.get('phase')!;
    return [Number(entry.start), Number(entry.end)];
  });

  const taskA = page.locator('#owning-parent-gantt .fg-bar', { hasText: 'Task A' });
  await taskA.scrollIntoViewIfNeeded();
  const box = (await taskA.boundingBox())!;
  const grabX = box.x + Math.min(box.width / 2, 20);
  const grabY = box.y + box.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 80, grabY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => Number(window.__owningParentGantt.dataset.entries.get('task-a')!.start)))
    .toBeGreaterThan(phaseBefore[0]!);

  const phaseAfter = await page.evaluate(() => {
    const entry = window.__owningParentGantt.dataset.entries.get('phase')!;
    return [Number(entry.start), Number(entry.end)];
  });
  // Task A's move never touches Phase — `rollUp: 'none'` means nothing recomputes it.
  expect(phaseAfter).toEqual(phaseBefore);
});
