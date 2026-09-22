import { test, expect } from '@playwright/test';

// #140, D-S5-18 ("a reorder drag moves the header cell with a drop indicator between columns"): the
// drop indicator alone used to be the whole gesture — the grabbed cell stayed in its slot, so the
// drag had no grabbed thing to follow. It now rides a transform while the indicator marks the edge.
// Both halves are asserted here, in a real browser, because the transform is a hot-path paint no
// unit test sees composited.
test('a reorder drag carries the grabbed header cell and drops the column in its new slot', async ({
  page,
}) => {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const headers = page.locator('#gantt .fg-col-header');
  const orderOf = async (): Promise<(string | null)[]> =>
    headers.evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-field')));

  const before = await orderOf();
  // The drag crosses one neighbour, and lands before the column after it.
  expect(before.length).toBeGreaterThan(2);

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
  const indicator = page.locator('#gantt .fg-col-header[data-drop]');
  await expect(indicator).toHaveCount(1);
  // The indicator names the column this drop lands before — the one past the neighbour the pointer
  // crossed. A count of 1 alone does not say that. It also passes for an indicator parked back on
  // the neighbour itself, which is a drop that commits nothing, and that reads at the end of this
  // test as "the drop did not land" with no clue why (#161).
  await expect(indicator).toHaveAttribute('data-drop', 'before');
  await expect(indicator).toHaveAttribute('data-field', before[2]!);
  await expect(grabbed).toHaveAttribute('data-dragging', '');

  await page.mouse.up();

  // The drop committed the new order, and the drag left nothing painted behind.
  //
  // `expect.poll`, not one read: the commit is synchronous, but the header cells move on the next
  // animation frame. `ColumnChrome.commit` writes the new column list and then calls
  // `requestFrame()`, and `FrameScheduler` is the one owner of `requestAnimationFrame` (B10,
  // D-S2-15). A single read straight after `mouse.up()` is a race with that frame. It won the race
  // on an idle machine and lost it under full-suite load, which is #161.
  await expect.poll(orderOf).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(page.locator('#gantt .fg-col-header[data-drop]')).toHaveCount(0);
  await expect(page.locator('#gantt .fg-col-header[data-dragging]')).toHaveCount(0);
});
