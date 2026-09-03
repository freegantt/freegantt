import { test, expect } from '@playwright/test';

// S5.4 visible acceptance (s5.4-renderers.md §4, D-S5-10/11/12): "the harness paints a custom
// milestone diamond and a red over-budget cost cell via renderers, with a toggle that switches
// both off live, no remount." harness/plugins.ts wires barRenderer/cellRenderer as plain
// GanttOptions (D-S5-11 level 3) over the sample dataset's "Launch" milestone and "Launch prep"'s
// over-budget cost.
test('barRenderer paints a milestone diamond and cellRenderer paints an over-budget cost cell, toggling off live with no bar remount (I8)', async ({
  page,
}) => {
  await page.goto('/plugins.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // `fg-bar-diamond`'s own shape is structural, from `entry.kind` (D-S4-24) — the demo
  // `barRenderer` recolors it via the `--fg-bar-fill` custom property its own `::before` reads
  // (I13: a renderer's bounded scope is attr/class/style/text/children, never the node's shape).
  const milestoneBar = page.locator('#gantt .fg-bar.demo-milestone');
  await expect(milestoneBar).toHaveClass(/fg-bar-diamond/);
  await expect(milestoneBar).toHaveCSS('--fg-bar-fill', '#7b2cbf');

  const overBudgetCell = page.locator('#gantt [data-field="cost"] .demo-over-budget');
  await expect(overBudgetCell).toHaveText('$1500');

  // Node identity across the toggle (I8): the same milestone bar element repaints, it is never
  // remounted.
  const milestoneNodeId = await milestoneBar.evaluate((el) => {
    (el as HTMLElement & { __probe?: true }).__probe = true;
    return el.getAttribute('data-item-id');
  });

  await page.locator('#renderers-toggle').uncheck();

  await expect(page.locator('#gantt .fg-bar.demo-milestone')).toHaveCount(0);
  await expect(page.locator('#gantt [data-field="cost"] .demo-over-budget')).toHaveCount(0);

  const sameBar = page.locator(`#gantt .fg-bar[data-item-id="${milestoneNodeId}"]`);
  await expect(sameBar).toHaveCount(1);
  const stillProbed = await sameBar.evaluate(
    (el) => (el as HTMLElement & { __probe?: true }).__probe === true,
  );
  expect(stillProbed).toBe(true);

  await page.locator('#renderers-toggle').check();
  await expect(page.locator('#gantt .fg-bar.demo-milestone')).toHaveCSS('--fg-bar-fill', '#7b2cbf');
  await expect(page.locator('#gantt [data-field="cost"] .demo-over-budget')).toHaveText('$1500');
});
