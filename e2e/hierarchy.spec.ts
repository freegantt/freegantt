import { test, expect } from '@playwright/test';

// S4.11 (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md §2): hierarchy.html exercises tree
// collapse, live row-source re-resolution, and tree keyboard.

async function gotoHierarchy(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/hierarchy.html');
  await expect(page.locator('#gantt .fg-row').first()).toBeVisible();
}

function timelinePane(page: import('@playwright/test').Page) {
  return page.locator('#gantt .fg-timeline-pane');
}

async function gotoHierarchyShort(page: import('@playwright/test').Page): Promise<void> {
  await gotoHierarchy(page);
  const pane = timelinePane(page);
  await page.locator('#gantt').evaluate((el) => {
    (el as HTMLElement).style.height = '220px';
  });
  // 220px is the demo short pane; wait until layout has applied it, then scroll to the bottom.
  await expect.poll(async () => pane.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(220);
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
}

// Retired (ADR 0026, #421): `entryWithSegments`, `barsForEntry`, `barLefts`, `showSegmentedSpan` and
// `dragBarBy` supported five multi-bar drag/resize/select tests that stood here. A Segment no longer
// exists — an Entry now always draws exactly one Bar, and this page registers no plugin variant that
// draws several for one Entry, so "the handle pair narrows to the picked bar" and "a row click moves
// every bar of the entry" have no scenario left to exercise on this page.

async function rowIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator('#gantt .fg-row')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset['rowId'] ?? ''));
}

test('twisty collapses a subtree and aria-expanded flips', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  await expect(childRow).toBeVisible();
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();

  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);
});

test('[S4-A3] switching row source changes the row set and keeps the scroll offset', async ({ page }) => {
  await gotoHierarchyShort(page);

  const pane = timelinePane(page);
  await page.click('#expand-all-btn');
  await pane.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  const before = await pane.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const treeIds = await rowIds(page);

  await page.selectOption('#rows-mode', 'grouped');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
  await expect.poll(async () => rowIds(page)).not.toEqual(treeIds);

  await page.selectOption('#rows-mode', 'tree');
  await expect.poll(async () => pane.evaluate((el) => el.scrollTop)).toBe(before);
});

// S5.11, D-S5-26: the container itself carries no tabindex any more — `view/roving-focus.ts` owns
// one tab stop per pane instead. Expand/collapse is the grid pane's own row arrows now, so focus
// goes on the parent's `.fg-rows` row, not `#gantt` (same pattern e2e/plugins.spec.ts uses).
test('ArrowRight expands and ArrowLeft collapses; focus stays on the parent row', async ({ page }) => {
  await gotoHierarchy(page);

  const parentRow = page
    .locator('#gantt .fg-row')
    .filter({ has: page.locator('.fg-row-twisty:not([hidden])') })
    .first();
  const twisty = parentRow.locator('.fg-row-twisty:not([hidden])');
  const childRow = page.locator('#gantt .fg-row').nth(1);
  const childId = await childRow.getAttribute('data-row-id');

  await twisty.click();
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);

  const parentId = await parentRow.getAttribute('data-row-id');
  expect(parentId).toBeTruthy();
  const gridRow = page.locator(`#gantt .fg-rows [data-row-id="${parentId}"]`);
  await gridRow.focus();
  await expect(gridRow).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toBeVisible();
  await expect(twisty).toHaveAttribute('aria-expanded', 'true');
  await expect(gridRow).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(`.fg-row[data-row-id="${childId}"]`)).toHaveCount(0);
  await expect(twisty).toHaveAttribute('aria-expanded', 'false');
  await expect(gridRow).toBeFocused();
});

test("Delete on a parent's own bar keeps the parent and its child (ADR 0012 supersedes #212, fix plan R3)", async ({
  page,
}) => {
  await gotoHierarchy(page);

  // `task-alpha-1` draws one Bar (its whole span) and owns `deep-leaf` as a child (fixtures/
  // hierarchy-dataset.ts). Deleting that Bar no longer removes the Entry (ADR 0012): the row
  // stays, and never had a reason to reparent `deep-leaf` in the first place.
  const before = await page.evaluate(() => String(window.__dataset.entries.get('deep-leaf')?.parent()?.id));
  expect(before).toBe('task-alpha-1');

  const bar = page.locator('#gantt .fg-bar[data-bar-id^="task-alpha-1:"]').first();
  await bar.click();
  await page.keyboard.press('Delete');

  await expect.poll(() => page.evaluate(() => window.__dataset.entries.has('task-alpha-1'))).toBe(true);
  await expect(page.locator('#gantt .fg-row[data-entry-id="deep-leaf"]')).toBeVisible();
  const after = await page.evaluate(() => String(window.__dataset.entries.get('deep-leaf')?.parent()?.id));
  expect(after).toBe('task-alpha-1');
});

// ADR 0020: a plugin states the parent of an Entry out of a `props` key, and everything downstream
// follows one answer. `harness/plugins/phase-hierarchy.ts` is the plugin; `#phase-btn` is the one
// write. Nothing here names a fixture row: the test reads the tree before the click and finds the
// row that moved by comparing it with the tree after.
test('a plugin tree makes a childless Entry a parent in fact, not by a stored word', async ({ page }) => {
  await gotoHierarchy(page);

  const readTree = async (): Promise<Record<string, string>> =>
    page.evaluate(() => {
      const tree: Record<string, string> = {};
      for (const entry of window.__dataset.entries.all) tree[entry.id] = String(entry.parent()?.id);
      return tree;
    });

  const before = await readTree();
  await page.locator('#phase-btn').click();
  await expect.poll(async () => JSON.stringify(await readTree())).not.toBe(JSON.stringify(before));
  const after = await readTree();

  const movedId = Object.keys(after).find((id) => after[id] !== before[id]);
  expect(movedId).toBeDefined();
  const newParentId = after[movedId!]!;

  const state = await page.evaluate(
    ({ newParentId, movedId }: { newParentId: string; movedId: string }) => {
      const newParent = window.__dataset.entries.get(newParentId);
      const moved = window.__dataset.entries.get(movedId);
      return {
        hasChildren: newParent?.hasChildren,
        // It derives: the Rollup gave it its child's span, which it never authored.
        spans: newParent?.start !== undefined && newParent?.end !== undefined,
        childDepth: moved?.depth,
        // No `parentId` was written anywhere — the move is a `phaseId` edit alone.
        storedParentId: String(moved?.toInput().parentId),
      };
    },
    { newParentId, movedId: movedId! },
  );

  expect(state.hasChildren).toBe(true);
  expect(state.spans).toBe(true);
  expect(state.childDepth).toBe((await newParentDepth(page, newParentId)) + 1);
  // The stored field still says what it always said: the plugin owns the tree, not the field.
  expect(state.storedParentId).toBe(before[movedId!]);

  // It paints as a summary because it *is* one (ADR 0018, step 3) — no variant was registered here.
  // The pane mounts the rows it can show, so bring this one into view before asking about its bar.
  await page.evaluate((id: string) => {
    window.__gantt.reveal(id);
  }, newParentId);
  await expect(page.locator(`#gantt .fg-bar-summary[data-bar-id^="${newParentId}:"]`)).toHaveCount(1);
});

// #421 C7: "Framing crew" (`req-1`) draws three children as segments, each a real child Entry with its own
// name, its own `hours`, and its own look — a real browser proof that a segmented row draws several
// bars, that a bar prints its own text, that per-bar capabilities differ, and that a bar with no
// name still draws (`fixtures/hierarchy-dataset.ts`, `harness/hierarchy.ts`'s `crewDayVariant`).
test('a segmented row draws its children as bars, each with its own text, look and capabilities', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => window.__gantt.reveal('req-1'));

  const monday = page.locator('[data-bar-id^="req-1-mon:"]');
  const wednesday = page.locator('[data-bar-id^="req-1-wed:"]');
  await expect(monday).toHaveText('Ali');
  await expect(page.locator('[data-bar-id^="req-1-tue:"]')).toHaveText('Ben');
  await expect(wednesday).toHaveText('Cy');
  await expect(monday).toHaveClass(/crew-day-filled/);
  await expect(wednesday).toHaveClass(/crew-day-open/);

  // The row total: `hours` rolls up over all three children onto the segmented row's own cell.
  await expect(page.locator('#gantt .fg-row[data-entry-id="req-1"] [data-field="hours"]')).toHaveText('20');

  // Cy's day is locked: dragging its right edge refuses. `end` is the field a resize actually
  // writes — `hours` is a stored prop no resize gesture here ever touches, so it would hold steady
  // whether or not the capability gate did its job (#421 F3).
  const wednesdayBox = await wednesday.boundingBox();
  expect(wednesdayBox).not.toBeNull();
  const wedEndBefore = await page.evaluate(() => Number(window.__dataset.entries.get('req-1-wed')!.end));
  await page.mouse.move(
    wednesdayBox!.x + wednesdayBox!.width / 2,
    wednesdayBox!.y + wednesdayBox!.height / 2,
  );
  await page.mouse.move(
    wednesdayBox!.x + wednesdayBox!.width - 2,
    wednesdayBox!.y + wednesdayBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    wednesdayBox!.x + wednesdayBox!.width + 40,
    wednesdayBox!.y + wednesdayBox!.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  const wedEndAfter = await page.evaluate(() => Number(window.__dataset.entries.get('req-1-wed')!.end));
  expect(wedEndAfter).toBe(wedEndBefore);

  // A bar with no name still draws — "Site hold" carries no `name` at all.
  await page.evaluate(() => window.__gantt.reveal('site-hold'));
  await expect(page.locator('[data-bar-id^="site-hold:"]')).toHaveText('');

  // One Field write opens the segmented row into three rows of its own, undoable like any other edit.
  await page.click('#crew-days-btn');
  await expect(page.locator('#gantt .fg-row[data-entry-id="req-1-mon"]')).toBeVisible();
  await page.click('#undo-btn');
  await expect(page.locator('#gantt .fg-row[data-entry-id="req-1-mon"]')).toHaveCount(0);
});

async function newParentDepth(page: import('@playwright/test').Page, id: string): Promise<number> {
  return page.evaluate((newParentId: string) => window.__dataset.entries.get(newParentId)?.depth ?? 0, id);
}
