import { test, expect } from '@playwright/test';

// S4.11 (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md §2): hierarchy.html exercises tree
// collapse, live row-source re-resolution, pack-mode heights, segmented drag + undo, and tree keyboard.

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

async function entryWithSegments(page: import('@playwright/test').Page): Promise<string> {
  const id = await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    return entry === undefined ? undefined : String(entry.id);
  });
  if (id === undefined) throw new Error('the dataset has no multi-segment entry');
  return id;
}

function barsForEntry(page: import('@playwright/test').Page, entryId: string) {
  return page.locator(`#gantt .fg-bar[data-item-id^="${entryId}:"]`);
}

/** The left edge of every bar the locator matches, in DOM order — what a rigid drag shifts by one
 *  and the same delta (#200). */
async function barLefts(bars: import('@playwright/test').Locator): Promise<number[]> {
  const count = await bars.count();
  const lefts: number[] = [];
  for (let index = 0; index < count; index++) {
    const box = await bars.nth(index).boundingBox();
    expect(box).not.toBeNull();
    lefts.push(box!.x);
  }
  return lefts;
}

async function showSegmentedSpan(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find(
      (candidate) => candidate.segments !== undefined && candidate.segments.length > 1,
    );
    if (entry === undefined) throw new Error('the dataset has no multi-segment entry');
    window.__gantt.zoomToSpan({ start: entry.start!, end: entry.end! });
  });
  const entryId = await entryWithSegments(page);
  await expect(barsForEntry(page, entryId).nth(1)).toBeVisible();
}

async function dragBarBy(
  page: import('@playwright/test').Page,
  bar: import('@playwright/test').Locator,
  dx: number,
): Promise<void> {
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + Math.min(box!.width / 2, 20);
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

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

test('pack mode grows a packed row and shifts the rows below', async ({ page }) => {
  await gotoHierarchy(page);

  const entryId = await entryWithSegments(page);
  // Reveal the packed row by name instead of scrolling blindly to the bottom. This test used
  // `gotoHierarchyShort`, which sets a 220px pane and scrolls to `scrollHeight` — and then looked
  // the row up by an id read from the *dataset*, so whether virtualization had kept that row in
  // the DOM was left to chance. That produced two intermittent failures: the row absent, so
  // `boundingBox()` waited out the 30s timeout; or the row present but last, so no row sat below
  // it and the search found nothing. `reveal` states the requirement the test actually has.
  await page.evaluate((id) => {
    window.__gantt.reveal(window.__dataset.entries.get(id)!.id);
  }, entryId);
  const packedRow = page.locator(`.fg-row[data-row-id="${entryId}"]`);
  await expect(packedRow).toBeVisible();
  const beforePacked = await packedRow.boundingBox();
  expect(beforePacked).not.toBeNull();

  // Name the row below, do not count it. Switching to pack mode re-renders, and virtualization
  // decides which rows exist — so an `nth(i)` locator captured now re-resolves to a *different*
  // row after the switch, and the assertion below then measures the wrong box. `data-row-id`
  // survives the re-render. Same fix, same reason, as the `data-item-id` pinning in
  // `plugins.spec.ts`, and as this test's own `packedRow` locator above.
  const rows = page.locator('#gantt .fg-row');
  const count = await rows.count();
  let belowRowId: string | null = null;
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const box = await row.boundingBox();
    if (box !== null && box.y > beforePacked!.y + beforePacked!.height - 1) {
      belowRowId = await row.getAttribute('data-row-id');
      break;
    }
  }
  expect(belowRowId).not.toBeNull();
  const below = page.locator(`.fg-row[data-row-id="${belowRowId}"]`);
  const beforeBelow = await below.boundingBox();
  expect(beforeBelow).not.toBeNull();

  await page.selectOption('#height-mode', 'pack');

  await expect
    .poll(async () => {
      const afterPacked = await packedRow.boundingBox();
      return afterPacked !== null && afterPacked.height > beforePacked!.height;
    })
    .toBe(true);

  await expect
    .poll(async () => {
      const afterBelow = await below.boundingBox();
      return afterBelow !== null && afterBelow.y > beforeBelow!.y;
    })
    .toBe(true);
});

// #215, closed by #217's D2: pack mode gives every overlapping Segment its own lane, so nothing
// covers anything and no Segment needs a hit-test workaround to reach it.
test('a covered Segment can be selected once its row packs into lanes (#215)', async ({ page }) => {
  await gotoHierarchy(page);
  await page.selectOption('#height-mode', 'pack');
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  await expect(bars).toHaveCount(3);

  // Three Segments, each overlapping the other two, force three distinct lanes — three distinct
  // top offsets, not one shared row of stacked bars.
  const boxes = await Promise.all([0, 1, 2].map((index) => bars.nth(index).boundingBox()));
  for (const box of boxes) expect(box).not.toBeNull();
  const tops = new Set(boxes.map((box) => box!.y));
  expect(tops.size).toBe(3);

  // Each Segment now sits on its own lane, so a plain click reaches it directly — no
  // `elementFromPoint` scan, no mouse-event workaround, needed to land on a covered bar.
  for (let index = 0; index < 3; index++) {
    const bar = bars.nth(index);
    const box = (await bar.boundingBox())!;
    await bar.click({ position: { x: Math.min(box.width / 2, 12), y: box.height / 2 } });
    await expect(bar).toHaveAttribute('data-state', /\bselected\b/);
  }
});

test('a segment drag moves one bar and Undo restores it', async ({ page }) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const bar = bars.nth(1);
  const sibling = bars.first();
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  const siblingBefore = await sibling.boundingBox();
  expect(before).not.toBeNull();
  expect(siblingBefore).not.toBeNull();

  // #211: a click names the bar the pointer landed on — that bar is the pick, and only a pick's own
  // Segment moves on the drag that follows. The three Segments overlap at this zoom, so the click
  // goes through the mouse directly — a locator `click()` refuses to act while a sibling bar of the
  // same Entry sits over the target's own centre.
  await page.mouse.click(before!.x + Math.min(before!.width / 2, 20), before!.y + before!.height / 2);
  await dragBarBy(page, bar, 120);

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after !== null && Math.abs(after.x - before!.x) > 8;
    })
    .toBe(true);

  const siblingAfter = await sibling.boundingBox();
  expect(siblingAfter).not.toBeNull();
  expect(Math.abs(siblingAfter!.x - siblingBefore!.x)).toBeLessThan(2);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await bar.boundingBox();
      return restored !== null && Math.abs(restored.x - before!.x);
    })
    .toBeLessThan(2);
});

test('a press-and-drag with nothing selected picks up the grabbed bar alone (#211, D-S4-30)', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const bar = bars.nth(1);
  const sibling = bars.first();
  await expect(bar).toBeVisible();
  const before = await bar.boundingBox();
  const siblingBefore = await sibling.boundingBox();
  expect(before).not.toBeNull();
  expect(siblingBefore).not.toBeNull();

  // Nothing is selected here — no prior click. A press-then-drag on the middle bar still picks up
  // only that Segment: the drag arms into the Selection with that bar as its pick before it previews
  // anything, so it never falls back to moving every Segment of an empty or stale Selection.
  await dragBarBy(page, bar, 120);

  await expect
    .poll(async () => {
      const after = await bar.boundingBox();
      return after !== null && Math.abs(after.x - before!.x) > 8;
    })
    .toBe(true);

  const siblingAfter = await sibling.boundingBox();
  expect(siblingAfter).not.toBeNull();
  expect(Math.abs(siblingAfter!.x - siblingBefore!.x)).toBeLessThan(2);

  expect(await page.evaluate(() => window.__gantt.selectedEntryIds)).toEqual([entryId]);
});

test('a row click paints and moves every bar of the entry, and one Undo restores them all', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  await expect(bars.nth(1)).toBeVisible();
  expect(await bars.count()).toBe(3);
  const before = await barLefts(bars);

  // #211: a grid-row click selects the whole Entry with no pick — every Segment paints selected, so
  // the drag that follows steps every Segment by the same delta (D-S3-19).
  const row = page.locator(`#gantt .fg-row[data-entry-id="${entryId}"]`);
  await row.locator('.fg-row-cell').first().click();
  await dragBarBy(page, bars.nth(1), 120);

  await expect
    .poll(async () => {
      const after = await barLefts(bars);
      return after.every((x, index) => Math.abs(x - before[index]!) > 8);
    })
    .toBe(true);

  const moved = await barLefts(bars);
  const deltas = moved.map((x, index) => x - before[index]!);
  expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(2);

  await page.click('#undo-btn');

  await expect
    .poll(async () => {
      const restored = await barLefts(bars);
      return Math.max(...restored.map((x, index) => Math.abs(x - before[index]!)));
    })
    .toBeLessThan(2);
});

test('the handle pair brackets the whole entry and the start handle grows its first bar', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const first = bars.first();
  const last = bars.nth(2);
  // #211: hovering the bar shows the handle pair with no pick recorded for the Entry, so the pair
  // brackets the envelope — a click here would instead pick this one bar and narrow the pair to it
  // alone (see the picked-bar unit coverage in render/dom/index.test.ts).
  const hoverBox = (await last.boundingBox())!;
  await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2);

  // The entry is wider than the pane, so its earliest bar starts left of the pane's own edge. Pan
  // right-to-left until that bar — and the start handle on it — sits inside the pane.
  await timelinePane(page).evaluate((el) => {
    el.scrollLeft -= 400;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await bars.first().boundingBox())!.x).toBeGreaterThan(600);

  const startHandle = page.locator('#gantt .fg-bar-handle[data-edge="start"]');
  const endHandle = page.locator('#gantt .fg-bar-handle[data-edge="end"]');
  await expect(startHandle).toBeVisible();
  await expect(endHandle).toBeVisible();

  // #211: with no pick, a resize acts on the Entry's envelope, so the pair straddles all three bars.
  const firstBefore = (await first.boundingBox())!;
  const lastBefore = (await last.boundingBox())!;
  const startBox = (await startHandle.boundingBox())!;
  const endBox = (await endHandle.boundingBox())!;
  expect(Math.abs(startBox.x + startBox.width / 2 - firstBefore.x)).toBeLessThan(6);
  expect(Math.abs(endBox.x + endBox.width / 2 - (lastBefore.x + lastBefore.width))).toBeLessThan(6);

  // Drag the start handle back: it moves the earliest Segment's start, nothing else.
  const grabX = startBox.x + startBox.width / 2;
  const grabY = startBox.y + startBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX - 60, grabY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const firstAfter = await first.boundingBox();
      return firstAfter !== null && firstAfter.width - firstBefore.width;
    })
    .toBeGreaterThan(8);

  // Only the earliest Segment grew: the latest one sits exactly where it did.
  const lastAfter = (await last.boundingBox())!;
  expect(Math.abs(lastAfter.x - lastBefore.x)).toBeLessThan(2);
  expect(Math.abs(lastAfter.width - lastBefore.width)).toBeLessThan(2);
});

test('clicking a bar narrows the handle pair to it, and a resize writes only that Segment (#211)', async ({
  page,
}) => {
  await gotoHierarchy(page);
  await page.evaluate(() => {
    window.__gantt.preset = { ...window.__gantt.preset, snap: 'none' };
  });
  await showSegmentedSpan(page);

  const entryId = await entryWithSegments(page);
  const bars = barsForEntry(page, entryId);
  const first = bars.first();
  const last = bars.nth(2);

  // #211: a click names the bar the pointer landed on — that bar is the pick, and the handle pair
  // narrows to it alone, never the envelope. The three Segments overlap at this zoom, so the click
  // goes through the mouse directly — a locator `click()` refuses to act while a sibling bar of the
  // same Entry sits over the target's own centre.
  const firstBox = (await first.boundingBox())!;
  await page.mouse.click(firstBox.x + Math.min(firstBox.width / 2, 20), firstBox.y + firstBox.height / 2);

  const startHandle = page.locator('#gantt .fg-bar-handle[data-edge="start"]');
  const endHandle = page.locator('#gantt .fg-bar-handle[data-edge="end"]');
  await expect(startHandle).toBeVisible();
  await expect(endHandle).toBeVisible();

  const lastBefore = (await last.boundingBox())!;
  await expect
    .poll(async () => {
      const box = await endHandle.boundingBox();
      return box === null ? null : Math.abs(box.x + box.width / 2 - (lastBefore.x + lastBefore.width));
    })
    .toBeGreaterThan(6); // the end handle sits on the picked (first) bar, not the envelope's last bar

  const startBox = (await startHandle.boundingBox())!;
  const endBox = (await endHandle.boundingBox())!;
  expect(Math.abs(startBox.x + startBox.width / 2 - firstBox.x)).toBeLessThan(6);
  expect(Math.abs(endBox.x + endBox.width / 2 - (firstBox.x + firstBox.width))).toBeLessThan(6);

  // Drag the end handle: it grows the picked (first) Segment, and the latest Segment stays put.
  const grabX = endBox.x + endBox.width / 2;
  const grabY = endBox.y + endBox.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 60, grabY, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const firstAfter = await first.boundingBox();
      return firstAfter !== null && firstAfter.width - firstBox.width;
    })
    .toBeGreaterThan(8);

  const lastAfter = (await last.boundingBox())!;
  expect(Math.abs(lastAfter.x - lastBefore.x)).toBeLessThan(2);
  expect(Math.abs(lastAfter.width - lastBefore.width)).toBeLessThan(2);
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

test("Delete on a parent's last Segment keeps the parent and its child (ADR 0012 supersedes #212, fix plan R3)", async ({
  page,
}) => {
  await gotoHierarchy(page);

  // `task-alpha-1` draws one Segment (its whole span) and owns `deep-leaf` as a child (fixtures/
  // hierarchy-dataset.ts). Deleting that Segment no longer removes the Entry (ADR 0012): the row
  // stays, and never had a reason to reparent `deep-leaf` in the first place.
  const before = await page.evaluate(() => String(window.__dataset.entries.get('deep-leaf')?.parent()?.id));
  expect(before).toBe('task-alpha-1');

  const bar = page.locator('#gantt .fg-bar[data-item-id^="task-alpha-1:"]').first();
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
  await expect(page.locator(`#gantt .fg-bar-summary[data-item-id^="${newParentId}:"]`)).toHaveCount(1);
});

async function newParentDepth(page: import('@playwright/test').Page, id: string): Promise<number> {
  return page.evaluate((newParentId: string) => window.__dataset.entries.get(newParentId)?.depth ?? 0, id);
}
