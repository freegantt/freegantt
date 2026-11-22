// api/ — `ctx.view.onRowLayout` through a mounted Gantt: a plugin hears about a row top or height
// that moved, and never about a scroll. happy-dom runs frames on its animation-frame stub.

import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { Gantt } from './gantt.js';
import { definePlugin } from './define-plugin.js';

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function mount() {
  const calls = { count: 0 };
  const boxes: Array<{ top: number; height: number } | undefined> = [];
  const dataset = new Dataset({
    timeZone: 'UTC',
    entries: [
      { id: 'parent', name: 'Parent', start: '2026-01-01', end: '2026-01-09' },
      { id: 'child', name: 'Child', start: '2026-01-02', end: '2026-01-04', parentId: 'parent' },
      { id: 'other', name: 'Other', start: '2026-01-05', end: '2026-01-07' },
    ],
  });
  const gantt = new Gantt({
    container: document.createElement('div'),
    dataset,
    rowSource: { source: 'entries', tree: true },
    plugins: [
      definePlugin({
        id: 'demo.rowLayout',
        view(ctx) {
          ctx.view.onRowLayout(() => {
            calls.count += 1;
            boxes.push(ctx.view.rowBox('other'));
          });
        },
      }),
    ],
  });
  return { gantt, dataset, calls, boxes };
}

describe('ctx.view.onRowLayout', () => {
  it('does not fire for the frame painted at mount', async () => {
    const { calls } = mount();
    await nextFrame();
    expect(calls.count).toBe(0);
  });

  it('fires after a row height change, with a rowBox that is already current', async () => {
    const { gantt, calls, boxes } = mount();
    await nextFrame();
    gantt.rowHeight = () => 50;
    await nextFrame();
    expect(calls.count).toBeGreaterThan(0);
    expect(boxes.at(-1)).toEqual({ top: 100, height: 50 });
  });

  it('fires after a collapse', async () => {
    const { gantt, calls, boxes } = mount();
    await nextFrame();
    gantt.toggleCollapse('parent');
    await nextFrame();
    expect(calls.count).toBeGreaterThan(0);
    expect(boxes.at(-1)?.top).toBe(36);
  });

  it('fires after a data change', async () => {
    const { dataset, calls } = mount();
    await nextFrame();
    dataset.entries.add({ id: 'late', name: 'Late', start: '2026-01-08', end: '2026-01-09' });
    await nextFrame();
    expect(calls.count).toBeGreaterThan(0);
  });

  it('stays quiet when only the time axis moves', async () => {
    const { gantt, calls } = mount();
    await nextFrame();
    gantt.panToDate('2026-01-06');
    await nextFrame();
    await nextFrame();
    expect(calls.count).toBe(0);
  });
});
