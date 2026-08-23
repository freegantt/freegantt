import { describe, expect, it } from 'vitest';
import { TimeScaleModel } from './time-scale-model.js';
import { dayPreset, instant, MS } from '../time/index.js';
import { taskId } from '../model/index.js';
import type { Task } from '../model/index.js';

function task(id: string, start: string, end: string): Task {
  return {
    id: taskId(id),
    name: id,
    start: instant(start),
    end: instant(end),
    scheduling: 'auto',
  };
}

const tasks: Task[] = [
  task('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z'),
  task('t2', '2026-09-02T00:00:00Z', '2026-09-06T00:00:00Z'),
];

describe('TimeScaleModel', () => {
  it('resolves zone from the binding, never from the caller (D6)', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'America/Chicago', tasks, viewportWidth: 800 });
    expect(model.scale.zone).toBe('America/Chicago');
  });

  it("fits the bound project's span into the measured viewport by default", () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 800 });

    expect(model.scale.xForInstant(tasks[0]!.start)).toBe(0);
    expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(800);
  });

  it('spans every bound project, so one scale can carry two Gantt instances (D9)', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks: [tasks[0]!], viewportWidth: 800 });
    model.bind({
      zone: 'UTC',
      tasks: [task('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
      viewportWidth: 800,
    });

    // Neither caller computed the union: t1's start through w1's end is 9 days.
    expect(model.scale.range.start).toBe(instant('2026-09-01T00:00:00Z'));
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));
  });

  it('re-resolves when a Gantt binds or unbinds', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks: [tasks[0]!], viewportWidth: 800 });
    const unbind = model.bind({
      zone: 'UTC',
      tasks: [task('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
      viewportWidth: 800,
    });
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));

    unbind();
    expect(model.scale.range.end).toBe(instant('2026-09-03T00:00:00Z'));
  });

  it('honours a pinned TimeSpan range instead of fitting the project', () => {
    const range = { start: instant('2026-01-01T00:00:00Z'), end: instant('2026-01-08T00:00:00Z') };
    const model = new TimeScaleModel({ range });
    model.bind({ zone: 'UTC', tasks, viewportWidth: 700 });

    expect(model.scale.range).toEqual(range);
    expect(model.scale.xForInstant(range.end)).toBeCloseTo(700);
  });

  it("falls back to the preset's own zoom when the host is unmeasured, not to a degenerate scale", () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 0 });

    // dayPreset states 24px per day tick; that is a scale, not a special case.
    expect(model.scale.xForInstant(instant('2026-09-02T00:00:00Z'))).toBeCloseTo(dayPreset.tickWidthPx);
    expect(model.scale.widthForDuration({ value: 1, unit: 'd' }, tasks[0]!.start)).toBeCloseTo(
      dayPreset.tickWidthPx,
    );
  });

  it('resolves a zero-span or empty project through the preset rather than dividing by zero', () => {
    const empty = new TimeScaleModel();
    empty.bind({ zone: 'UTC', tasks: [], viewportWidth: 800 });
    expect(empty.scale.widthForDuration({ value: 1, unit: 'd' }, instant(0))).toBeCloseTo(
      dayPreset.tickWidthPx,
    );

    const zeroSpan = new TimeScaleModel();
    const at = tasks[0]!.start;
    zeroSpan.bind({ zone: 'UTC', tasks: [{ ...tasks[0]!, end: at }], viewportWidth: 800 });
    expect(zeroSpan.scale.widthForDuration({ value: 1, unit: 'd' }, at)).toBeCloseTo(dayPreset.tickWidthPx);
  });

  it('fits the narrowest bound viewport, so the span fits in every Gantt', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 800 });
    model.bind({ zone: 'UTC', tasks, viewportWidth: 500 });

    expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(500);
  });

  it('is readable before anything binds', () => {
    const model = new TimeScaleModel();
    expect(model.scale.zone).toBe('UTC');
    expect(model.scale.xForInstant(instant(MS.DAY))).toBeGreaterThan(0);
  });
});
