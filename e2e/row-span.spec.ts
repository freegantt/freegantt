import { test, expect } from '@playwright/test';

// A row span paints in the browser's own layout: its box must sit inside its row's band and under
// the bar layer, and a click on it must reach the bar. jsdom cannot show either.

test('a row span sits inside its row, takes no pointer events and hides from assistive tech', async ({
  page,
}) => {
  await page.goto('/planned-vs-actual.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const span = page.locator('#gantt .fg-row-span').first();
  await expect(span).toBeAttached();
  await expect(span).toHaveAttribute('aria-hidden', 'true');
  await expect(span).toHaveCSS('pointer-events', 'none');
  await expect(span).not.toHaveAttribute('tabindex', /.*/);

  const geometry = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('#gantt .fg-row-span')!;
    const spanBox = node.getBoundingClientRect();
    const bands = Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-timeline-pane .fg-row-band'));
    const band = bands.find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return Math.abs(box.top - spanBox.top) < 1;
    });
    const bandBox = band?.getBoundingClientRect();
    return {
      spanHeight: spanBox.height,
      bandHeight: bandBox?.height,
      spanBottom: spanBox.bottom,
      bandBottom: bandBox?.bottom,
      underBars: node.closest('.fg-decorations-under') !== null,
    };
  });
  expect(geometry.bandHeight).toBeDefined();
  expect(geometry.spanHeight).toBeCloseTo(geometry.bandHeight!, 0);
  expect(geometry.spanBottom).toBeCloseTo(geometry.bandBottom!, 0);
  expect(geometry.underBars).toBe(true);
});

test('a row span widens with the zoom, because layout resolves it through the time scale', async ({
  page,
}) => {
  await page.goto('/planned-vs-actual.html');
  await expect(page.locator('#gantt .fg-row-span').first()).toBeAttached();

  const widthOfFirstSpan = (): Promise<number> =>
    page
      .locator('#gantt .fg-row-span')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
  const before = await widthOfFirstSpan();
  await page.evaluate(() => (window as unknown as { __gantt: { zoomIn(): void } }).__gantt.zoomIn());
  await expect.poll(widthOfFirstSpan).toBeGreaterThan(before);
});
