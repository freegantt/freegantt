import { test, expect } from '@playwright/test';

// e2e fixture for S1.13's acceptance checks (plans/s1.13-date-lines/README.md §6). harness/zoom.html
// mounts one Gantt on window.__gantt (see e2e/zoom.spec.ts) over a dataset that always spans "now",
// so a `dateLines` entry placed a few days out is always inside `scale.range`.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

test('[S1-A14] a consumer stylesheet styling a Date line className actually paints — U3', async ({
  page,
}) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  // The library ships no `style`/`dashed` option (D-S1.13-5) — a consumer's own stylesheet is the
  // whole feature.
  await page.addStyleTag({
    content: '.fg-deadline-line { border-left-style: dashed; border-left-width: 2px; }',
  });

  await page.evaluate(() => {
    window.__gantt.dateLines = [
      {
        placeAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        label: 'Ship',
        className: 'fg-deadline-line',
      },
    ];
  });

  const line = page.locator('.fg-date-line.fg-deadline-line');
  await expect(line).toBeVisible();
  await expect(line).toHaveCSS('border-left-style', 'dashed');
  await expect(line).toHaveCSS('border-left-width', '2px');
});

test('a Date line label stays glued to its line while the timeline pane scrolls — U4', async ({ page }) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  await page.evaluate(() => {
    window.__gantt.todayLine = false;
    window.__gantt.dateLines = [{ placeAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), label: 'Ship' }];
  });

  const line = page.locator('.fg-date-line');
  const label = page.locator('.fg-date-line-label');
  await expect(line).toBeVisible();
  await expect(label).toBeVisible();
  await expect(label).toHaveText('Ship');

  const pane = page.locator('.fg-timeline-pane');
  await pane.evaluate((el) => {
    el.scrollLeft += 200;
  });

  await expect
    .poll(async () => {
      const lineBox = await line.boundingBox();
      const labelBox = await label.boundingBox();
      if (!lineBox || !labelBox) return null;
      return Math.abs(labelBox.x - lineBox.x);
    })
    .toBeLessThan(2);
});
