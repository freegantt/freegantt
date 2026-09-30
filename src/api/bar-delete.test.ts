// api/ — Delete on a bar removes the Entry the bar draws, and "Clear dates" is the one command that
// clears dates. Both act on the Selection. No node holds focus in these tests, so the command target
// is the Selection alone, the same as a bar target.

import { describe, expect, it, vi } from 'vitest';
import { Gantt } from './gantt.js';
import { Dataset } from './dataset.js';
import { barId, entryId } from './index.js';
import type { ErrorReport } from './index.js';
import { contextMenu } from '../extensions/features/context-menu.js';

const ENTRIES = [
  { id: 'plain', name: 'Plain', start: '2026-09-01', end: '2026-09-03' },
  { id: 'other', name: 'Other', start: '2026-09-02', end: '2026-09-04' },
  { id: 'dateless', name: 'Dateless' },
  { id: 'startOnly', name: 'Start only', start: '2026-09-02' },
  { id: 'locked', name: 'Locked', locked: true, start: '2026-09-01', end: '2026-09-03' },
  { id: 'split', name: 'Split' },
  { id: 'split-a', name: 'Split A', parentId: 'split', start: '2026-09-01', end: '2026-09-03' },
  { id: 'split-b', name: 'Split B', parentId: 'split', start: '2026-09-05', end: '2026-09-09' },
  { id: 'solo', name: 'Solo' },
  { id: 'solo-child', name: 'Solo child', parentId: 'solo', start: '2026-09-01', end: '2026-09-03' },
  { id: 'guarded', name: 'Guarded' },
  {
    id: 'guarded-child',
    name: 'Guarded child',
    parentId: 'guarded',
    locked: true,
    start: '2026-09-01',
    end: '2026-09-03',
  },
];

interface Setup {
  container: HTMLElement;
  gantt: Gantt;
  dataset: Dataset;
  reports: ErrorReport[];
}

function mountGantt(options: { segmented?: boolean; twoBars?: boolean } = {}): Setup {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({ entries: ENTRIES, timeZone: 'UTC' });
  const gantt = new Gantt({
    container,
    dataset,
    plugins: [contextMenu()],
    ...(options.segmented === true
      ? { rowSource: { source: 'entries' as const, childrenAsSegments: true } }
      : {}),
    ...(options.twoBars === true
      ? {
          variants: [
            {
              name: 'two-bars',
              when: (entry) => entry.id === 'plain',
              bars: (entry) => [
                {
                  id: barId(entry.id, 0),
                  entryId: entry.id,
                  variant: 'two-bars',
                  start: entry.start!,
                  end: entry.end!,
                },
                {
                  id: barId(entry.id, 1),
                  entryId: entry.id,
                  variant: 'two-bars',
                  start: entry.start!,
                  end: entry.end!,
                },
              ],
            },
          ],
        }
      : {}),
  });
  const reports: ErrorReport[] = [];
  gantt.on('error', (report) => {
    reports.push(report);
  });
  return { container, gantt, dataset, reports };
}

function unmount({ gantt, container }: Setup): void {
  gantt.destroy();
  container.remove();
}

function select(setup: Setup, ...ids: string[]): void {
  setup.gantt.selectedEntryIds = ids.map(entryId);
}

function pressDelete(setup: Setup): void {
  setup.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
}

describe('Delete on a bar removes its Entry', () => {
  it('removes a plain bar, and one undo restores the Entry', () => {
    const setup = mountGantt();
    select(setup, 'plain');

    pressDelete(setup);

    expect(setup.dataset.entries.get('plain')).toBeUndefined();
    expect(setup.reports).toEqual([]);
    setup.dataset.undo();
    expect(setup.dataset.entries.get('plain')?.start).toBeDefined();
    unmount(setup);
  });

  it('removes each Entry once when a Variant draws several bars for it and all are selected', () => {
    const setup = mountGantt({ twoBars: true });
    expect(setup.container.querySelectorAll('.fg-bar[data-bar-id^="plain:"]').length).toBe(2);
    const remove = vi.spyOn(setup.dataset.entries, 'remove');
    setup.gantt.selectedEntryIds = [entryId('plain'), entryId('plain')];

    pressDelete(setup);

    expect(remove.mock.calls).toEqual([['plain']]);
    expect(setup.dataset.entries.get('plain')).toBeUndefined();
    expect(setup.dataset.entries.get('other')).toBeDefined();
    setup.dataset.undo();
    expect(setup.dataset.entries.get('plain')).toBeDefined();
    unmount(setup);
  });

  it('removes only the child of a segmented bar', () => {
    const setup = mountGantt({ segmented: true });
    select(setup, 'split-a');

    pressDelete(setup);

    expect(setup.dataset.entries.get('split-a')).toBeUndefined();
    expect(setup.dataset.entries.get('split-b')).toBeDefined();
    expect(setup.dataset.entries.get('split')).toBeDefined();
    unmount(setup);
  });

  it('keeps the parent as an empty row when its last segmented child goes', () => {
    const setup = mountGantt({ segmented: true });
    select(setup, 'split-a');
    pressDelete(setup);
    select(setup, 'split-b');

    pressDelete(setup);

    expect(setup.dataset.entries.get('split-b')).toBeUndefined();
    expect(setup.dataset.entries.get('split')).toBeDefined();
    expect(setup.container.querySelector('.fg-row[data-entry-id="split"]')).not.toBeNull();
    unmount(setup);
  });

  it('removes a rolling-up parent with its whole subtree in one undo step', () => {
    const setup = mountGantt();
    select(setup, 'solo');

    pressDelete(setup);

    expect(setup.dataset.entries.get('solo')).toBeUndefined();
    expect(setup.dataset.entries.get('solo-child')).toBeUndefined();
    setup.dataset.undo();
    expect(setup.dataset.entries.get('solo')).toBeDefined();
    expect(setup.dataset.entries.get('solo-child')).toBeDefined();
    unmount(setup);
  });

  it('writes nothing and reports once when the remove rule refuses the bar', () => {
    const setup = mountGantt();
    select(setup, 'locked');

    pressDelete(setup);

    expect(setup.dataset.entries.get('locked')).toBeDefined();
    expect(setup.dataset.canUndo).toBe(false);
    expect(setup.reports).toHaveLength(1);
    expect(setup.reports[0]).toMatchObject({
      code: 'entry-remove-refused',
      severity: 'info',
      entryId: 'locked',
    });
    expect(setup.reports[0]?.message).toContain('these Entries, or an Entry below them');
    unmount(setup);
  });

  it('refuses the whole Delete when a parent holds a locked child', () => {
    const setup = mountGantt();
    select(setup, 'plain', 'guarded');

    pressDelete(setup);

    expect(setup.dataset.entries.get('plain')).toBeDefined();
    expect(setup.dataset.entries.get('guarded')).toBeDefined();
    expect(setup.reports.map((report) => report.code)).toEqual(['entry-remove-refused']);
    unmount(setup);
  });
});

describe('freegantt.clearDates', () => {
  it('clears the dates of the selected Entry and keeps the record', () => {
    const setup = mountGantt();
    select(setup, 'plain');

    setup.gantt.commands.run('freegantt.clearDates');

    const cleared = setup.dataset.entries.get('plain');
    expect(cleared).toBeDefined();
    expect(cleared?.start).toBeUndefined();
    expect(cleared?.end).toBeUndefined();
    unmount(setup);
  });

  it('clears the date a start-only Entry holds', () => {
    const setup = mountGantt();
    select(setup, 'startOnly');

    setup.gantt.commands.run('freegantt.clearDates');

    expect(setup.dataset.entries.get('startOnly')?.start).toBeUndefined();
    unmount(setup);
  });

  it('is not offered when nothing selected has dates of its own to clear', () => {
    const setup = mountGantt();
    const offered = (): string[] => setup.gantt.commands.available().map((command) => command.id);

    select(setup, 'dateless');
    expect(offered()).not.toContain('freegantt.clearDates');
    select(setup, 'solo');
    expect(offered()).not.toContain('freegantt.clearDates');
    select(setup, 'plain');
    expect(offered()).toContain('freegantt.clearDates');
    unmount(setup);
  });

  it('passes over Entries with nothing to clear, in one undo step', () => {
    const setup = mountGantt();
    select(setup, 'plain', 'dateless', 'solo', 'other');

    setup.gantt.commands.run('freegantt.clearDates');

    expect(setup.dataset.entries.get('plain')?.start).toBeUndefined();
    expect(setup.dataset.entries.get('other')?.end).toBeUndefined();
    expect(setup.dataset.entries.get('solo-child')?.start).toBeDefined();
    expect(setup.reports).toEqual([]);
    setup.dataset.undo();
    expect(setup.dataset.entries.get('plain')?.start).toBeDefined();
    expect(setup.dataset.entries.get('other')?.end).toBeDefined();
    unmount(setup);
  });

  it('writes nothing and reports once when a lock refuses one Entry', () => {
    const setup = mountGantt();
    select(setup, 'plain', 'locked');

    setup.gantt.commands.run('freegantt.clearDates');

    expect(setup.dataset.entries.get('plain')?.start).toBeDefined();
    expect(setup.dataset.entries.get('locked')?.start).toBeDefined();
    expect(setup.dataset.canUndo).toBe(false);
    expect(setup.reports).toHaveLength(1);
    expect(setup.reports[0]).toMatchObject({
      code: 'entry-clear-dates-refused',
      severity: 'info',
      by: 'core',
      entryId: 'locked',
    });
    unmount(setup);
  });

  it('writes nothing when a beforeChange handler refuses', () => {
    const setup = mountGantt();
    select(setup, 'plain', 'other');
    setup.dataset.on('beforeChange', () => false);

    expect(() => setup.gantt.commands.run('freegantt.clearDates')).not.toThrow();

    expect(setup.dataset.entries.get('plain')?.start).toBeDefined();
    expect(setup.dataset.entries.get('other')?.start).toBeDefined();
    unmount(setup);
  });

  it('has no default key', () => {
    const setup = mountGantt();
    select(setup, 'plain');

    for (const key of ['Delete', 'Backspace']) {
      setup.container.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true }));
    }

    expect(setup.dataset.entries.get('plain')?.start).toBeDefined();
    unmount(setup);
  });

  it('appears in the bar context menu and runs from it', () => {
    const setup = mountGantt();
    select(setup, 'plain');
    const bar = setup.container.querySelector<HTMLElement>('.fg-bar[data-bar-id^="plain:"]')!;

    bar.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
    const item = Array.from(setup.container.querySelectorAll<HTMLElement>('.fg-menu-item')).find(
      (element) => element.getAttribute('data-command') === 'freegantt.clearDates',
    );

    expect(item?.textContent).toContain('Clear dates');
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(setup.dataset.entries.get('plain')?.start).toBeUndefined();
    unmount(setup);
  });
});
