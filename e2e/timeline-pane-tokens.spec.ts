import { test, expect, type Page } from '@playwright/test';

// A Row detail lines content up with the timeline columns through two tokens the Gantt writes:
// `--fg-timeline-pane-left` and `--fg-timeline-pane-width`. The harness panel styles one line with
// them. Each test moves the Timeline pane and checks the line follows it. The unit tests fake
// layout. This spec proves the real measurement in each engine.

// Playwright hides scrollbars in headless Chromium. Show them, so a scrollbar takes width from the
// Timeline pane. Firefox and WebKit keep overlay scrollbars on this runner and take no width.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const ALIGNED = '.demo-details-timeline-line';
const BAR = '#gantt .fg-bar';
// One pixel covers the rounding of a fractional left edge. The tokens carry the exact value.
const TOLERANCE_PX = 1;

async function openPanel(page: Page): Promise<void> {
  await page.goto('/inline-details.html');
  await expect(page.locator(BAR).first()).toBeVisible();
  await page.locator(BAR).nth(1).click();
  await expect(page.locator(ALIGNED)).toBeVisible();
}

/** How far the aligned line sits from the Timeline pane's visible box. */
const misalignment = (page: Page): Promise<{ left: number; width: number }> =>
  page.evaluate(
    ([alignedSelector]) => {
      const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!;
      const line = document.querySelector<HTMLElement>(alignedSelector!)!.getBoundingClientRect();
      const visibleLeft = pane.getBoundingClientRect().left + pane.clientLeft;
      return { left: line.left - visibleLeft, width: line.width - pane.clientWidth };
    },
    [ALIGNED],
  );

async function expectAligned(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const { left, width } = await misalignment(page);
      return Math.max(Math.abs(left), Math.abs(width));
    })
    .toBeLessThanOrEqual(TOLERANCE_PX);
}

const scrollbarWidth = (page: Page): Promise<number> =>
  page
    .locator('#gantt .fg-timeline-pane')
    .evaluate((pane) => (pane as HTMLElement).offsetWidth - pane.clientWidth);

test('the line matches the Timeline pane when the Gantt opens', async ({ page }) => {
  await openPanel(page);
  await expectAligned(page);
});

test('the line follows a splitter drag', async ({ page }) => {
  await openPanel(page);
  const splitter = page.locator('#gantt .fg-splitter');
  const box = (await splitter.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 5 });
  await page.mouse.up();

  await expect.poll(async () => (await splitter.boundingBox())!.x).toBeGreaterThan(box.x + 100);
  await expectAligned(page);
});

test('the line follows the vertical scrollbar when it appears', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await openPanel(page);
  // A tall Gantt shows every row, so no scrollbar. A short one needs it.
  await page.locator('#gantt').evaluate((node) => {
    node.style.height = '1600px';
  });
  await expectAligned(page);
  const withoutBar = await scrollbarWidth(page);

  await page.locator('#gantt').evaluate((node) => {
    node.style.height = '300px';
  });

  // A classic scrollbar adds a gutter to the pane. An overlay scrollbar adds none. The line must match
  // the visible box either way.
  const classic = await expect
    .poll(() => scrollbarWidth(page))
    .toBeGreaterThan(withoutBar)
    .then(
      () => true,
      () => false,
    );
  test.info().annotations.push({ type: 'scrollbar', description: classic ? 'classic' : 'overlay' });
  if (browserName === 'chromium') expect(classic).toBe(true);
  await expectAligned(page);
});

test('the line follows a window resize', async ({ page }) => {
  await openPanel(page);

  await page.setViewportSize({ width: 900, height: 900 });

  await expectAligned(page);
});
