// api/ — the Delete key through a mounted Gantt that holds Dependencies. A focused connector loses
// its Dependency. Any other focus keeps core's own meaning: Delete removes the Entry.

import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import { entryDependencies } from './index.js';

function mount() {
  const dependencies = entryDependencies();
  const container = document.createElement('div');
  document.body.append(container);
  const dataset = new Dataset({
    timeZone: 'UTC',
    plugins: [dependencies],
    entries: [
      { id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-03' },
      { id: 'b', name: 'B', start: '2026-01-04', end: '2026-01-06' },
      { id: 'c', name: 'C', start: '2026-01-07', end: '2026-01-09' },
    ],
  });
  dependencies.replaceAll([
    { id: 'd1', fromId: 'a', toId: 'b', type: 'FS', lag: { value: 0, unit: 'day' } },
    { id: 'd2', fromId: 'b', toId: 'c', type: 'FS', lag: { value: 0, unit: 'day' } },
  ]);
  const gantt = new Gantt({ container, dataset });
  const press = (target: HTMLElement, key: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };
  const line = (id: string): HTMLElement =>
    container.querySelector<HTMLElement>(`[data-connector-id="dependency:${id}"]`)!;
  return { dependencies, dataset, gantt, container, press, line };
}

describe('Delete on a Gantt with Dependencies', () => {
  it('removes the Dependency of the focused connector, and one undo restores it', () => {
    const { dependencies, dataset, gantt, press, line } = mount();

    press(line('d1'), 'Delete');
    expect(dependencies.all().map((d) => d.id)).toEqual(['d2']);
    expect(dataset.entries.has('a')).toBe(true);

    dataset.undo();
    expect(
      dependencies
        .all()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['d1', 'd2']);
    gantt.destroy();
  });

  it('still removes the Entry when a row has focus', () => {
    const { dataset, gantt, container, press } = mount();
    const row = container.querySelector<HTMLElement>('.fg-row[data-entry-id="c"]')!;
    row.focus();

    press(row, 'Delete');

    expect(dataset.entries.has('c')).toBe(false);
    gantt.destroy();
  });

  it('lets an arrow key on a connector move focus to the next connector', () => {
    const { gantt, press, line } = mount();

    press(line('d1'), 'ArrowDown');

    expect(document.activeElement).toBe(line('d2'));
    gantt.destroy();
  });
});
