import { test, expect, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
    /** How many `Dataset` `change` events fired since a test last reset it — one transaction fires
     *  one `change` event no matter how many rows it touches (a rollup recompute on the old and the
     *  new parent's own cost included), so this, not a line count, is what "one ChangeSet" means. */
    __rowDragChangeCount: number;
  }
}

// `main.ts`'s own Mobilization date line vetoes a drop whose proposed start lands before it (a week
// out from today) — a vertical-only drag keeps the dragged Entry's own start, so a bar dated before
// that line refuses every drop, not just an early one. `panToDate` centres the pane on a date safely
// past it (14 days, double the boundary, so no clock skew between the test runner and the page turns
// this into a coin flip) — a public API call, not a scroll simulation.
const PAST_MOBILIZATION_MS = Date.now() + 14 * 24 * 60 * 60 * 1000;

// A vertical drag moves a bar to another row — the pointer end of the seam the unit tests already
// pin (`layout/row-drop-zone.test.ts`, `layout/row-drop-target.test.ts`, `view/row-drop.test.ts`,
// `src/api/gantt.test.ts`'s own vertical-drag describe block). Runs on `generic.html`: it logs every
// committed ChangeSet, carries an undo button, and has a "Lock tree" checkbox, plus a group whose
// last child sits right above a shallower, unrelated row.
//
// Targets are found in the DOM and read back off `Entry.children()`/`Entry.parent()` at test time —
// never a fixture id — so a fixture edit does not break these.

async function gotoGeneric(page: Page): Promise<void> {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  // This page opens with nothing collapsed, but a summary bar only paints once its dateless
  // parent's own row exists — a readier proof that the whole tree painted than the first bar alone.
  await expect(page.locator('#gantt .fg-bar-summary').first()).toBeVisible();

  // Past the Mobilization line, so a dragged bar's own start clears the page's veto (see the
  // constant above). Panning moves the timeline pane alone — the row list's own vertical order and
  // position are untouched.
  await page.evaluate((ms) => window.__gantt.panToDate(new Date(ms), 'center'), PAST_MOBILIZATION_MS);
  // `view/frame-scheduler.ts` repaints on the next animation frame, not synchronously — two round
  // trips covers a pan that itself runs from inside a rAF callback.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** Counts `Dataset` `change` events from here on — see the `Window.__rowDragChangeCount` doc. */
async function countChangesFromHere(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__rowDragChangeCount = 0;
    window.__gantt.dataset.on('change', () => {
      window.__rowDragChangeCount += 1;
    });
  });
}

interface RowInfo {
  readonly entryId: string;
  readonly rowId: string;
  readonly depth: number;
  /** How many children this row's own Entry has — 0 marks a true leaf, distinct from a
   *  `childrenAsSegments` row, which draws children as bars on itself and so has none of its own
   *  rows below it, but is not a leaf in the tree `Entry.children()` reports. */
  readonly childCount: number;
  /** Does this row draw its own bar? False for the one row this page draws with
   *  `childrenAsSegments` (its children paint as bars on it instead) — that row takes an `into`
   *  drop under a different rule than an ordinary tree row (`verticalDropOffered` stays off for
   *  it), so a target row for cases 1-5 only ever needs a band; a row we grab and drag also needs
   *  this true. */
  readonly hasOwnBar: boolean;
}

/** Every painted row, top to bottom, with what `layout/row-drop-target.ts` reads about it. */
async function rowPlan(page: Page): Promise<RowInfo[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-row')).map((row) => {
      const entryId = row.dataset['entryId']!;
      return {
        entryId,
        rowId: row.dataset['rowId']!,
        depth: Number(row.getAttribute('aria-level')) - 1,
        childCount: window.__gantt.dataset.entries.get(entryId)?.children().length ?? 0,
        hasOwnBar: document.querySelector(`#gantt .fg-bar[data-bar-id^="${entryId}:"]`) !== null,
      };
    }),
  );
}

function rowBand(page: Page, rowId: string): Locator {
  return page.locator(`#gantt .fg-row-band[data-row-id="${rowId}"]`);
}

/** The bar an entry draws — a dated entry's own bar, or a rollup parent's summary bar. Both carry a
 *  `data-bar-id` of `${entryId}:${index}`. */
function barOf(page: Page, entryId: string): Locator {
  return page.locator(`#gantt .fg-bar[data-bar-id^="${entryId}:"]`).first();
}

async function timelinePaneBox(page: Page) {
  return (await page.locator('#gantt .fg-timeline-pane').boundingBox())!;
}

async function headerBox(page: Page) {
  return (await page.locator('#gantt .fg-header').boundingBox())!;
}

async function currentParentId(page: Page, entryId: string): Promise<string | undefined> {
  return page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.parent()?.id, entryId);
}

/** The first child of `parentId` that paints its own row — the child a parent-bar drop or a
 *  parent-onto-child drag can actually land a bounding box on. Reads children back off the Entry,
 *  so it never assumes the fixture puts an ordinary child before a `childrenAsSegments` one. */
async function firstOwnBarChild(
  page: Page,
  parentId: string,
  ownBarRows: readonly RowInfo[],
): Promise<RowInfo> {
  const childIds = await page.evaluate(
    (id) => (window.__gantt.dataset.entries.get(id)?.children() ?? []).map((child) => String(child.id)),
    parentId,
  );
  const found = ownBarRows.find((row) => childIds.includes(row.entryId));
  if (!found) throw new Error(`no child of ${parentId} paints its own row`);
  return found;
}

interface GrabPoint {
  readonly row: RowInfo;
  readonly grabX: number;
  readonly grabY: number;
}

/** The first candidate whose own bar the pointer can actually reach: on screen, clear of the sticky
 *  header, and overlapping the pane horizontally. This page shows a wide date range at once, so most
 *  rows draw a bar the current scroll position has carried out of the pane — `getBoundingClientRect`
 *  still answers for an unmounted-from-view-but-still-rendered bar (this page runs no `range:
 *  'fitDataset'`, unlike `hierarchy.html`), and grabbing there would miss the bar and hit whatever the
 *  pane shows underneath instead. */
async function firstGrabbableBar(
  page: Page,
  candidates: readonly RowInfo[],
  pane: { x: number; y: number; width: number; height: number },
  header: { y: number; height: number },
): Promise<GrabPoint> {
  for (const row of candidates) {
    const box = await barOf(page, row.entryId).boundingBox();
    if (!box) continue;
    const left = Math.max(box.x, pane.x);
    const right = Math.min(box.x + box.width, pane.x + pane.width);
    // Wide enough to place the grab point 8px in from the visible edge, clear of a resize handle.
    if (right - left < 12) continue;
    const grabY = box.y + box.height / 2;
    if (grabY <= header.y + header.height || grabY >= pane.y + pane.height) continue;
    return { row, grabX: left + 8, grabY };
  }
  throw new Error('no candidate row has a bar the pointer can reach in the current scroll position');
}

/** Grabs the bar at `(grabX, grabY)` and moves, in one hop, to `(x, y)` — the same shape
 *  `gantt.test.ts`'s own vertical-drag tests dispatch: one `pointermove` past the threshold is both
 *  the arm and the final position, so there is no intermediate row for hysteresis to stick on. */
async function dragBarTo(page: Page, grabX: number, grabY: number, x: number, y: number): Promise<void> {
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 1 });
}

test("a leaf bar dropped into another parent's middle row reparents it, in one transaction, undoably", async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = (await rowPlan(page)).filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstGrabbableBar(
    page,
    rows.filter((row) => row.childCount === 0),
    pane,
    header,
  );
  const leafParentId = await currentParentId(page, leaf.entryId);
  // A parent row that is not already this leaf's own parent — otherwise the drop proves nothing.
  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const targetBand = (await rowBand(page, target.rowId).boundingBox())!;

  await countChangesFromHere(page);

  await dragBarTo(page, grabX, grabY, grabX, targetBand.y + targetBand.height / 2);
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.read('parentId'), leaf.entryId),
    )
    .toBe(target.entryId);

  // One transaction: one `change` event, whatever else it recomputes along the way (a rollup on the
  // old and the new parent's own cost included).
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(1);

  // One transaction: one undo puts the tree back exactly where it was.
  const undoBtn = page.getByRole('button', { name: 'Undo' });
  await expect(undoBtn).toBeEnabled();
  await undoBtn.click();
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(leafParentId);
});

test('a leaf dropped below the last row becomes the last root', async ({ page }) => {
  await gotoGeneric(page);
  const pane = await timelinePaneBox(page);

  // This fixture's row list runs far taller than the pane, so the native scroller never leaves a
  // gap below its own last pixel of content — scrolled all the way down, the last row's own bottom
  // *is* the pane's bottom, with no room for a pointer to land "past" it. Collapsing the tree down
  // to one path (`collapseAll`, then `expand` back up a single leaf's own ancestors, both public
  // API) makes the visible content short enough that a real gap opens up below the last row.
  const info = await page.evaluate((mobilizationMs) => {
    window.__gantt.collapseAll();
    const roots = window.__gantt.dataset.entries.all.filter((entry) => entry.depth === 0);
    const branchRoot = roots.find((entry) => entry.children().length > 0)!;

    function findLeafPastMobilization(
      entry: import('freegantt').Entry,
    ): import('freegantt').Entry | undefined {
      for (const child of entry.children()) {
        if (child.children().length === 0 && Number(child.start) > mobilizationMs) return child;
        const found = findLeafPastMobilization(child);
        if (found) return found;
      }
      return undefined;
    }
    // Dated past the Mobilization veto (see `gotoGeneric`'s own doc) — otherwise the drop resolves
    // fine but the harness page's own veto silently drops the commit.
    const leaf = findLeafPastMobilization(branchRoot)!;

    // Expands every ancestor from the root down to the leaf's own parent — the minimal path that
    // still paints the leaf, none of its collapsed cousins' descendants.
    let ancestor = leaf.parent();
    const chain: string[] = [];
    while (ancestor) {
      chain.unshift(String(ancestor.id));
      ancestor = ancestor.parent();
    }
    for (const id of chain) window.__gantt.expand(id);
    return { leafId: String(leaf.id) };
  }, PAST_MOBILIZATION_MS);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

  const leafStartMs = await page.evaluate(
    (id) => Number(window.__gantt.dataset.entries.get(id)!.start),
    info.leafId,
  );
  await page.evaluate((ms) => window.__gantt.panToDate(new Date(ms), 'center'), leafStartMs);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

  const leafBox = (await barOf(page, info.leafId).boundingBox())!;
  const grabX = Math.max(leafBox.x, pane.x) + 8;
  const grabY = leafBox.y + leafBox.height / 2;
  // Past every row this trimmed tree paints, still well short of the pane's own bottom — the gap
  // the collapse above opened up. `.fg-rows` itself stretches to its parent's full height (CSS
  // `height: 100%`), so its own box says nothing about where real content ends; the last row band
  // does.
  const lastRowBandBox = (await page.locator('#gantt .fg-row-band').last().boundingBox())!;
  const dropY = lastRowBandBox.y + lastRowBandBox.height + 50;

  // Not `dragBarTo`'s usual single hop: the collapse/expand/pan above just reflowed the row list,
  // and a single huge jump right after can race that reflow. Several small steps give the browser
  // room to settle between them, the way a real drag naturally would.
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX, dropY, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => currentParentId(page, info.leafId)).toBeUndefined();
  // Nothing sits under a root: the moved entry now paints the very last row.
  await expect
    .poll(() => page.locator('#gantt .fg-row').last().getAttribute('data-entry-id'))
    .toBe(info.leafId);
});

/** True when `entryId` has a direct child of its own with no children — a bar a pointer can arm a
 *  drag on at all (`view/capability.ts`'s `moveWritesSomething`, which a grandparent whose every
 *  child is itself a rolled-up parent never satisfies, so it takes no gesture, vertical or
 *  horizontal). Read off `Entry.children()`, not assumed from the fixture's own shape. */
async function hasDirectLeafChild(page: Page, entryId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const children = window.__gantt.dataset.entries.get(id)?.children() ?? [];
    return children.some((child) => child.children().length === 0);
  }, entryId);
}

test('dragging a parent bar onto its own child row refuses, with a not-allowed cursor, and writes nothing', async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = (await rowPlan(page)).filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  const parentCandidates: RowInfo[] = [];
  for (const row of rows.filter((row) => row.childCount > 0)) {
    if (await hasDirectLeafChild(page, row.entryId)) parentCandidates.push(row);
  }
  const { row: parentRow, grabX, grabY } = await firstGrabbableBar(page, parentCandidates, pane, header);
  const childRow = await firstOwnBarChild(page, parentRow.entryId, rows);
  const childBand = (await rowBand(page, childRow.rowId).boundingBox())!;

  const beforeParentId = await currentParentId(page, parentRow.entryId);

  await dragBarTo(page, grabX, grabY, grabX, childBand.y + childBand.height / 2);

  await expect(page.locator('#gantt')).toHaveAttribute('data-drop', 'refused');
  await expect
    .poll(() => page.locator('#gantt').evaluate((el) => getComputedStyle(el).cursor))
    .toBe('not-allowed');

  await page.mouse.up();
  await expect.poll(() => currentParentId(page, parentRow.entryId)).toBe(beforeParentId);
});

test("the insertion line sits deeper above a group's last child than below it", async ({ page }) => {
  await gotoGeneric(page);
  const allRows = await rowPlan(page);
  const ownBarRows = allRows.filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  // A leaf whose next row steps back out to a shallower depth: the owner's rule says the leaf's own
  // bottom zone still belongs to its group (deeper), and the row right after does not. Scanned over
  // every painted row — the `childrenAsSegments` row never has `childCount === 0`, so it never
  // becomes the "above" row here.
  let boundaryIndex = -1;
  for (let i = 0; i < allRows.length - 1; i++) {
    if (allRows[i]!.childCount === 0 && allRows[i + 1]!.depth < allRows[i]!.depth) {
      boundaryIndex = i;
      break;
    }
  }
  if (boundaryIndex === -1) {
    throw new Error('no group boundary (a leaf followed by a shallower row) in the generic-demo fixture');
  }
  const above = allRows[boundaryIndex]!;
  const below = allRows[boundaryIndex + 1]!;

  // A different, non-adjacent leaf to grab — its own row must not itself sit on the boundary being
  // measured, or its "source row" would swallow one of the two readings.
  const { grabX, grabY } = await firstGrabbableBar(
    page,
    ownBarRows.filter((row) => {
      const index = allRows.findIndex((r) => r.entryId === row.entryId);
      return (
        row.childCount === 0 && Math.abs(index - boundaryIndex) > 1 && Math.abs(index - boundaryIndex - 1) > 1
      );
    }),
    pane,
    header,
  );

  const aboveBand = (await rowBand(page, above.rowId).boundingBox())!;
  const belowBand = (await rowBand(page, below.rowId).boundingBox())!;
  const dropLine = page.locator('#gantt .fg-rows > .fg-drop-line');

  /** Reads the line's left inset at `y`, in its own fresh gesture — Escape then release, so no
   *  reading's hysteresis carries into the next one. */
  async function lineLeftAt(y: number): Promise<number> {
    await dragBarTo(page, grabX, grabY, grabX, y);
    await expect(dropLine).toBeVisible();
    const left = (await dropLine.boundingBox())!.x;
    await page.keyboard.press('Escape');
    await page.mouse.up();
    return left;
  }

  const insetAboveBoundary = await lineLeftAt(aboveBand.y + aboveBand.height - 2);
  const insetBelowBoundary = await lineLeftAt(belowBand.y + 2);

  expect(insetAboveBoundary).toBeGreaterThan(insetBelowBoundary);
});

test('dragging within the source row only shifts dates — no parentId row lands in the ChangeSet', async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = (await rowPlan(page)).filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstGrabbableBar(
    page,
    rows.filter((row) => row.childCount === 0),
    pane,
    header,
  );
  const startBefore = await page.evaluate(
    (id) => Number(window.__gantt.dataset.entries.get(id)!.start),
    leaf.entryId,
  );
  const linesBefore = await page.locator('#log div').count();

  // Same y throughout: the pointer never leaves the grabbed bar's own row.
  await dragBarTo(page, grabX, grabY, grabX + 80, grabY);
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((id) => Number(window.__gantt.dataset.entries.get(id)!.start), leaf.entryId),
    )
    .not.toBe(startBefore);

  // `prependLogLine` puts the newest line first, so the lines this drag added are the first
  // `linesAfter - linesBefore` entries.
  const linesAfter = await page.locator('#log div').count();
  const addedLines = (await page.locator('#log div').allTextContents()).slice(0, linesAfter - linesBefore);
  expect(addedLines.some((line) => line.includes(`entries · ${leaf.entryId} · start`))).toBe(true);
  expect(addedLines.some((line) => line.includes('· parentId ·'))).toBe(false);
});

test('a drag that starts vertical ignores later horizontal travel — it still only reparents', async ({
  page,
}) => {
  await gotoGeneric(page);
  const rows = (await rowPlan(page)).filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstGrabbableBar(
    page,
    rows.filter((row) => row.childCount === 0),
    pane,
    header,
  );
  const leafParentId = await currentParentId(page, leaf.entryId);
  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const targetBand = (await rowBand(page, target.rowId).boundingBox())!;
  const targetY = targetBand.y + targetBand.height / 2;
  const startBefore = await page.evaluate(
    (id) => Number(window.__gantt.dataset.entries.get(id)!.start),
    leaf.entryId,
  );
  const linesBefore = await page.locator('#log div').count();

  await countChangesFromHere(page);

  // Arms mostly vertical — 2px sideways, 20px toward the target row, well past the 4px threshold
  // and clearly `|dy| > |dx|`. The owner's ruling ("if you start dragging vertically it only
  // allows vertical") locks the drag to the row axis right here.
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 2, grabY + Math.sign(targetY - grabY) * 20, { steps: 1 });
  // Drifts far sideways on the way to the target row — the axis lock must hold anyway, so this
  // travel never reaches the bar's own dates.
  const driftedX = Math.min(grabX + 400, pane.x + pane.width - 10);
  await page.mouse.move(driftedX, targetY, { steps: 1 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.read('parentId'), leaf.entryId),
    )
    .toBe(target.entryId);

  // One transaction, and the grabbed entry's own start never moved despite the sideways drift.
  expect(await page.evaluate(() => window.__rowDragChangeCount)).toBe(1);
  expect(
    await page.evaluate((id) => Number(window.__gantt.dataset.entries.get(id)!.start), leaf.entryId),
  ).toBe(startBefore);

  const linesAfter = await page.locator('#log div').count();
  const addedLines = (await page.locator('#log div').allTextContents()).slice(0, linesAfter - linesBefore);
  expect(addedLines.some((line) => line.includes(`entries · ${leaf.entryId} · parentId`))).toBe(true);
  expect(addedLines.some((line) => line.includes(`entries · ${leaf.entryId} · start`))).toBe(false);
});

test('with "Lock tree" checked, a vertical drag refuses and leaves parentId unchanged', async ({ page }) => {
  await gotoGeneric(page);
  await page.check('#lock-tree-checkbox');
  // `check()` scrolls its own target into view first — the checkbox sits below `#gantt`, so that
  // scroll can carry the pane itself off the top of the viewport.
  await page.locator('#gantt').scrollIntoViewIfNeeded();

  const rows = (await rowPlan(page)).filter((row) => row.hasOwnBar);
  const pane = await timelinePaneBox(page);
  const header = await headerBox(page);

  const {
    row: leaf,
    grabX,
    grabY,
  } = await firstGrabbableBar(
    page,
    rows.filter((row) => row.childCount === 0),
    pane,
    header,
  );
  const leafParentId = await currentParentId(page, leaf.entryId);
  const target = rows.find((row) => row.childCount > 0 && row.entryId !== leafParentId)!;
  const targetBand = (await rowBand(page, target.rowId).boundingBox())!;

  await dragBarTo(page, grabX, grabY, grabX, targetBand.y + targetBand.height / 2);

  await expect(page.locator('#gantt')).toHaveAttribute('data-drop', 'refused');

  await page.mouse.up();
  await expect.poll(() => currentParentId(page, leaf.entryId)).toBe(leafParentId);
});
