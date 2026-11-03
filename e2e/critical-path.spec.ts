import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
  }
}

// The Critical path page in a real browser: a variant rule paints the critical bars, and the button prints
// the driving path of the selected task.

const bar = (page: Page, id: string) => page.locator(`#gantt .fg-bar[data-bar-id^="${id}"]`).first();

async function openPage(page: Page): Promise<void> {
  await page.goto('/critical-path.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
}

test('critical bars wear the critical variant at load, and the short branch does not', async ({ page }) => {
  await openPage(page);
  for (const id of ['survey', 'utilities', 'permits', 'inspection']) {
    await expect(bar(page, id)).toHaveAttribute('data-variant', 'critical');
  }
  await expect(bar(page, 'foundation')).not.toHaveAttribute('data-variant', 'critical');
  const float = await page.evaluate(() => window.__dataset.entries.get('foundation')?.read('float'));
  expect(float).toBe(1);
});

test('delaying the short branch past its float makes it critical, and undo restores the old paint', async ({
  page,
}) => {
  await openPage(page);
  await page.evaluate(() => {
    const day = 86_400_000;
    const foundation = window.__dataset.entries.get('foundation')!;
    window.__dataset.entries.update('foundation', {
      start: Number(foundation.start) + day,
      end: Number(foundation.end) + day,
    });
  });
  await expect(bar(page, 'foundation')).toHaveAttribute('data-variant', 'critical');
  await page.evaluate(() => window.__dataset.undo());
  await expect(bar(page, 'foundation')).not.toHaveAttribute('data-variant', 'critical');
});

test('Log driving path prints the chain that holds the selected task', async ({ page }) => {
  await openPage(page);
  const readout = page.locator('#driving-path-readout');
  await expect(readout).toHaveText('Driving path: select a task');
  await page.evaluate(() => {
    window.__gantt.selectedEntryIds = ['inspection'];
  });
  await page.getByRole('button', { name: 'Log driving path' }).click();
  await expect(readout).toHaveText('Driving path: Survey → Utilities → Permits → Inspection');
});
