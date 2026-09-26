import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __dataset: import('freegantt').Dataset;
    __gantt: import('freegantt').Gantt;
  }
}

// `harness/editing-and-data.ts` merges data.ts, editing.ts and plugins.ts (harness/e2e/*) into one
// demo. This file proves a handful of the page's headline features work end to end, not every
// control the old pages had.

function logLines(page: import('@playwright/test').Page) {
  return page.locator('#log div').allTextContents();
}

test('adding an entry is one transaction, and the log shows it as one changeset', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  const before = await page.evaluate(() => window.__dataset.entries.all.length);
  await page.locator('#add-entry').click();
  const after = await page.evaluate(() => window.__dataset.entries.all.length);
  expect(after).toBe(before + 1);

  const lines = await logLines(page);
  expect(lines[0]).toMatch(/entries · new-1 · added/);
});

test('locking the selected entry refuses a rename, and the log names why', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary)').first();
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page.locator('#lock-checkbox')).toBeEnabled();

  await page.locator('#lock-checkbox').check();
  await expect(page.locator('#rename-input')).toBeEnabled();

  const nameBefore = await page.locator('#rename-input').inputValue();
  await page.locator('#rename-input').fill('Renamed while locked');
  await page.locator('#rename-btn').click();

  // The write is refused — the log names the refusal, and the Entry's own name is unchanged.
  await expect(page.locator('#log div').first()).toContainText('is locked');
  const nameAfter = await page.evaluate(() => {
    const id = window.__gantt.selectedEntryIds[0]!;
    return window.__dataset.entries.get(id)!.name;
  });
  expect(nameAfter).toBe(nameBefore);
});

test("unlocking Program's subtree opens note inside it, and leaves an outside entry locked", async ({
  page,
}) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // 'entry-3' sits under 'program' (Program > entry-1 > entry-2 > entry-3); 'ops-oncall' is a
  // separate root span (`fixtures/demo-dataset.ts`).
  const before = await page.evaluate(() => ({
    inside: window.__dataset.editableOf('entry-3', 'note'),
    outside: window.__dataset.editableOf('ops-oncall', 'note'),
  }));
  expect(before.inside).toBe('never');
  expect(before.outside).toBe('never');

  await page.locator('#unlock-subtree-checkbox').check();

  const after = await page.evaluate(() => ({
    inside: window.__dataset.editableOf('entry-3', 'note'),
    outside: window.__dataset.editableOf('ops-oncall', 'note'),
  }));
  expect(after.inside).toBe('anywhere');
  expect(after.outside).toBe('never');

  // The checkbox is a plugin-store write like any other: one undo closes the subtree again, and one
  // redo opens it back up.
  await page.evaluate(() => window.__dataset.undo());
  expect(await page.evaluate(() => window.__dataset.editableOf('entry-3', 'note'))).toBe('never');
  await page.evaluate(() => window.__dataset.redo());
  expect(await page.evaluate(() => window.__dataset.editableOf('entry-3', 'note'))).toBe('anywhere');

  // The write lands: select the now-open entry and press the button.
  await page.evaluate(() => window.__gantt.reveal('entry-3'));
  const bar = page.locator('#gantt .fg-bar[data-bar-id^="entry-3:"]').first();
  await expect(bar).toBeVisible();
  await bar.click();
  await page.locator('#note-btn').click();

  const noteAfter = await page.evaluate(() => window.__dataset.entries.get('entry-3')!.read('note'));
  expect(noteAfter).toBe('Reviewed');
});

test('a beforeEntryMove veto refuses a drop before the Mobilization line', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await page.getByLabel('Snap').selectOption('none');

  // The page opens on today's own week (`gantt.panToToday()`), and the Mobilization line sits only
  // a week out — every bar with its own dates already starts before it, so a small leftward drag on
  // one is enough to cross the veto (`harness/editing-and-data.ts`). `gantt.reveal` scrolls it into
  // view first — only the windowed rows reach the DOM (I3).
  const entryId = await page.evaluate(() => {
    const entry = window.__dataset.entries.all.find((e) => e.start !== undefined && e.end !== undefined)!;
    window.__gantt.reveal(entry.id);
    return entry.id;
  });
  const bar = page.locator(`#gantt .fg-bar[data-bar-id^="${entryId}:"]`).first();
  await expect(bar).toBeVisible();
  const before = await page.evaluate((id) => window.__dataset.entries.get(id)!.start?.toString(), entryId);

  const box = await bar.boundingBox();
  if (!box) throw new Error('missing bar bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator('#toast')).toContainText('mobilization');
  const after = await page.evaluate((id) => window.__dataset.entries.get(id)!.start?.toString(), entryId);
  expect(after).toBe(before);
});

test('export writes the document, and import round-trips the entry count', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#export-btn').click();
  const exported = await page.locator('#document-json').inputValue();
  expect(exported.length).toBeGreaterThan(0);
  const parsed = JSON.parse(exported) as { id: string }[];
  expect(parsed.length).toBeGreaterThan(0);

  const countBefore = await page.evaluate(() => window.__dataset.entries.all.length);
  await page.locator('#import-btn').click();
  const countAfter = await page.evaluate(() => window.__dataset.entries.all.length);
  expect(countAfter).toBe(countBefore);

  const lines = await logLines(page);
  expect(lines[0]).toMatch(/imported \d+ entries/);
});

// #496: `entries.load()` is order-tolerant — a pasted document may list a child before its parent,
// and the import still lands in one commit. `load` is a full fresh start (L1), so it clears undo,
// and a `locked` row the document names stays locked once the load lands (the lock plugin's own
// `beforeChange` steps aside for `origin: 'load'`, `harness/plugins/lock-entries.ts`).
test('with Program gone, the unlock checkbox logs why and stays clear', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // An import with no 'program' entry removes the subtree root the checkbox names.
  const noProgram = [{ id: 'solo', name: 'Solo', start: '2026-02-01', end: '2026-02-05' }];
  await page.locator('#document-json').fill(JSON.stringify(noProgram));
  await page.locator('#import-btn').click();
  expect(await page.evaluate(() => window.__dataset.entries.has('program'))).toBe(false);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // `click`, not `check`: `check` fails when the page clears the box, and clearing it is the point.
  await page.locator('#unlock-subtree-checkbox').click();

  await expect(page.locator('#unlock-subtree-checkbox')).not.toBeChecked();
  expect(await logLines(page)).toContainEqual(expect.stringContaining('Program entry is gone'));
  expect(pageErrors).toEqual([]);
});

test('import tolerates a child before its parent, clears undo, and a lock holds', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  // Rename something first, so Undo starts enabled — proof the import is what clears it, not an
  // empty history the page already had.
  const bar = page.locator('#gantt .fg-bar:not(.fg-bar-summary)').first();
  await bar.click();
  await page.locator('#rename-input').fill('Renamed before import');
  await page.locator('#rename-btn').click();
  await expect(page.getByLabel('Undo')).toBeEnabled();

  const childBeforeParent = [
    {
      id: 'imported-child',
      name: 'Imported child',
      parentId: 'imported-parent',
      start: '2026-02-02',
      end: '2026-02-03',
    },
    { id: 'imported-parent', name: 'Imported parent', start: '2026-02-01', end: '2026-02-05', locked: true },
  ];
  await page.locator('#document-json').fill(JSON.stringify(childBeforeParent));
  await page.locator('#import-btn').click();

  const landed = await page.evaluate(() => ({
    count: window.__dataset.entries.all.length,
    parentOfChild: window.__dataset.entries.get('imported-child')?.parent()?.id,
  }));
  expect(landed.count).toBe(2);
  expect(landed.parentOfChild).toBe('imported-parent');

  await expect(page.getByLabel('Undo')).toBeDisabled();

  const lockRefused = await page.evaluate(() => {
    try {
      window.__dataset.entries.update('imported-parent', { name: 'Should stay locked' });
      return false;
    } catch {
      return true;
    }
  });
  expect(lockRefused).toBe(true);
});

// #517: `entries.syncAll()` diffs a fetched list against the live data — unlike Import (`load`), it
// keeps a kept row's selection and records no undo step. `harness/fake-server.ts` scripts the
// first "Sync from server" click as a rename and a date shift on 'entry-3'. This proves the
// conflict rule (`docs/11-server-data.md`): the server's rename overwrites a local edit it never
// saw, and undo keeps the server's value instead of writing over it (#549).
test("a sync overwrites a local rename it never saw, and undo keeps the server's value", async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.evaluate(() => window.__gantt.reveal('entry-3'));
  const bar = page.locator('#gantt .fg-bar[data-bar-id^="entry-3:"]').first();
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page.locator('#lock-checkbox')).toBeEnabled();

  const nameBefore = await bar.textContent();
  await page.locator('#rename-input').fill('Renamed locally');
  await page.locator('#rename-btn').click();
  await expect(bar).toHaveText('Renamed locally');
  await expect(page.getByLabel('Undo')).toBeEnabled();

  await page.locator('#sync-all-btn').click();

  await expect(bar).toHaveText('Renamed by the server');
  const selectionAfter = await page.evaluate(() => window.__gantt.selectedEntryIds);
  expect(selectionAfter).toEqual(['entry-3']);
  await expect(page.getByLabel('Undo')).toBeEnabled();

  await page.getByLabel('Undo').click();
  await expect(bar).toHaveText('Renamed by the server');
  // The undo forgot the only step and committed nothing; `historyChange` still turns the button off.
  await expect(page.getByLabel('Undo')).toBeDisabled();
  expect(nameBefore).not.toBe('Renamed by the server');
});

// `entries.syncChanges()` takes only the rows a server changed — `harness/fake-server.ts`
// scripts the first "Sync changes from server" click as a rename on `entry-6`, with every other key
// left alone. This proves a delta poll keeps selection and records no undo step, the same as a
// whole-list sync.
test('a sync of changes only renames the one row a server delta named, and keeps selection', async ({
  page,
}) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.evaluate(() => window.__gantt.reveal('entry-6'));
  const bar = page.locator('#gantt .fg-bar[data-bar-id^="entry-6:"]').first();
  await expect(bar).toBeVisible();
  await bar.click();

  const startBefore = await page.evaluate(() => window.__dataset.entries.get('entry-6')?.start);
  await expect(page.getByLabel('Undo')).toBeDisabled();

  await page.locator('#sync-changes-btn').click();

  await expect(bar).toHaveText('Renamed by a server delta');
  const selectionAfter = await page.evaluate(() => window.__gantt.selectedEntryIds);
  expect(selectionAfter).toEqual(['entry-6']);
  const startAfter = await page.evaluate(() => window.__dataset.entries.get('entry-6')?.start);
  expect(startAfter).toBe(startBefore);
  await expect(page.getByLabel('Undo')).toBeDisabled();
});

// The second scripted delta poll both upserts a new row and removes one — `harness/fake-server.ts`
// adds `server-delta-added-1` under `entry-5` and removes `entry-11`. This proves a delta remove
// drops the row while every other row keeps its value.
test('a second sync of changes adds one row and removes another named by the delta', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.locator('#sync-changes-btn').click();
  await page.locator('#sync-changes-btn').click();

  await page.evaluate(() => window.__gantt.reveal('server-delta-added-1'));
  await expect(page.locator('#gantt .fg-bar[data-bar-id^="server-delta-added-1:"]').first()).toHaveText(
    'Added by a server delta',
  );
  const removedEntry = await page.evaluate(() => window.__dataset.entries.get('entry-11'));
  expect(removedEntry).toBeUndefined();
  const keptEntry = await page.evaluate(() => window.__dataset.entries.get('entry-9')?.name);
  expect(keptEntry).toBeDefined();
});

// #489 owner ruling: `gantt.preset = '<id>'` also finds a preset in this Gantt's own `zoomPresets`,
// not only the shipped table — the picker's one line (`harness/gantt-toolbar.ts`,
// `gantt.preset = presetSelect.value`) needs no special case for the custom "sixHour" rung
// `harness/editing-and-data.ts` splices in.
test('picking the custom "Every 6 hours" rung switches preset with no error', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await page.getByLabel('Time scale').selectOption({ label: 'Every 6 hours' });

  await expect.poll(() => page.evaluate(() => window.__gantt.preset.id)).toBe('sixHour');
  expect(pageErrors).toEqual([]);
});

test('the buffer + risk kind plugins toggle off and on', async ({ page }) => {
  await page.goto('/editing-and-data.html');
  await expect(page.locator('#gantt .fg-bar').first()).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.__gantt.hasPlugin('demo.bufferKind'))).toBe(true);

  await page.locator('#kind-plugins-toggle').uncheck();
  await expect.poll(() => page.evaluate(() => window.__gantt.hasPlugin('demo.bufferKind'))).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__gantt.hasPlugin('demo.riskKind'))).toBe(false);

  await page.locator('#kind-plugins-toggle').check();
  await expect.poll(() => page.evaluate(() => window.__gantt.hasPlugin('demo.bufferKind'))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__gantt.hasPlugin('demo.riskKind'))).toBe(true);
});
