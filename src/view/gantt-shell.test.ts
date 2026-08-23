import { describe, expect, it } from 'vitest';
import { GanttShell } from './gantt-shell.js';
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

describe('GanttShell header band', () => {
  it('renders one tick per day for the day preset', () => {
    const host = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = new GanttShell({ host, tasks, zone, scale, rowHeight: 32 });

    const ticks = host.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.textContent).toBe('2026-09-01');

    shell.destroy();
    expect(host.children.length).toBe(0);
  });

  it('re-renders when a second Gantt binds to the same shared scale (#6, D9)', () => {
    // No pinned range: the scale fits every bound project, so binding B widens the span A reads from.
    const scale = new TimeScaleModel();
    const hostA = document.createElement('div');
    const shellA = new GanttShell({ host: hostA, tasks, zone, scale, rowHeight: 32 });

    const initialTickCount = hostA.querySelectorAll('.fg-header .fg-tick').length;

    const hostB = document.createElement('div');
    const widerTasks: Task[] = [
      {
        id: taskId('w1'),
        name: 'W1',
        start: rangeStart,
        end: instant('2026-09-20T00:00:00Z'),
        scheduling: 'auto',
      },
    ];
    const shellB = new GanttShell({ host: hostB, tasks: widerTasks, zone, scale, rowHeight: 32 });

    // A never called render() itself after B bound — the notify from B's bind is what pushed this.
    expect(hostA.querySelectorAll('.fg-header .fg-tick').length).toBeGreaterThan(initialTickCount);

    shellA.destroy();
    shellB.destroy();
  });
});
