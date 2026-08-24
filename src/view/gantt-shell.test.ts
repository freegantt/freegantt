import { describe, expect, it } from 'vitest';
import { GanttShell } from './gantt-shell.js';
import { TimeScaleModel } from '../layout/index.js';
import { entryId } from '../model/index.js';
import type { Entry, Instant } from '../model/index.js';

// view/ has no import edge to time/ (plans/01 §1) — instant() lives there. Date.parse on a
// Z-offset string is deterministic regardless of the host machine's zone, unlike `new Date(str)`
// on a zoneless string (#27), so this is not the thing I10 exists to ban.
function instant(iso: string): Instant {
  return Date.parse(iso) as Instant;
}

const zone = 'UTC';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-06T00:00:00Z'); // 5 days

const entries: Entry[] = [
  {
    id: entryId('t1'),
    name: 'Entry 1',
    start: rangeStart,
    end: instant('2026-09-03T00:00:00Z'),
  },
];

describe('GanttShell header band', () => {
  it('renders one tick per day for the day preset', () => {
    const host = document.createElement('div');
    const scale = new TimeScaleModel({ range: { start: rangeStart, end: rangeEnd } });
    const shell = new GanttShell({ host, entries, zone, scale, rowHeight: 32 });

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
    const shellA = new GanttShell({ host: hostA, entries, zone, scale, rowHeight: 32 });

    const initialTickCount = hostA.querySelectorAll('.fg-header .fg-tick').length;

    const hostB = document.createElement('div');
    const widerEntries: Entry[] = [
      {
        id: entryId('w1'),
        name: 'W1',
        start: rangeStart,
        end: instant('2026-09-20T00:00:00Z'),
      },
    ];
    const shellB = new GanttShell({ host: hostB, entries: widerEntries, zone, scale, rowHeight: 32 });

    // A never called render() itself after B bound — the notify from B's bind is what pushed this.
    expect(hostA.querySelectorAll('.fg-header .fg-tick').length).toBeGreaterThan(initialTickCount);

    shellA.destroy();
    shellB.destroy();
  });
});
