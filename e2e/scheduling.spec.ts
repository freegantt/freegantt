import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
    __calendar: import('freegantt').WorkingCalendar;
  }
}

// The scheduling plugin in a real browser: a bar drag runs the engine, and one undo restores every task.

const startMs = (page: Page, id: string): Promise<number> =>
  page.evaluate((entryId) => Number(window.__dataset.entries.get(entryId)?.start), id);

const bar = (page: Page, id: string) => page.locator(`#gantt .fg-bar[data-bar-id^="${id}"]`).first();

/** Pixels of one day: the Plan bar spans three days. */
async function pixelsPerDay(page: Page): Promise<number> {
  const box = await bar(page, 'plan').boundingBox();
  expect(box).not.toBeNull();
  return box!.width / 3;
}

async function dragBarByDays(page: Page, id: string, days: number): Promise<void> {
  const perDay = await pixelsPerDay(page);
  const box = await bar(page, id).boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + days * perDay, y, { steps: 10 });
  await page.mouse.up();
}

async function openScheduling(page: Page): Promise<void> {
  await page.goto('/scheduling.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
}

const startsOf = (page: Page) =>
  page.evaluate(() =>
    ['plan', 'design', 'build', 'test', 'handover', 'launch'].map((id) =>
      Number(window.__dataset.entries.get(id)?.start),
    ),
  );

test('dragging a predecessor later moves its successors, and one undo restores them all', async ({
  page,
}) => {
  await openScheduling(page);
  const before = await startsOf(page);

  await dragBarByDays(page, 'plan', 4);

  await expect.poll(async () => (await startsOf(page))[0]).toBeGreaterThan(before[0]!);
  const after = await startsOf(page);
  for (const [index, start] of after.entries()) expect(start).toBeGreaterThan(before[index]!);

  await page.evaluate(() => window.__dataset.undo());
  expect(await startsOf(page)).toEqual(before);
});

test('dragging a predecessor earlier pulls its successors', async ({ page }) => {
  await openScheduling(page);
  await dragBarByDays(page, 'plan', 4);
  await expect.poll(async () => (await startsOf(page))[1]).toBeGreaterThan(0);
  const later = await startsOf(page);

  // Three days back ends Plan on a Friday. Two days back would end it on a Saturday, and Design still starts Monday.
  await dragBarByDays(page, 'plan', -3);

  await expect.poll(async () => (await startsOf(page))[1]).toBeLessThan(later[1]!);
  const earlier = await startsOf(page);
  expect(earlier[2]).toBeLessThan(later[2]!);
  expect(earlier[5]).toBeLessThan(later[5]!);
});

test('dragging a task before its predecessor ends keeps it behind the predecessor', async ({ page }) => {
  await openScheduling(page);
  const designBefore = await startMs(page, 'design');

  await dragBarByDays(page, 'design', -2);

  await expect.poll(() => page.evaluate(() => window.__dataset.canUndo)).toBe(true);
  expect(await startMs(page, 'design')).toBe(designBefore);
});

test('a manually scheduled task stays put and the page reports the broken link', async ({ page }) => {
  await openScheduling(page);
  const manualCell = page.locator('.fg-row[data-entry-id="design"] [data-field="manuallyScheduled"]');
  await expect(page.locator('.fg-col-header[data-field="manuallyScheduled"]')).toBeVisible();
  await manualCell.click();
  await expect(manualCell.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  const designBefore = await startMs(page, 'design');

  await dragBarByDays(page, 'plan', 4);

  await expect.poll(() => startMs(page, 'plan')).toBeGreaterThan(0);
  expect(await startMs(page, 'design')).toBe(designBefore);
  await expect(page.locator('#diagnostics-readout')).toContainText('blocked-move');
});

test('the page lists the members of a cycle and flags their connectors', async ({ page }) => {
  await openScheduling(page);

  await expect(page.locator('#cycle-members li')).toHaveText(['Loop A', 'Loop B', 'Loop C']);
  await expect(page.locator('#gantt [data-connector-id="dependency:link-back"]')).toHaveAttribute(
    'data-flag',
    /cycle/,
  );
  await expect(page.locator('#gantt [data-connector-id="dependency:link-fs"]')).not.toHaveAttribute(
    'data-flag',
    /cycle/,
  );

  await page.locator('#break-cycle-btn').click();

  await expect(page.locator('#cycle-members li')).toHaveCount(0);
});

test('a successor skips a holiday, and the skip matches the shaded days', async ({ page }) => {
  await openScheduling(page);
  const holidayEnd = Date.UTC(2026, 2, 13);

  // Plan moves to Sunday March 8 and ends on Wednesday March 11, the first holiday. Design cannot start there.
  await dragBarByDays(page, 'plan', 6);

  await expect.poll(() => startMs(page, 'design')).toBeGreaterThanOrEqual(holidayEnd);
  const startsOnWorkday = await page.evaluate(() => {
    const start = window.__dataset.entries.get('design')?.start;
    return start !== undefined && window.__calendar.isWorkday(start, window.__dataset.time);
  });
  expect(startsOnWorkday).toBe(true);

  const designBox = await bar(page, 'design').boundingBox();
  expect(designBox).not.toBeNull();
  const bands = await page.locator('#gantt .fg-range-band.fg-time-shading').evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, right } = node.getBoundingClientRect();
      return { x, right };
    }),
  );
  expect(bands.length).toBeGreaterThan(0);
  const startX = designBox!.x + 1;
  expect(bands.some((band) => startX > band.x && startX < band.right)).toBe(false);
});
