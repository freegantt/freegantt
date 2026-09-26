import { test, expect, type Locator, type Page } from '@playwright/test';

// N13 (ADR 0013's appendix): the parent bar drag, in a real browser.
//
// ADR 0013 gives a row with children no authored dates — the Rollup derives its envelope from what
// is under it. So dragging that row's bar does not write the row. The gesture proposes the dated
// descendants alone (`src/view/gesture-pipeline.test.ts:958` calls `commitEntryEdits` once, with the
// child alone), and the parent's own cells move afterwards because the Rollup recalculates them.
// That is the rule ADR 0013 still holds: *nothing but the Rollup writes a rolling-up parent's cell*.
// Its older wording, "a derived value never reaches the Document", has no Document left to reach —
// ADR 0016 deleted it.
//
// Unit tests pin both seams (`src/view/capability.test.ts`, `src/view/gesture-pipeline.test.ts`).
// What only a browser can show is the pointer end of it: hit-testing a `.fg-bar-summary`, whose own
// background is transparent and whose bracket is ten pixels tall in the middle of the row.
//
// **Two pages, because neither one proves both halves.**
//
// `hierarchy.html` carries the data half. It logs every committed ChangeSet from the changeset alone
// and has an undo button, so who got written is readable. Its pixels prove nothing: it runs
// `range: 'fitDataset'`, and a drag that moves every dated entry moves the fitted range with them, so
// every bar lands back on the pixel it started on. Measured, not assumed.
//
// `planner.html` carries the paint half. Its `range` is a fixed span, so a phase bar that moves stays
// moved, and its sibling phases stay where they were.

/** How far each test drags, and the clearance the grab point needs to its right so the pointer never
 *  leaves the pane and starts an edge autoscroll. */
const DRAG_DX = 120;
const CLEARANCE = DRAG_DX + 20;

interface DragTarget {
  readonly parentId: string;
  readonly bar: Locator;
  readonly childIds: readonly string[];
  /** Where to put the pointer down. Not the bar's own centre — see `grabbableParentBar`. */
  readonly grabX: number;
  readonly grabY: number;
}

/** Dates as the Dataset holds them, keyed by entry id. An undated Entry is left out rather than
 *  carried as `undefined`, which does not survive the trip back from `page.evaluate`. */
async function datesOf(page: Page, ids: readonly string[]): Promise<Record<string, [number, number]>> {
  return page.evaluate((wanted) => {
    const dates: Record<string, [number, number]> = {};
    for (const id of wanted) {
      const entry = window.__gantt.dataset.entries.get(id);
      if (entry?.start !== undefined && entry.end !== undefined) {
        dates[id] = [Number(entry.start), Number(entry.end)];
      }
    }
    return dates;
  }, ids);
}

/** A summary bar the pointer can actually grab, with at least two dated children.
 *
 *  Its grab point is not the bar's centre. A parent's bracket spans everything under it, so it can be
 *  wider than the pane and run off both sides of the viewport — the whole box is then never on
 *  screen, and the centre of that box can sit past the right edge. So this clips the bar against the
 *  pane and grabs near the left of what is left, keeping `CLEARANCE` to its right. The pointer must
 *  also clear `.fg-header`, which is sticky: a row scrolled under it takes no click (N12, the reason
 *  `selection.spec.ts` skips summary bars).
 *
 *  Two dated children, not one. One child moving is indistinguishable from core writing the parent
 *  and cascading down. Two, moving by one shared delta, is the translation ADR 0013 describes. */
async function grabbableParentBar(page: Page): Promise<DragTarget> {
  const bars = page.locator('#gantt .fg-bar-summary');
  await bars.first().waitFor();
  const pane = (await page.locator('#gantt .fg-timeline-pane').boundingBox())!;
  const header = (await page.locator('#gantt .fg-header').boundingBox())!;
  const viewport = page.viewportSize()!;
  const rightEdge = Math.min(pane.x + pane.width, viewport.width);
  const count = await bars.count();
  const skipped: string[] = [];

  for (let i = 0; i < count; i++) {
    const bar = bars.nth(i);
    const box = await bar.boundingBox();
    const barId = await bar.getAttribute('data-bar-id');
    if (!box || barId === null) continue;
    // Item.id is `${entryId}:${segmentIndex}` (plans/01 §2.4).
    const parentId = barId.slice(0, barId.lastIndexOf(':'));

    const grabX = Math.max(box.x, pane.x) + 8;
    const grabY = box.y + box.height / 2;
    if (grabX + CLEARANCE > Math.min(box.x + box.width, rightEdge)) {
      skipped.push(`${parentId}: no room to drag right`);
      continue;
    }
    if (grabY <= header.y + header.height || grabY >= pane.y + pane.height) {
      skipped.push(`${parentId}: the row is under the sticky header or below the pane`);
      continue;
    }

    const childIds = await page.evaluate((id) => {
      return (window.__gantt.dataset.entries.get(id)?.children() ?? [])
        .filter((child) => child.start !== undefined && child.end !== undefined)
        .map((child) => String(child.id));
    }, parentId);

    if (childIds.length >= 2) return { parentId, bar, childIds, grabX, grabY };
    skipped.push(`${parentId}: ${childIds.length} dated children`);
  }
  throw new Error(`no grabbable summary bar has two dated children. Skipped: ${skipped.join('; ')}`);
}

async function dragRight(page: Page, target: DragTarget): Promise<void> {
  await page.mouse.move(target.grabX, target.grabY);
  await page.mouse.down();
  await page.mouse.move(target.grabX + DRAG_DX, target.grabY, { steps: 8 });
  await page.mouse.up();
}

/** Resolves once the first child has moved, so the assertions below read a committed state rather
 *  than racing the commit. */
async function firstChildMoved(
  page: Page,
  target: DragTarget,
  before: Record<string, [number, number]>,
): Promise<void> {
  const first = target.childIds[0]!;
  await expect
    .poll(async () => {
      const after = await datesOf(page, [first]);
      return (after[first]?.[0] ?? before[first]![0]) - before[first]![0];
    })
    .toBeGreaterThan(0);
}

async function gotoExpandedHierarchy(page: Page): Promise<void> {
  await page.goto('/e2e/hierarchy.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  // A collapsed parent still paints a bar, but its children paint no row to read back against.
  await page.click('#expand-all-btn');
  await expect(page.locator('#gantt .fg-bar-summary').first()).toBeVisible();
}

test('dragging a parent bar translates its dated children by one shared delta (ADR 0013)', async ({
  page,
}) => {
  await gotoExpandedHierarchy(page);

  const target = await grabbableParentBar(page);
  const { childIds } = target;
  const before = await datesOf(page, childIds);

  await dragRight(page, target);
  await firstChildMoved(page, target, before);

  const after = await datesOf(page, childIds);
  const deltas = childIds.flatMap((id) => [after[id]![0] - before[id]![0], after[id]![1] - before[id]![1]]);

  // One delta, on every start and every end. A resize would move `end` and not `start`; a cascade
  // over a rewritten parent would move the children by amounts that differ.
  expect(new Set(deltas).size).toBe(1);
  expect(deltas[0]).toBeGreaterThan(0);
});

test('a dragged parent lands on the envelope the Rollup re-derives (ADR 0013)', async ({ page }) => {
  await gotoExpandedHierarchy(page);

  const target = await grabbableParentBar(page);
  const { parentId, childIds } = target;
  const before = await datesOf(page, childIds);

  await dragRight(page, target);
  await firstChildMoved(page, target, before);

  const rows = await page.locator('#log div').allTextContents();

  // Every child the drag moved is in the changeset, and so is the parent the Rollup recalculated.
  // One transaction carries both (plans/01 §6), which is why one undo returns all of them.
  for (const id of [...childIds, parentId]) {
    expect(rows.some((line) => line.includes(`entries · ${id} · start`))).toBe(true);
  }

  // The Rollup's answer, not the gesture's. The parent's span is exactly what sits under it after the
  // move: leave the Rollup out and the parent keeps its pre-drag envelope while its children move.
  const dates = await datesOf(page, [...childIds, parentId]);
  expect(dates[parentId]![0]).toBe(Math.min(...childIds.map((id) => dates[id]![0])));
  expect(dates[parentId]![1]).toBe(Math.max(...childIds.map((id) => dates[id]![1])));
});

test('undo puts a dragged parent bar back where it was (ADR 0013)', async ({ page }) => {
  await gotoExpandedHierarchy(page);

  const target = await grabbableParentBar(page);
  const { childIds } = target;
  const before = await datesOf(page, childIds);

  await dragRight(page, target);
  await expect(page.locator('#undo-btn')).toBeEnabled();
  await firstChildMoved(page, target, before);

  await page.click('#undo-btn');

  // One transaction per gesture (plans/01 §6), so one undo returns every child it moved.
  await expect.poll(async () => datesOf(page, childIds)).toEqual(before);
});

test('a dragged parent bar moves, and its sibling parents stay put (ADR 0013)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  /** Every phase bracket by entry id, so one read covers the bar that moves and the bars that must
   *  not. Rounded: a bar that stayed put must be identical, not merely close. */
  const brackets = async (): Promise<Record<string, [number, number]>> =>
    page.evaluate(() => {
      const boxes: Record<string, [number, number]> = {};
      const bars = document.querySelectorAll<HTMLElement>('#gantt .fg-bar-summary');
      for (const element of Array.from(bars)) {
        const barId = element.dataset['barId'] ?? '';
        const rect = element.getBoundingClientRect();
        boxes[barId.slice(0, barId.lastIndexOf(':'))] = [Math.round(rect.left), Math.round(rect.right)];
      }
      return boxes;
    });

  const target = await grabbableParentBar(page);
  const before = await brackets();
  const childDatesBefore = await datesOf(page, target.childIds);

  await dragRight(page, target);
  await firstChildMoved(page, target, childDatesBefore);

  // The grabbed phase followed the children the gesture wrote. Nothing wrote the phase itself.
  // 8px: well past the 4px drag threshold and past typical subpixel layout jitter. Polled: the
  // phase repaints a frame after its children, and WebKit reads that frame late (#317).
  await expect
    .poll(async () => (await brackets())[target.parentId]![0] - before[target.parentId]![0])
    .toBeGreaterThan(8);
  const after = await brackets();

  // Its siblings did not move. This is the half `hierarchy.html` cannot show: there the fitted range
  // shifts with the data, so every bar keeps its pixel and a drag that did nothing looks the same as
  // one that worked.
  for (const [id, box] of Object.entries(before)) {
    if (id === target.parentId) continue;
    expect(after[id], `${id} should not have moved`).toEqual(box);
  }
});
