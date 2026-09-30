// api/ — a row Delete on a locked row (the remove rule): all or nothing, one `info` report, and the
// app door (`entries.remove`) still removes. A row is focused first, so the Delete acts on the
// record and does not clear the dates of a bar.

import { describe, expect, it } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { entryId } from './index.js';
import type { ErrorReport } from './index.js';

const ENTRIES = [
  { id: 'locked', name: 'Locked', locked: true, start: '2026-09-01', end: '2026-09-03' },
  { id: 'open', name: 'Open', start: '2026-09-02', end: '2026-09-04' },
  { id: 'parent', name: 'Parent' },
  {
    id: 'lockedChild',
    name: 'Locked child',
    parentId: 'parent',
    locked: true,
    start: '2026-09-01',
    end: '2026-09-02',
  },
  { id: 'lockedParent', name: 'Locked parent', locked: true },
  { id: 'plainParent', name: 'Plain parent' },
  { id: 'plainChild', name: 'Plain child', parentId: 'plainParent', start: '2026-09-01', end: '2026-09-02' },
  { id: 'openChild', name: 'Open child', parentId: 'lockedParent', start: '2026-09-01', end: '2026-09-02' },
];

function mountGantt(): { container: HTMLElement; gantt: Gantt; dataset: Dataset; reports: ErrorReport[] } {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: ENTRIES, timeZone: 'UTC' });
  const gantt = new Gantt({ container, dataset });
  const reports: ErrorReport[] = [];
  gantt.on('error', (report) => {
    reports.push(report);
  });
  return { container, gantt, dataset, reports };
}

/** Focuses the first row, then selects the named Entries, and presses Delete. Focus comes first
 *  because a focused row selects itself. */
function deleteRows(setup: ReturnType<typeof mountGantt>, ...ids: string[]): void {
  const { container, gantt } = setup;
  container.querySelector<HTMLElement>(`.fg-row[data-entry-id="${ids[0]}"]`)!.focus();
  gantt.selectedEntryIds = ids.map(entryId);
  container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
}

function unmount({ gantt, container }: ReturnType<typeof mountGantt>): void {
  gantt.destroy();
  container.remove();
}

describe('a row Delete meets the remove rule', () => {
  it('removes an open row', () => {
    const setup = mountGantt();

    deleteRows(setup, 'open');

    expect(setup.dataset.entries.get('open')).toBeUndefined();
    expect(setup.reports).toEqual([]);
    unmount(setup);
  });

  it('refuses a locked row and reports it once at info severity', () => {
    const setup = mountGantt();

    deleteRows(setup, 'locked');

    expect(setup.dataset.entries.get('locked')).toBeDefined();
    expect(setup.reports).toHaveLength(1);
    expect(setup.reports[0]).toMatchObject({
      code: 'entry-remove-refused',
      severity: 'info',
      by: 'core',
      entryId: 'locked',
    });
    expect(setup.reports[0]?.reason).toContain('remove rule');
    expect(setup.reports[0]?.message).toContain('remove rule');
    unmount(setup);
  });

  it('removes nothing when one selected row is locked and one is open', () => {
    const setup = mountGantt();

    deleteRows(setup, 'open', 'locked');

    expect(setup.dataset.entries.get('open')).toBeDefined();
    expect(setup.dataset.entries.get('locked')).toBeDefined();
    expect(setup.reports).toHaveLength(1);
    expect(setup.reports[0]?.message).toContain('remove rule');
    expect(setup.reports[0]?.message).not.toContain('open');
    expect(setup.dataset.canUndo).toBe(false);
    unmount(setup);
  });

  it('refuses a parent that would take a locked child', () => {
    const setup = mountGantt();

    deleteRows(setup, 'parent');

    expect(setup.dataset.entries.get('parent')).toBeDefined();
    expect(setup.dataset.entries.get('lockedChild')).toBeDefined();
    expect(setup.reports.map((report) => report.code)).toEqual(['entry-remove-refused']);
    unmount(setup);
  });

  it('removes an open child of a locked row', () => {
    const setup = mountGantt();

    deleteRows(setup, 'openChild');

    expect(setup.dataset.entries.get('openChild')).toBeUndefined();
    expect(setup.dataset.entries.get('lockedParent')).toBeDefined();
    expect(setup.reports).toEqual([]);
    unmount(setup);
  });

  it('removes two open rows as one undo step', () => {
    const setup = mountGantt();

    deleteRows(setup, 'open', 'openChild');
    setup.dataset.undo();

    expect(setup.dataset.entries.get('open')).toBeDefined();
    expect(setup.dataset.entries.get('openChild')).toBeDefined();
    unmount(setup);
  });

  it('removes a parent and its selected child together', () => {
    const setup = mountGantt();

    deleteRows(setup, 'plainParent', 'plainChild');

    expect(setup.dataset.entries.get('plainParent')).toBeUndefined();
    expect(setup.dataset.entries.get('plainChild')).toBeUndefined();
    unmount(setup);
  });

  it('lets app code remove a locked row through the dataset', () => {
    const setup = mountGantt();

    setup.dataset.entries.remove('locked');

    expect(setup.dataset.entries.get('locked')).toBeUndefined();
    unmount(setup);
  });
});
