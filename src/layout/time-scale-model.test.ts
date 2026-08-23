import { describe, expect, it } from 'vitest';
import { fitProjectScale } from './time-scale-model.js';
import { createTimeScale, instant } from '../time/index.js';
import { taskId } from '../model/index.js';
import type { Task } from '../model/index.js';

const tasks: Task[] = [
  {
    id: taskId('t1'),
    name: 'A',
    start: instant('2026-09-01T00:00:00Z'),
    end: instant('2026-09-03T00:00:00Z'),
    scheduling: 'auto',
  },
  {
    id: taskId('t2'),
    name: 'B',
    start: instant('2026-09-02T00:00:00Z'),
    end: instant('2026-09-06T00:00:00Z'),
    scheduling: 'auto',
  },
];

describe('fitProjectScale', () => {
  it('fits the project span exactly into the given viewport width', () => {
    const scale = createTimeScale(fitProjectScale({ tasks, zone: 'UTC', viewportWidth: 800 }));
    expect(scale.xForInstant(tasks[0]!.start)).toBe(0);
    expect(scale.xForInstant(tasks[1]!.end)).toBeCloseTo(800);
  });

  it('flows the project zone through to the resulting TimeScale.zone', () => {
    const options = fitProjectScale({ tasks, zone: 'America/Chicago', viewportWidth: 800 });
    expect(options.zone).toBe('America/Chicago');
    expect(createTimeScale(options).zone).toBe('America/Chicago');
  });

  it('does not divide by zero for an empty or zero-span project', () => {
    const empty = fitProjectScale({ tasks: [], zone: 'UTC', viewportWidth: 800 });
    expect(Number.isFinite(empty.pxPerMs)).toBe(true);

    const zeroSpan: Task[] = [{ ...tasks[0]!, end: tasks[0]!.start }];
    const zeroWidth = fitProjectScale({ tasks: zeroSpan, zone: 'UTC', viewportWidth: 0 });
    expect(Number.isFinite(zeroWidth.pxPerMs)).toBe(true);
  });
});
