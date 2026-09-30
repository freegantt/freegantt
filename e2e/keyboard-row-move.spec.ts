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
      if (index > 0 && index < siblings.length - 1 && previous !== undefined) {
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
