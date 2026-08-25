import { test, expect } from '@playwright/test';

// The literal repro for #8: "Load the harness, resize the browser window: the timeline does not
// re-fit." happy-dom cannot express this — it lays out nothing, so its ResizeObserver never
// fires (proven in src/view/pane-size-attachment.test.ts, which is why that suite injects a fake).
// Only a real engine can prove attachPaneSize actually reaches the browser's own resize signal.

// `frame.contentWidth` is not exposed directly, but the content sizer (render/dom/index.ts) is
// translated to `rowLabelWidth + contentWidth - 1` and is otherwise invisible — reading its
// transform is the least invasive way to read the fitted content width from outside the library.
async function contentSizerRight(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('#gantt')!;
    const sizer = Array.from(host.children).find(
      (el) => el instanceof HTMLElement && el.getAttribute('aria-hidden') === 'true',
    ) as HTMLElement;
    const match = /translate\(([\d.]+)px/.exec(sizer.style.transform);
    return match ? parseFloat(match[1]!) + 1 : NaN;
  });
}

test('resizing the window re-fits the axis (#8)', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await contentSizerRight(page);
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1600, height: 800 });
  // The resize observation is queued by the browser, not synchronous with setViewportSize.
  await expect.poll(async () => contentSizerRight(page), { timeout: 2000 }).not.toBe(before);

  const after = await contentSizerRight(page);
  // fitDataset: content ends exactly at the pane's own right edge, in both sizes.
  const hostWidth = await page.locator('#gantt').evaluate((el) => el.clientWidth);
  expect(Math.abs(after - hostWidth)).toBeLessThan(2);
});
