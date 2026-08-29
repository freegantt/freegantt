import { test, expect } from '@playwright/test';

// Regression test: `.fg-today-line` sits inside `.fg-timeline-pane`, which is both the line's
// positioned ancestor and its own `overflow: auto` scroll container. A CSS `bottom: 0` on the line
// resolved against the pane's own visible clientHeight (the height it had when the page first laid
// out), not its scrollable content height — so the line only ever covered the dataset's first
// screenful of rows and stopped there, however many rows scrolled below it. Fixed in
// `render/dom/index.ts`'s `syncDecorations` by giving the line an explicit `height` (`fixtures/
// demo-dataset.ts` puts "today" inside every harness dataset's range, so the line always renders here).

test("[today line] spans the full scrollable row content, not just the pane's initial viewport", async ({
  page,
}) => {
  await page.goto('/zoom.html');
  await expect(page.locator('.fg-bar').first()).toBeVisible();

  const line = page.locator('.fg-today-line');
  await expect(line).toBeVisible();

  const pane = page.locator('.fg-timeline-pane');
  const { scrollHeight, clientHeight } = await pane.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  // The dataset must actually be taller than one screenful, or this test proves nothing.
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  const lineBox = await line.boundingBox();
  if (!lineBox) throw new Error('missing bounding box');

  // The regression this guards: the old CSS gave the line exactly `clientHeight`, however tall the
  // dataset actually was.
  expect(lineBox.height).toBeGreaterThan(clientHeight);
  expect(lineBox.height).toBeGreaterThanOrEqual(scrollHeight - 2);
});
