// A `locked` column is a lock toggle. The core `locked` Field is `editable: 'anywhere'` with a
// checkbox editor, so an app that lists it in `gridColumns` gives the user a toggle. The lock
// leaves the `locked` cell itself open, so a user can unlock a locked row from the grid.

import { describe, expect, it } from 'vitest';
import { Dataset } from '../../api/dataset.js';
import { Gantt } from '../../api/gantt.js';
import type { GanttOptions } from '../../api/index.js';
import { inlineEditing } from './inline-editing.js';

function lockColumnGantt(ganttOptions: Partial<GanttOptions> = {}): {
  container: HTMLElement;
  gantt: Gantt;
  dataset: Dataset;
} {
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({
    timeZone: 'UTC',
    entries: [
      { id: 'free', name: 'Free', start: '2026-01-01', end: '2026-01-05' },
      { id: 'held', name: 'Held', start: '2026-01-01', end: '2026-01-05', locked: true },
    ],
  });
  const gantt = new Gantt({
    container,
    dataset,
    gridColumns: ['name', { field: 'locked', header: 'Lock', width: 70 }],
    plugins: [inlineEditing()],
    ...ganttOptions,
  });
  return { container, gantt, dataset };
}

function lockCell(container: HTMLElement, entryId: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.fg-row[data-entry-id="${entryId}"]`)!;
  return row.querySelector<HTMLElement>('[data-field="locked"]')!;
}

function toggleLock(container: HTMLElement, entryId: string, checked: boolean): void {
  lockCell(container, entryId).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const editor = container.querySelector<HTMLInputElement>('.fg-cell-editor-control')!;
  editor.checked = checked;
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

describe('a locked column toggles the lock', () => {
  it('answers anywhere for the locked cell, on a free row and on a locked row', () => {
    const { dataset } = lockColumnGantt();

    expect(dataset.editableOf('free', 'locked')).toBe('anywhere');
    expect(dataset.editableOf('held', 'locked')).toBe('anywhere');
  });

  it('shows a Locked column for the bare key, and no lock column by default', () => {
    const bare = lockColumnGantt({ gridColumns: ['name', 'locked'] });
    const plain = lockColumnGantt({ gridColumns: ['name', 'start', 'end'] });

    expect(bare.container.querySelector('.fg-grid-header')?.textContent).toContain('Locked');
    expect(lockCell(bare.container, 'held')).not.toBeNull();
    expect(plain.container.querySelector('[data-field="locked"]')).toBeNull();
    for (const { gantt, container } of [bare, plain]) {
      gantt.destroy();
      container.remove();
    }
  });

  it('locks a free row from the grid, and one undo unlocks it', () => {
    const { container, gantt, dataset } = lockColumnGantt();

    toggleLock(container, 'free', true);

    expect(dataset.entries.get('free')!.read('locked')).toBe(true);
    expect(dataset.editableOf('free', 'name')).toBe('api');
    dataset.undo();
    expect(dataset.entries.get('free')!.read('locked')).toBeUndefined();
    gantt.destroy();
    container.remove();
  });

  it('unlocks a locked row from the grid, and one undo locks it again', () => {
    const { container, gantt, dataset } = lockColumnGantt();

    toggleLock(container, 'held', false);

    expect(dataset.entries.get('held')!.read('locked')).toBe(false);
    expect(dataset.editableOf('held', 'name')).toBe('anywhere');
    dataset.undo();
    expect(dataset.entries.get('held')!.read('locked')).toBe(true);
    gantt.destroy();
    container.remove();
  });

  it('closes the column when capabilities.edit refuses the locked Field', () => {
    const { container, gantt, dataset } = lockColumnGantt({
      capabilities: { edit: (_entry, field) => (field === 'locked' ? false : undefined) },
    });

    lockCell(container, 'free').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
    );

    expect(container.querySelector('.fg-cell-editor')).toBeNull();
    expect(dataset.entries.get('free')!.read('locked')).toBeUndefined();
    gantt.destroy();
    container.remove();
  });
});
