import { test, expect, type Page } from '@playwright/test';

// A panel opens under one task, as wide as the whole Gantt, and pushes the rows below it down.
// The unit tests prove `rowBox`. This spec proves the layer follows the rows in a real browser:
// it moves with vertical scroll, stays still on a horizontal pan, hides under the header, and
// keeps its own keys.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
  }
}

const PANEL = '.demo-details-panel';
const FOURTH_BAR = '#gantt .fg-bar >> nth=3';

async function openPanelUnderTask(page: Page, index: number): Promise<void> {
  await page.goto('/inline-details.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  await page.locator('#gantt .fg-bar').nth(index).click();
  await expect(page.locator(PANEL)).toBeVisible();
}

const top = (page: Page, selector: string): Promise<number> =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => node.getBoundingClientRect().top);

const scrollTimeline = (page: Page, to: { top?: number; left?: number }): Promise<void> =>
  page.evaluate((target) => {
    const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!;
    if (target.top !== undefined) pane.scrollTop = target.top;
    if (target.left !== undefined) pane.scrollLeft = target.left;
  }, to);

test('the panel opens under its row, spans both panes and pushes the rows below down', async ({ page }) => {
  await page.goto('/inline-details.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  const nextBarBefore = await top(page, FOURTH_BAR);
  await page.locator('#gantt .fg-bar').nth(2).click();
  await expect(page.locator(PANEL)).toBeVisible();

  const gantt = await page.locator('#gantt').evaluate((node) => node.getBoundingClientRect().width);
  const panel = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());
  expect(Math.round(panel.width)).toBe(Math.round(gantt));
  const nextBarAfter = await top(page, FOURTH_BAR);
  expect(nextBarAfter - nextBarBefore).toBe(132);

  await page.locator(`${PANEL} button`).click();
  await expect(page.locator(PANEL)).toBeHidden();
  await expect.poll(() => top(page, FOURTH_BAR)).toBe(nextBarBefore);
});

test('the layer follows vertical scroll and stays still on a horizontal pan', async ({ page }) => {
  await openPanelUnderTask(page, 6);
  const before = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());

  await scrollTimeline(page, { top: 60 });
  await expect.poll(async () => before.top - (await top(page, PANEL))).toBe(60);

  await scrollTimeline(page, { left: 200 });
  const panned = await page.locator(PANEL).evaluate((node) => node.getBoundingClientRect());
  expect(panned.left).toBe(before.left);
  expect(panned.width).toBe(before.width);
});

test('content scrolled up under the header is hidden', async ({ page }) => {
  await openPanelUnderTask(page, 1);
  // The pane clamps scrollTop to its content height, so wait until the panel's height is in and 150 holds.
  await expect
    .poll(async () => {
      await scrollTimeline(page, { top: 150 });
      return page.locator('#gantt .fg-timeline-pane').evaluate((pane) => pane.scrollTop);
    })
    .toBe(150);
  const headerBottom = await page
    .locator('#gantt .fg-grid-spacer')
    .evaluate((node) => node.getBoundingClientRect().bottom);
  await expect.poll(() => top(page, PANEL)).toBeLessThan(headerBottom);
  const clip = await page.locator('#gantt .fg-full-width-row-layer-clip').evaluate((node) => ({
    top: node.getBoundingClientRect().top,
    overflow: getComputedStyle(node).overflow,
  }));
  expect(clip.top).toBeCloseTo(headerBottom, 0);
  expect(clip.overflow).toBe('hidden');
});

test('a key pressed in mounted content never reaches the Gantt', async ({ page }) => {
  await openPanelUnderTask(page, 2);
  await page.evaluate(() => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Status');
    select.innerHTML = '<option>Open</option><option>Done</option>';
    document.querySelector('.demo-details-panel')!.append(select);
  });
  const selected = (): Promise<string[]> => page.evaluate(() => window.__gantt.selectedEntryIds.map(String));
  const scrollY = (): Promise<number> =>
    page.evaluate(() => document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!.scrollTop);
  const selectedBefore = await selected();
  const scrollBefore = await scrollY();

  for (const target of [`${PANEL} input`, `${PANEL} button`, `${PANEL} select`]) {
    await page.locator(target).focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'Home', 'End', 'Escape']) {
      await page.keyboard.press(key);
    }
    expect(await selected(), target).toEqual(selectedBefore);
    expect(await scrollY(), target).toBe(scrollBefore);
  }

  await page.locator(`${PANEL} input`).focus();
  await page.keyboard.type('hello');
  await expect(page.locator(`${PANEL} input`)).toHaveValue('hello');
});

test('the rows moving tells the plugin, and a scroll does not', async ({ page }) => {
  await openPanelUnderTask(page, 2);
  const count = async (): Promise<number> =>
    Number((await page.locator('#layout-readout').textContent())?.match(/\d+/)?.[0]);
  await expect.poll(count).toBeGreaterThan(0);
  const afterOpen = await count();

  await scrollTimeline(page, { top: 60 });
  await scrollTimeline(page, { left: 120 });
  await page.waitForTimeout(300);
  expect(await count()).toBe(afterOpen);

  await page.locator(`${PANEL} button`).click();
  await expect.poll(count).toBeGreaterThan(afterOpen);
});

const timelineScroll = (page: Page): Promise<{ top: number; left: number }> =>
  page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane')!;
    return { top: pane.scrollTop, left: pane.scrollLeft };
  });

const centreOf = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('a wheel over the panel scrolls the rows, and a sideways or shift wheel pans the timeline', async ({
  page,
}) => {
  await openPanelUnderTask(page, 2);
  const over = await centreOf(page, `${PANEL} h3`);
  await page.mouse.move(over.x, over.y);

  await page.mouse.wheel(0, 90);
  await expect.poll(async () => (await timelineScroll(page)).top).toBeGreaterThan(0);

  await page.mouse.wheel(120, 0);
  await expect.poll(async () => (await timelineScroll(page)).left).toBeGreaterThan(0);

  const before = (await timelineScroll(page)).left;
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await timelineScroll(page)).left).toBeGreaterThan(before);
});

test('a wheel over a scrollable textarea in the panel scrolls the textarea, until it reaches the edge', async ({
  page,
}) => {
  await openPanelUnderTask(page, 2);
  const over = await centreOf(page, `${PANEL} textarea`);
  await page.mouse.move(over.x, over.y);
  const textareaTop = (): Promise<number> =>
    page.locator(`${PANEL} textarea`).evaluate((node) => node.scrollTop);

  await page.mouse.wheel(0, 20);
  await expect.poll(textareaTop).toBeGreaterThan(0);
  expect((await timelineScroll(page)).top).toBe(0);

  // The textarea takes the wheel down to its edge. Firefox scrolls it a few lines per wheel and WebKit
  // animates it, so wheel again until it sits at the bottom. The next wheel, at the edge, scrolls the rows.
  const atBottom = (): Promise<boolean> =>
    page
      .locator(`${PANEL} textarea`)
      .evaluate((node) => node.scrollTop + node.clientHeight >= node.scrollHeight - 1);
  await expect
    .poll(async () => {
      if (await atBottom()) return true;
      await page.mouse.wheel(0, 200);
      return false;
    })
    .toBe(true);
  expect((await timelineScroll(page)).top).toBe(0);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await timelineScroll(page)).top).toBeGreaterThan(0);
});

test('a mouse press, a drag and a double-click in the panel start no Gantt gesture', async ({ page }) => {
  await openPanelUnderTask(page, 2);
  const state = (): Promise<string> =>
    page.evaluate(() =>
      JSON.stringify({
        selected: window.__gantt.selectedEntryIds,
        bars: Array.from(document.querySelectorAll('#gantt .fg-bar')).map((bar) => {
          const box = bar.getBoundingClientRect();
          return [Math.round(box.left), Math.round(box.width)];
        }),
      }),
    );
  const before = await state();

  const from = await centreOf(page, `${PANEL} h3`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 200, from.y - 150, { steps: 8 });
  await page.mouse.up();
  await page.mouse.dblclick(from.x, from.y);
  expect(await state()).toBe(before);

  const input = page.locator(`${PANEL} input`);
  await input.fill('alpha beta');
  const box = (await input.boundingBox())!;
  await page.mouse.dblclick(box.x + 12, box.y + box.height / 2);
  const selection = await input.evaluate((node: HTMLInputElement) =>
    node.value.slice(node.selectionStart ?? 0, node.selectionEnd ?? 0),
  );
  expect(selection).toBe('alpha');
});
