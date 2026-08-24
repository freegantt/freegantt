import { describe, expect, it } from 'vitest';
import { TimeScaleModel } from './time-scale-model.js';
import { dayPreset, instant, MS } from '../../time/index.js';
import { taskId } from '../../model/index.js';
import type { Task } from '../../model/index.js';

function task(id: string, start: string, end: string): Task {
  return {
    id: taskId(id),
    name: id,
    start: instant(start),
    end: instant(end),
  };
}

const tasks: Task[] = [
  task('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z'),
  task('t2', '2026-09-02T00:00:00Z', '2026-09-06T00:00:00Z'),
];

describe('TimeScaleModel', () => {
  const noop = () => {};

  it('resolves zone from the binding, never from the caller (D6)', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'America/Chicago', tasks, viewportWidth: 800 }, noop);
    expect(model.scale.zone).toBe('America/Chicago');
  });

  it("fits the bound project's span into the measured viewport by default", () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, noop);

    expect(model.scale.xForInstant(tasks[0]!.start)).toBe(0);
    expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(800);
  });

  it('spans every bound project, so one scale can carry two Gantt instances (D9)', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks: [tasks[0]!], viewportWidth: 800 }, noop);
    model.bind(
      {
        zone: 'UTC',
        tasks: [task('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
        viewportWidth: 800,
      },
      noop,
    );

    // Neither caller computed the union: t1's start through w1's end is 9 days.
    expect(model.scale.range.start).toBe(instant('2026-09-01T00:00:00Z'));
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));
  });

  it('re-resolves when a Gantt binds or unbinds', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks: [tasks[0]!], viewportWidth: 800 }, noop);
    const handle = model.bind(
      {
        zone: 'UTC',
        tasks: [task('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
        viewportWidth: 800,
      },
      noop,
    );
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));

    handle.unbind();
    expect(model.scale.range.end).toBe(instant('2026-09-03T00:00:00Z'));
  });

  it('honours a pinned TimeSpan range instead of fitting the project', () => {
    const range = { start: instant('2026-01-01T00:00:00Z'), end: instant('2026-01-08T00:00:00Z') };
    const model = new TimeScaleModel({ range });
    model.bind({ zone: 'UTC', tasks, viewportWidth: 700 }, noop);

    expect(model.scale.range).toEqual(range);
    expect(model.scale.xForInstant(range.end)).toBeCloseTo(700);
  });

  it("falls back to the preset's own zoom when the host is unmeasured, not to a degenerate scale", () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 0 }, noop);

    // dayPreset states 24px per day tick; that is a scale, not a special case.
    expect(model.scale.xForInstant(instant('2026-09-02T00:00:00Z'))).toBeCloseTo(dayPreset.tickWidthPx);
    expect(model.scale.widthForDuration({ value: 1, unit: 'd' }, tasks[0]!.start)).toBeCloseTo(
      dayPreset.tickWidthPx,
    );
  });

  it('resolves a zero-span or empty project through the preset rather than dividing by zero', () => {
    const empty = new TimeScaleModel();
    empty.bind({ zone: 'UTC', tasks: [], viewportWidth: 800 }, noop);
    expect(empty.scale.widthForDuration({ value: 1, unit: 'd' }, instant(0))).toBeCloseTo(
      dayPreset.tickWidthPx,
    );

    const zeroSpan = new TimeScaleModel();
    const at = tasks[0]!.start;
    zeroSpan.bind({ zone: 'UTC', tasks: [{ ...tasks[0]!, end: at }], viewportWidth: 800 }, noop);
    expect(zeroSpan.scale.widthForDuration({ value: 1, unit: 'd' }, at)).toBeCloseTo(dayPreset.tickWidthPx);
  });

  it('fits the narrowest bound viewport, so the span fits in every Gantt', () => {
    const model = new TimeScaleModel();
    model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, noop);
    model.bind({ zone: 'UTC', tasks, viewportWidth: 500 }, noop);

    expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(500);
  });

  it('is readable before anything binds', () => {
    const model = new TimeScaleModel();
    expect(model.scale.zone).toBe('UTC');
    expect(model.scale.xForInstant(instant(MS.DAY))).toBeGreaterThan(0);
  });

  describe('notify (#6)', () => {
    it("never runs a binding's own onChange for its own bind or unbind", () => {
      const model = new TimeScaleModel();
      let calls = 0;

      // The binder is still constructing at bind time (mirrors GanttShell: bind() runs before the
      // render target exists) and renders itself explicitly, so its own onChange must stay silent —
      // on bind because it hasn't finished constructing, and on unbind because it's already gone.
      const handle = model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, () => calls++);
      expect(calls).toBe(0);

      handle.unbind();
      expect(calls).toBe(0);
    });

    it("runs an existing binding's onChange when another Gantt binds or unbinds", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, () => calls++);
      calls = 0;

      const other = model.bind({ zone: 'UTC', tasks, viewportWidth: 500 }, noop);
      expect(calls).toBe(1);

      other.unbind();
      expect(calls).toBe(2);
    });

    it('stops running onChange once unbound', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, () => calls++);
      handle.unbind();
      calls = 0;

      model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, noop);
      expect(calls).toBe(0);
    });

    it("a width change on one binding runs every bound instance's onChange, so all follow (D9)", () => {
      const model = new TimeScaleModel();
      let callsA = 0;
      let callsB = 0;
      const handleA = model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, () => callsA++);
      model.bind({ zone: 'UTC', tasks, viewportWidth: 500 }, () => callsB++);
      callsA = 0;
      callsB = 0;

      handleA.setViewportWidth(600);
      expect(callsA).toBe(1);
      expect(callsB).toBe(1);
    });

    it('setViewportWidth invalidates and notifies when the width actually changes', () => {
      const model = new TimeScaleModel();
      const handle = model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, noop);
      expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(800);

      handle.setViewportWidth(400);
      expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(400);
    });

    it('setViewportWidth is a no-op (no notify, no invalidation) when the width is unchanged', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = model.bind({ zone: 'UTC', tasks, viewportWidth: 800 }, () => calls++);
      calls = 0;

      handle.setViewportWidth(800);
      expect(calls).toBe(0);
    });

    it('a binding driven to width 0 (display:none) is excluded from fitWidth, others keep theirs', () => {
      const model = new TimeScaleModel();
      const handleA = model.bind({ zone: 'UTC', tasks, viewportWidth: 300 }, noop);
      model.bind({ zone: 'UTC', tasks, viewportWidth: 500 }, noop);
      // Narrowest of {300, 500} is 300.
      expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(300);

      handleA.setViewportWidth(0);
      // A is unmeasured (display:none) and excluded from fitWidth; B's 500 is the only measured width left.
      expect(model.scale.xForInstant(tasks[1]!.end)).toBeCloseTo(500);
    });
  });
});
