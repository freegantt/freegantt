import { describe, expect, it } from 'vitest';
import { TimeScaleModel } from './time-scale-model.js';
import { dayPreset, instant, MS } from '../../time/index.js';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';

function entry(id: string, start: string, end: string): Entry {
  return {
    id: entryId(id),
    name: id,
    start: instant(start),
    end: instant(end),
  };
}

const entries: Entry[] = [
  entry('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z'),
  entry('t2', '2026-09-02T00:00:00Z', '2026-09-06T00:00:00Z'),
];

describe('TimeScaleModel', () => {
  const noop = () => {};

  it('resolves zone from the binding, never from the caller (D6)', () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'America/Chicago', entries, paneWidth: 800 }, noop);
    expect(model.scale.timeZone).toBe('America/Chicago');
  });

  it("fits the bound dataset's span into the measured viewport by default", () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);

    expect(model.scale.xForInstant(entries[0]!.start)).toBe(0);
    expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(800);
  });

  it('spans every bound dataset, so one scale can carry two Gantt instances (D9)', () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'UTC', entries: [entries[0]!], paneWidth: 800 }, noop);
    model.bind(
      {
        timeZone: 'UTC',
        entries: [entry('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
        paneWidth: 800,
      },
      noop,
    );

    // Neither caller computed the union: t1's start through w1's end is 9 days.
    expect(model.scale.range.start).toBe(instant('2026-09-01T00:00:00Z'));
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));
  });

  it('re-resolves when a Gantt binds or unbinds', () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'UTC', entries: [entries[0]!], paneWidth: 800 }, noop);
    const handle = model.bind(
      {
        timeZone: 'UTC',
        entries: [entry('w1', '2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z')],
        paneWidth: 800,
      },
      noop,
    );
    expect(model.scale.range.end).toBe(instant('2026-09-10T00:00:00Z'));

    handle.unbind();
    expect(model.scale.range.end).toBe(instant('2026-09-03T00:00:00Z'));
  });

  it('honours a pinned TimeSpan range instead of fitting the dataset', () => {
    const range = { start: instant('2026-01-01T00:00:00Z'), end: instant('2026-01-08T00:00:00Z') };
    const model = new TimeScaleModel({ range });
    model.bind({ timeZone: 'UTC', entries, paneWidth: 700 }, noop);

    expect(model.scale.range).toEqual(range);
    expect(model.scale.xForInstant(range.end)).toBeCloseTo(700);
  });

  it("falls back to the preset's own zoom when the host is unmeasured, not to a degenerate scale", () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'UTC', entries, paneWidth: 0 }, noop);

    // dayPreset states 24px per day tick; that is a scale, not a special case.
    expect(model.scale.xForInstant(instant('2026-09-02T00:00:00Z'))).toBeCloseTo(dayPreset.tickWidthPx);
    expect(model.scale.widthForDuration({ value: 1, unit: 'd' }, entries[0]!.start)).toBeCloseTo(
      dayPreset.tickWidthPx,
    );
  });

  it('resolves a zero-span or empty dataset through the preset rather than dividing by zero', () => {
    const empty = new TimeScaleModel();
    empty.bind({ timeZone: 'UTC', entries: [], paneWidth: 800 }, noop);
    expect(empty.scale.widthForDuration({ value: 1, unit: 'd' }, instant(0))).toBeCloseTo(
      dayPreset.tickWidthPx,
    );

    const zeroSpan = new TimeScaleModel();
    const at = entries[0]!.start;
    zeroSpan.bind({ timeZone: 'UTC', entries: [{ ...entries[0]!, end: at }], paneWidth: 800 }, noop);
    expect(zeroSpan.scale.widthForDuration({ value: 1, unit: 'd' }, at)).toBeCloseTo(dayPreset.tickWidthPx);
  });

  it('fits the narrowest bound viewport, so the span fits in every Gantt', () => {
    const model = new TimeScaleModel();
    model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
    model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, noop);

    expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(500);
  });

  it('is readable before anything binds', () => {
    const model = new TimeScaleModel();
    expect(model.scale.timeZone).toBe('UTC');
    expect(model.scale.xForInstant(instant(MS.DAY))).toBeGreaterThan(0);
  });

  describe('notify (#6, #22)', () => {
    it("runs a binding's own onChange on bind — that IS its first render (#22)", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      expect(calls).toBe(1);
    });

    it("never runs a binding's own onChange for its own unbind", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      // The caller is tearing itself down and has no reason to react to its own departure.
      handle.unbind();
      expect(calls).toBe(0);
    });

    it("runs an existing binding's onChange when another Gantt binds or unbinds", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      const other = model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, noop);
      expect(calls).toBe(1);

      other.unbind();
      expect(calls).toBe(2);
    });

    it('stops running onChange once unbound', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      handle.unbind();
      calls = 0;

      model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      expect(calls).toBe(0);
    });

    it("a width change that moves the narrowest pane runs every bound instance's onChange (D9)", () => {
      const model = new TimeScaleModel();
      let callsA = 0;
      let callsB = 0;
      const handleA = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => callsA++);
      model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, () => callsB++);
      callsA = 0;
      callsB = 0;

      // Narrowest of {800, 500} is 500; narrowing A to 300 moves it.
      handleA.setPaneWidth(300);
      expect(callsA).toBe(1);
      expect(callsB).toBe(1);
    });

    it('a setPaneWidth that does not move the narrowest pane notifies nobody (D-S1.5-4)', () => {
      const model = new TimeScaleModel();
      let callsA = 0;
      let callsB = 0;
      const handleA = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => callsA++);
      model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, () => callsB++);
      callsA = 0;
      callsB = 0;

      // Narrowest of {800, 500} is 500; widening A to 600 leaves the narrowest pane — and the
      // resolved scale — unchanged.
      handleA.setPaneWidth(600);
      expect(callsA).toBe(0);
      expect(callsB).toBe(0);
    });

    it('setPaneWidth invalidates and notifies when the width actually changes', () => {
      const model = new TimeScaleModel();
      const handle = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(800);

      handle.setPaneWidth(400);
      expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(400);
    });

    it('setPaneWidth is a no-op (no notify, no invalidation) when the width is unchanged', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      handle.setPaneWidth(800);
      expect(calls).toBe(0);
    });

    it('a binding driven to width 0 (display:none) is excluded from fitWidth, others keep theirs', () => {
      const model = new TimeScaleModel();
      const handleA = model.bind({ timeZone: 'UTC', entries, paneWidth: 300 }, noop);
      model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, noop);
      // Narrowest of {300, 500} is 300.
      expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(300);

      handleA.setPaneWidth(0);
      // A is unmeasured (display:none) and excluded from fitWidth; B's 500 is the only measured width left.
      expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(500);
    });
  });

  describe('batch', () => {
    it('delivers at most one notification for several writes', () => {
      const model = new TimeScaleModel();
      const a = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      const b = model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, noop);
      let calls = 0;
      model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, () => calls++);
      calls = 0;

      model.batch(() => {
        a.setPaneWidth(300);
        b.setPaneWidth(200);
      });
      expect(calls).toBe(1);
    });

    it('no observer sees an intermediate state mid-batch', () => {
      const model = new TimeScaleModel();
      const a = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      const seen: number[] = [];
      model.bind({ timeZone: 'UTC', entries, paneWidth: 500 }, () =>
        seen.push(model.scale.xForInstant(entries[1]!.end)),
      );
      seen.length = 0; // drop the notify from this binding's own bind() call

      model.batch(() => {
        a.setPaneWidth(300);
        a.setPaneWidth(100);
      });
      // Only the final, fully-applied state is ever observed.
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeCloseTo(100);
    });

    it('flushes in a finally so a throwing run still notifies and leaves the model usable', () => {
      const model = new TimeScaleModel();
      const a = model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      let calls = 0;
      model.bind({ timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      expect(() =>
        model.batch(() => {
          a.setPaneWidth(300);
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(calls).toBe(1);

      // Model still works after the throw — no stuck batch depth.
      calls = 0;
      a.setPaneWidth(600);
      expect(calls).toBe(1);
    });
  });

  it('mutating a ScaleBinding object after bind() cannot change the resolution', () => {
    const model = new TimeScaleModel();
    const binding = { timeZone: 'UTC', entries, paneWidth: 800 };
    model.bind(binding, noop);
    expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(800);

    // The model copied the binding at bind time; mutating the caller's object does nothing.
    (binding as { paneWidth: number }).paneWidth = 100;
    expect(model.scale.xForInstant(entries[1]!.end)).toBeCloseTo(800);
  });
});
