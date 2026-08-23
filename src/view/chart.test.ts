import { describe, expect, it } from 'vitest';
import { Chart } from './chart.js';
import { TimeScaleModel, instant } from '../layout/index.js';
import { taskId } from '../model/index.js';
import type { Task } from '../model/index.js';

const zone = 'UTC';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-06T00:00:00Z'); // 5 days

const tasks: Task[] = [
  {
    id: taskId('t1'),
    name: 'Task 1',
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
    scheduling: 'auto',
  },
];

describe('Chart header band', () => {
  it('renders one tick per day for the day preset', () => {
    const host = document.createElement('div');
    const scale = new TimeScaleModel({
      zone,
      range: { start: rangeStart, end: rangeEnd },
      pxPerMs: 1 / (1000 * 60 * 60),
    });
    const chart = new Chart({ host, tasks, zone, scale, rowHeight: 32 });

    const ticks = host.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.textContent).toBe('2026-09-01');

    chart.destroy();
    expect(host.children.length).toBe(0);
  });
});
