import { test, expect } from '@playwright/test';

// The gap: `.fg-row-band` carried `data-parity` and `data-row-id` and nothing else, so a hovered or
// selected row painted in the grid pane and stopped dead at the splitter. The row now carries a
// `data-state` on both nodes, written from one answer.
//
// Only a real browser proves it: jsdom resolves no `background-color` from the theme tokens, and the
// hover itself needs a real pointer over a real laid-out row (same reasoning as e2e/row-stripes.spec.ts).

async function paintOf(page: import('@playwright/test').Page, rowId: string) {
  return page.evaluate((id) => {
    const read = (selector: string): { state: string; paint: string } | null => {
      const el = document.querySelector<HTMLElement>(selector);
      return el === null
        ? null
        : { state: el.dataset['state'] ?? '', paint: getComputedStyle(el).backgroundColor };
    };
    return {
      row: read(`.fg-grid-pane .fg-row[data-row-id="${id}"]`),
      band: read(`.fg-timeline-pane .fg-row-band[data-row-id="${id}"]`),
    };
  }, rowId);
}

test('hovering a grid row paints its timeline band too, in the same colour', async ({ page }) => {
  await page.goto('/');
  const row = page.locator('#gantt .fg-grid-pane .fg-row').first();
  await expect(row).toBeVisible();
  const rowId = (await row.getAttribute('data-row-id'))!;

  const resting = await paintOf(page, rowId);
  expect(resting.row?.state).toBe('');
  expect(resting.band?.state).toBe('');

  await row.hover();

  await expect.poll(async () => (await paintOf(page, rowId)).row?.state).toBe('hovered');
  const hovered = await paintOf(page, rowId);
  expect(hovered.band?.state).toBe('hovered');
  // One row, one colour — the point of the fix, and the half a grid-only rule could never give.
  expect(hovered.band?.paint).toBe(hovered.row?.paint);
  expect(hovered.row?.paint).not.toBe(resting.row?.paint);
});

test('hovering a bar paints the grid row that owns it, across the splitter the other way', async ({
  page,
}) => {
  await page.goto('/');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary):not(.fg-bar-diamond)').first();
  await expect(bar).toBeVisible();

  await bar.hover();

  // The pointer never entered the grid pane. The row comes off the frame that drew the bar.
  const hoveredRowId = await page.evaluate(
    () =>
      document.querySelector<HTMLElement>('.fg-grid-pane .fg-row[data-state~="hovered"]')?.dataset['rowId'],
  );
  expect(hoveredRowId).toBeTruthy();
  const painted = await paintOf(page, hoveredRowId!);
  expect(painted.band?.state).toBe('hovered');
  // And the bar itself takes the ring D-S3-7's `hovered` token had no rule for until now.
  await expect(bar).toHaveAttribute('data-state', /hovered/);
  expect(await bar.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});
