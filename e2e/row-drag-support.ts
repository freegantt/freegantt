import { expect, type Locator, type Page } from '@playwright/test';

// A vertical bar drag (#425) and a grid row drag (#602) both run on `generic.html` and read the
// same fixture back at test time — never a hardcoded id — so the helpers below serve both specs.
// `row-drag.spec.ts` drags a bar; `grid-row-drag.spec.ts` drags a grid row. Neither file duplicates
// the other's fixture-reading logic.

declare global {
  interface Window {
    __gantt: import('freegantt').Gantt;
    /** How many `Dataset` `change` events fired since a test last reset it — one transaction fires
     *  one `change` event no matter how many rows it touches (a rollup recompute on the old and the
     *  new parent's own cost included), so this, not a line count, is what "one ChangeSet" means. */
    __rowDragChangeCount: number;
    /** The listener `countChangesFromHere` last armed, so a repeat call can drop it before it adds
     *  another — without this, a second call on the same page would double-count every change. */
    __rowDragChangeDisposer: (() => void) | undefined;
  }
}

// `main.ts`'s own Mobilization date line vetoes a drop whose proposed start lands before it (two days
// out from today) — a vertical-only drag keeps the dragged Entry's own start, so a bar dated before
// that line refuses every drop, not just an early one. `panToDate` centres the pane on a date safely
// past it (14 days, double the boundary, so no clock skew between the test runner and the page turns
// this into a coin flip) — a public API call, not a scroll simulation.
export const PAST_MOBILIZATION_MS = Date.now() + 14 * 24 * 60 * 60 * 1000;

/** The demo plan starts two weeks before today, so the page opens on today with the early bars off to
 *  the left. This pans to the body of the plan, where bars sit on screen. A public `panToDate` call. */
export async function panToPlanBody(page: Page): Promise<void> {
  const bodyMs = Date.now() + 10 * 24 * 60 * 60 * 1000;
  await page.evaluate((ms) => window.__gantt.panToDate(new Date(ms), 'center'), bodyMs);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

export async function gotoGeneric(page: Page): Promise<void> {
  await page.goto('/generic.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();
  // This page opens with nothing collapsed, but a summary bar only paints once its dateless
  // parent's own row exists — a readier proof that the whole tree painted than the first bar alone.
  await expect(page.locator('#gantt .fg-bar-summary').first()).toBeVisible();
  // The page-head copy above #gantt grows over time (most recently for #602's grid drag
  // sentence), so its own height is not a constant a fixed test viewport can assume. Scrolling
  // #gantt fully into view first keeps every row and pane geometry a test reads afterwards
  // inside the browser's real, interactable viewport, not just inside the element's own layout
  // box.
  await page.locator('#gantt').scrollIntoViewIfNeeded();

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
export async function countChangesFromHere(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__rowDragChangeDisposer?.();
    window.__rowDragChangeCount = 0;
    window.__rowDragChangeDisposer = window.__gantt.dataset.on('change', () => {
      window.__rowDragChangeCount += 1;
    });
  });
}

export interface RowInfo {
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
export async function rowPlan(page: Page): Promise<RowInfo[]> {
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

export function rowBand(page: Page, rowId: string): Locator {
  return page.locator(`#gantt .fg-row-band[data-row-id="${rowId}"]`);
}

/** The bar an entry draws — a dated entry's own bar, or a rollup parent's summary bar. Both carry a
 *  `data-bar-id` of `${entryId}:${index}`. */
export function barOf(page: Page, entryId: string): Locator {
  return page.locator(`#gantt .fg-bar[data-bar-id^="${entryId}:"]`).first();
}

export async function timelinePaneBox(page: Page) {
  return (await page.locator('#gantt .fg-timeline-pane').boundingBox())!;
}

export async function headerBox(page: Page) {
  return (await page.locator('#gantt .fg-header').boundingBox())!;
}

export async function currentParentId(page: Page, entryId: string): Promise<string | undefined> {
  return page.evaluate((id) => window.__gantt.dataset.entries.get(id)?.parent()?.id, entryId);
}

/** The first entry from `candidateRows` that is a direct child of `parentId` — the child a
 *  parent-onto-child drag, or a parent-bar drop, can actually land a bounding box on. Reads
 *  children back off the Entry, so it never assumes the fixture puts a matching child first. */
export async function firstChildRow(
  page: Page,
  parentId: string,
  candidateRows: readonly RowInfo[],
): Promise<RowInfo> {
  const childIds = await page.evaluate(
    (id) => (window.__gantt.dataset.entries.get(id)?.children() ?? []).map((child) => String(child.id)),
    parentId,
  );
  const found = candidateRows.find((row) => childIds.includes(row.entryId));
  if (!found) throw new Error(`no row paints a child of ${parentId}`);
  return found;
}

export interface GrabPoint {
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
export async function firstGrabbableBar(
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
    // Wide enough that the visible middle sits clear of a resize handle at either edge. A sliver
    // clipped at the pane edge is all handle.
    if (right - left < 30) continue;
    const grabY = box.y + box.height / 2;
    if (grabY <= header.y + header.height || grabY >= pane.y + pane.height) continue;
    return { row, grabX: (left + right) / 2, grabY };
  }
  throw new Error('no candidate row has a bar the pointer can reach in the current scroll position');
}

/** Presses the pointer at `(grabX, grabY)` and moves, in one hop, to `(x, y)` — the same shape
 *  `gantt.test.ts`'s own vertical-drag tests dispatch: one `pointermove` past the threshold is both
 *  the arm and the final position, so there is no intermediate row for hysteresis to stick on. Grabs
 *  a bar or a grid row alike — both arm the same way past the 4px threshold. */
export async function dragPointerTo(
  page: Page,
  grabX: number,
  grabY: number,
  x: number,
  y: number,
): Promise<void> {
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 1 });
}

/** Locks the entry under `(x, y)` through the right-click "Lock" command — the core `locked` Field
 *  (#612), the same door the page's checkbox writes. The command reads the acted-on entry, so a
 *  point on a bar or on a grid row both work; the caller picks whichever grab point it already read. */
export async function lockEntryAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y, { button: 'right' });
  await page.locator('#gantt .fg-menu-item[data-command="demo.lockEntry"]').click();
}

/** True when `entryId` has a direct child of its own with no children — a row a pointer can arm a
 *  drag on at all (`view/capability.ts`'s `moveWritesSomething`, which a grandparent whose every
 *  child is itself a rolled-up parent never satisfies, so it takes no gesture, vertical or
 *  horizontal). Read off `Entry.children()`, not assumed from the fixture's own shape. */
export async function hasDirectLeafChild(page: Page, entryId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const children = window.__gantt.dataset.entries.get(id)?.children() ?? [];
    return children.some((child) => child.children().length === 0);
  }, entryId);
}

/** The rows viewport: the clipped band below the sticky header, where the rows scroll. */
export async function rowsViewportBox(page: Page) {
  return (await page.locator('#gantt .fg-rows-clip').boundingBox())!;
}

/** The entry id of every row whose grid box sits fully inside the rows viewport right now. */
export async function visibleRowEntryIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const clip = document.querySelector('#gantt .fg-rows-clip')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll<HTMLElement>('#gantt .fg-grid-pane .fg-row'))
      .filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= clip.top && box.bottom <= clip.bottom;
      })
      .map((row) => row.dataset['entryId']!);
  });
}

/** Moves a pressed pointer to `edgeGapPx` inside the bottom edge of the rows viewport, holds it
 *  there with no further move, and waits until the rows stop scrolling at the content end. */
export async function holdAtBottomEdgeUntilRowsSettle(page: Page, x: number, edgeGapPx = 6): Promise<void> {
  const viewport = await rowsViewportBox(page);
  await page.mouse.move(x, viewport.y + viewport.height - edgeGapPx, { steps: 1 });
  const firstRowTop = () =>
    page.evaluate(() => document.querySelector('#gantt .fg-grid-pane .fg-row')!.getBoundingClientRect().top);
  let previous = Number.NaN;
  await expect
    .poll(
      async () => {
        const current = await firstRowTop();
        const settled = current === previous;
        previous = current;
        return settled;
      },
      { intervals: [200] },
    )
    .toBe(true);
}

/** The last parent row that scrolled into view during a drag: it sat below the rows viewport at the
 *  start, so no pointer move alone could reach it. */
export async function parentRowScrolledIntoView(
  page: Page,
  visibleAtStart: readonly string[],
): Promise<RowInfo> {
  const nowVisible = new Set(await visibleRowEntryIds(page));
  const scrolledIn = (await rowPlan(page)).filter(
    (row) => row.childCount > 0 && nowVisible.has(row.entryId) && !visibleAtStart.includes(row.entryId),
  );
  const target = scrolledIn.at(-1);
  if (!target) throw new Error('no parent row scrolled into view from below the rows viewport');
  return target;
}
