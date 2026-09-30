import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  gotoGeneric,
  barOf,
  timelinePaneBox,
  currentParentId,
  visibleRowEntryIds,
} from './row-drag-support.js';

// The keyboard moves an Entry in the tree. In the grid pane all four chords work. On a bar,
// `Alt+ArrowUp` and `Alt+ArrowDown` move the row, and `Alt+Shift+Arrow` still resizes the bar with
// the snap off. The context menu offers the four commands for a bar. Every test reads its Entry
// back off the page: a dated leaf in the middle of its siblings, so each chord has room to act.

interface Subject {
  readonly id: string;
  readonly parentId: string;
  /** The Entry that sits just above it among its siblings — the parent an indent makes. */
  readonly previousSiblingId: string;
}

async function pickSubject(page: Page): Promise<Subject> {
  const visible = await visibleRowEntryIds(page);
  const subject = await page.evaluate((visibleIds) => {
    for (const id of visibleIds) {
      const entry = window.__gantt.dataset.entries.get(id);
      const parent = entry?.parent();
      if (entry === undefined || parent === undefined || entry.children().length > 0) continue;
      if (entry.start === undefined || entry.end === undefined) continue;
      // A bar far from the panned time range is not painted, so a bar test needs one that is.
      if (document.querySelector(`#gantt .fg-bar[data-bar-id^="${id}:"]`) === null) continue;
      const siblings = parent.children();
      const index = siblings.findIndex((sibling) => sibling.id === entry.id);
      const previous = siblings[index - 1];
      // An indent nests the row under `previous`. A segmented parent draws its children as bars on its
      // own row, so the indented row would leave the grid. Only a childless sibling makes a safe parent.
      const previousIsLeaf = previous !== undefined && previous.children().length === 0;
      if (index > 0 && index < siblings.length - 1 && previous !== undefined && previousIsLeaf) {
        return { id: String(entry.id), parentId: String(parent.id), previousSiblingId: String(previous.id) };
      }
    }
    return undefined;
  }, visible);
  if (subject === undefined) throw new Error('no visible dated leaf sits between two siblings');
  return subject;
}

const gridRowOf = (page: Page, id: string): Locator =>
  page.locator(`#gantt .fg-grid-pane .fg-row[data-entry-id="${id}"]`);

async function childIdsOf(page: Page, id: string): Promise<string[]> {
  return page.evaluate(
    (parentId) =>
      (window.__gantt.dataset.entries.get(parentId)?.children() ?? []).map((child) => String(child.id)),
    id,
  );
}

async function endOf(page: Page, id: string): Promise<string> {
  return page.evaluate((entryId) => String(window.__gantt.dataset.entries.get(entryId)?.end), id);
}

test('in the grid pane, the four chords move the focused row and keep focus on it', async ({ page }) => {
  await gotoGeneric(page);
  const subject = await pickSubject(page);
  const row = gridRowOf(page, subject.id);
  const startOrder = await childIdsOf(page, subject.parentId);
  const startIndex = startOrder.indexOf(subject.id);
  await row.focus();

  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(() => childIdsOf(page, subject.parentId))
    .toEqual(swapped(startOrder, startIndex, startIndex + 1));
  await expect(row).toBeFocused();

  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => childIdsOf(page, subject.parentId)).toEqual(startOrder);
  await expect(row).toBeFocused();

  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(() => currentParentId(page, subject.id)).toBe(subject.previousSiblingId);
  await expect(row).toBeFocused();

  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect.poll(() => currentParentId(page, subject.id)).toBe(subject.parentId);
  await expect.poll(() => childIdsOf(page, subject.parentId)).toEqual(startOrder);
  await expect(row).toBeFocused();
});

test('on a bar, Alt+ArrowUp and Alt+ArrowDown move the row and keep focus on the bar', async ({ page }) => {
  await gotoGeneric(page);
  const subject = await pickSubject(page);
  const bar = barOf(page, subject.id);
  const startOrder = await childIdsOf(page, subject.parentId);
  const startIndex = startOrder.indexOf(subject.id);
  await bar.focus();

  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(() => childIdsOf(page, subject.parentId))
    .toEqual(swapped(startOrder, startIndex, startIndex + 1));
  await expect(bar).toBeFocused();

  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(() => childIdsOf(page, subject.parentId)).toEqual(startOrder);
  await expect(bar).toBeFocused();
});

/** Three visible siblings in a row, with a fourth below them. The run moves down past that fourth. */
async function pickThreeSiblings(page: Page): Promise<{ parentId: string; ids: string[] }> {
  const visible = await visibleRowEntryIds(page);
  const found = await page.evaluate((visibleIds) => {
    for (const id of visibleIds) {
      const parent = window.__gantt.dataset.entries.get(id)?.parent();
      if (parent === undefined) continue;
      const siblings = parent.children().map((child) => String(child.id));
      for (let start = 0; start + 3 < siblings.length; start += 1) {
        const run = siblings.slice(start, start + 4);
        if (run.every((sibling) => visibleIds.includes(sibling))) {
          return { parentId: String(parent.id), ids: run.slice(0, 3) };
        }
      }
    }
    return undefined;
  }, visible);
  if (found === undefined) throw new Error('no parent shows four visible children');
  return found;
}

test('with three rows selected, Alt+ArrowDown moves all three, and Ctrl+Z restores them', async ({
  page,
}) => {
  await gotoGeneric(page);
  const { parentId, ids } = await pickThreeSiblings(page);
  const startOrder = await childIdsOf(page, parentId);
  const firstIndex = startOrder.indexOf(ids[0]!);
  const expected = [...startOrder];
  const [passed] = expected.splice(firstIndex + 3, 1);
  expected.splice(firstIndex, 0, passed!);
  const row = gridRowOf(page, ids[0]!);
  // Focus selects its row, so the three-row Selection comes after it.
  await row.focus();
  await page.evaluate((selected) => {
    window.__gantt.selectedEntryIds = selected.map((id) => window.__dataset.entries.get(id)!.id);
  }, ids);

  await page.keyboard.press('Alt+ArrowDown');

  await expect.poll(() => childIdsOf(page, parentId)).toEqual(expected);
  await expect(gridRowOf(page, ids[0]!)).toBeFocused();

  await page.keyboard.press('Control+z');

  await expect.poll(() => childIdsOf(page, parentId)).toEqual(startOrder);
});

test('on a bar, Alt+Shift+Arrow resizes the bar and leaves the tree alone', async ({ page }) => {
  await gotoGeneric(page);
  const subject = await pickSubject(page);
  const bar = barOf(page, subject.id);
  const endBefore = await endOf(page, subject.id);
  await bar.focus();

  await page.keyboard.press('Alt+Shift+ArrowRight');

  await expect.poll(() => endOf(page, subject.id)).not.toBe(endBefore);
  expect(await currentParentId(page, subject.id)).toBe(subject.parentId);
  await expect(bar).toBeFocused();
});

test('the context menu on a grid row indents it and keeps focus on the row', async ({ page }) => {
  await gotoGeneric(page);
  const subject = await pickSubject(page);
  const row = gridRowOf(page, subject.id);

  await row.click({ button: 'right' });
  await page.locator('#gantt .fg-menu-item[data-command="freegantt.indentEntry"]').click();

  await expect.poll(() => currentParentId(page, subject.id)).toBe(subject.previousSiblingId);
  // A right-click focuses a cell of the row, so focus returns to a cell inside the row.
  await expect(row.locator(':focus')).toHaveCount(1);
});

test('the context menu on a bar indents the Entry and returns focus to the bar', async ({ page }) => {
  await gotoGeneric(page);
  const subject = await pickSubject(page);
  const bar = barOf(page, subject.id);

  // A real pointer position, not `bar.click()`: its scroll-into-view would close the menu.
  const point = await visiblePointOf(page, bar);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.locator('#gantt .fg-menu-item[data-command="freegantt.indentEntry"]').click();

  await expect.poll(() => currentParentId(page, subject.id)).toBe(subject.previousSiblingId);
  await expect(bar).toBeFocused();
});

/** The middle of the part of the bar that sits inside the timeline pane. The grid pane can cover the
 *  rest of a bar that starts left of the pane. */
async function visiblePointOf(page: Page, bar: Locator): Promise<{ x: number; y: number }> {
  const box = (await bar.boundingBox())!;
  const pane = await timelinePaneBox(page);
  const left = Math.max(box.x, pane.x);
  const right = Math.min(box.x + box.width, pane.x + pane.width);
  return { x: (left + right) / 2, y: box.y + box.height / 2 };
}

function swapped(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
