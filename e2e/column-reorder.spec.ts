import { test, expect } from '@playwright/test';

// #140, D-S5-18 ("a reorder drag moves the header cell with a drop indicator between columns"): the
// drop indicator alone used to be the whole gesture — the grabbed cell stayed in its slot, so the
// drag had no grabbed thing to follow. It now rides a transform while the indicator marks the edge.
// Both halves are asserted here, in a real browser, because the transform is a hot-path paint no
// unit test sees composited.
test('a reorder drag carries the grabbed header cell and drops the column in its new slot', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const headers = page.locator('#gantt .fg-col-header');
  const orderOf = async (): Promise<(string | null)[]> =>
    headers.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-field')));

  const before = await orderOf();
  expect(before.length).toBeGreaterThan(1); // the drag needs a neighbour to cross

  const grabbed = headers.first();
  const neighbour = headers.nth(1);
  const grabbedBox = (await grabbed.boundingBox())!;
  const neighbourBox = (await neighbour.boundingBox())!;
  const y = grabbedBox.y + grabbedBox.height / 2;
  // Past the neighbour's own midpoint: that is where the drop flips to "after this column"
  // (`dropTargetAt` compares against each target's midpoint), so the drop lands one slot to the right.
  const dropX = neighbourBox.x + neighbourBox.width * 0.75;

  await page.mouse.move(grabbedBox.x + grabbedBox.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(dropX, y, { steps: 10 });

  // Mid-drag: the grabbed cell has left its slot (computed geometry, not the style string), and one
  // header cell wears the drop indicator.
  await expect.poll(async () => (await grabbed.boundingBox())!.x).toBeGreaterThan(grabbedBox.x + 1); // 1px of slack: a sub-pixel transform still counts as "not moved"
  await expect(page.locator('#gantt .fg-col-header[data-drop]')).toHaveCount(1);
  await expect(grabbed).toHaveAttribute('data-dragging', '');

  await page.mouse.up();

  // The drop committed the new order, and the drag left nothing painted behind.
  const after = await orderOf();
  expect(after).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(page.locator('#gantt .fg-col-header[data-drop]')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-col-header[data-dragging]')).toHaveCount(0);
});
