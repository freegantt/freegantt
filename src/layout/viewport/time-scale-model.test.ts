import { describe, expect, it } from 'vitest';
import { TimeScaleModel, bindTimeScale } from './time-scale-model.js';
import { dayPreset, instant, MS } from '../../time/index.js';
import { entryId, segmentId, UnknownPresetError } from '../../model/index.js';
import type { Entry } from '../../model/index.js';

function entry(id: string, start: string, end: string): Entry {
  const startInstant = instant(start);
  const endInstant = instant(end);
  return {
    id: entryId(id),
    name: id,
    start: startInstant,
    end: endInstant,
    kind: 'span',
    segments: [{ id: segmentId(`${id}-1`), start: startInstant, end: endInstant }],
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
    bindTimeScale(model, { timeZone: 'America/Chicago', entries, paneWidth: 800 }, noop);
    expect(model.scale.timeZone).toBe('America/Chicago');
  });

  it("fits the bound dataset's span into the measured viewport by default", () => {
    const model = new TimeScaleModel();
    bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);

    expect(model.scale.xForInstant(entries[0]!.start!)).toBe(0);
    expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(800);
  });

  it('spans every bound dataset, so one scale can carry two Gantt instances (D9)', () => {
    const model = new TimeScaleModel();
    bindTimeScale(model, { timeZone: 'UTC', entries: [entries[0]!], paneWidth: 800 }, noop);
    bindTimeScale(
      model,
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
    bindTimeScale(model, { timeZone: 'UTC', entries: [entries[0]!], paneWidth: 800 }, noop);
    const handle = bindTimeScale(
      model,
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
    bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 700 }, noop);

    expect(model.scale.range).toEqual(range);
    expect(model.scale.xForInstant(range.end)).toBeCloseTo(700);
  });

  it("falls back to the preset's own density when the container is unmeasured, not to a degenerate scale", () => {
    const model = new TimeScaleModel();
    bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 0 }, noop);

    // dayPreset's preferredTickWidthPx already clears its own density floor (header readability
    // follow-up), so an unmeasured container falls back to the preferred density directly.
    expect(model.scale.xForInstant(instant('2026-09-02T00:00:00Z'))).toBeCloseTo(
      dayPreset.preferredTickWidthPx,
    );
    expect(model.scale.widthForDuration({ value: 1, unit: 'day' }, entries[0]!.start!)).toBeCloseTo(
      dayPreset.preferredTickWidthPx,
    );
  });

  it('resolves a zero-span or empty dataset through the preset rather than dividing by zero', () => {
    const empty = new TimeScaleModel();
    bindTimeScale(empty, { timeZone: 'UTC', entries: [], paneWidth: 800 }, noop);
    expect(empty.scale.widthForDuration({ value: 1, unit: 'day' }, instant(0))).toBeCloseTo(
      dayPreset.preferredTickWidthPx,
    );

    const zeroSpan = new TimeScaleModel();
    const at = entries[0]!.start;
    bindTimeScale(
      zeroSpan,
      { timeZone: 'UTC', entries: [{ ...entries[0]!, end: at! }], paneWidth: 800 },
      noop,
    );
    expect(zeroSpan.scale.widthForDuration({ value: 1, unit: 'day' }, at!)).toBeCloseTo(
      dayPreset.preferredTickWidthPx,
    );
  });

  it('fits the narrowest bound viewport, so the span fits in every Gantt', () => {
    const model = new TimeScaleModel();
    bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
    bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, noop);

    expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(500);
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
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      expect(calls).toBe(1);
    });

    it("never runs a binding's own onChange for its own unbind", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      // The caller is tearing itself down and has no reason to react to its own departure.
      handle.unbind();
      expect(calls).toBe(0);
    });

    it("runs an existing binding's onChange when another Gantt binds or unbinds", () => {
      const model = new TimeScaleModel();
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      const other = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, noop);
      expect(calls).toBe(1);

      other.unbind();
      expect(calls).toBe(2);
    });

    it('stops running onChange once unbound', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      handle.unbind();
      calls = 0;

      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      expect(calls).toBe(0);
    });

    it("a width change that moves the narrowest pane runs every bound instance's onChange (D9)", () => {
      const model = new TimeScaleModel();
      let callsA = 0;
      let callsB = 0;
      const handleA = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => callsA++);
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, () => callsB++);
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
      const handleA = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => callsA++);
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, () => callsB++);
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
      const handle = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(800);

      // 600px over this fixture's 5-day span is 120px/day, still clear of dayPreset's density
      // floor (96px/day) — the resize itself is what's under test, not the floor.
      handle.setPaneWidth(600);
      expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(600);
    });

    it('setPaneWidth is a no-op (no notify, no invalidation) when the width is unchanged', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      const handle = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      handle.setPaneWidth(800);
      expect(calls).toBe(0);
    });

    it('a binding driven to width 0 (display:none) is excluded from fitWidth, others keep theirs', () => {
      const model = new TimeScaleModel();
      // 600/1000 over this fixture's 5-day span stay clear of dayPreset's density floor (96px/day).
      const handleA = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 600 }, noop);
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 1000 }, noop);
      // Narrowest of {600, 1000} is 600.
      expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(600);

      handleA.setPaneWidth(0);
      // A is unmeasured (display:none) and excluded from fitWidth; B's 1000 is the only measured width left.
      expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(1000);
    });
  });

  describe('batch', () => {
    it('delivers at most one notification for several writes', () => {
      const model = new TimeScaleModel();
      const a = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      const b = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, noop);
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 500 }, () => calls++);
      calls = 0;

      model.batch(() => {
        a.setPaneWidth(300);
        b.setPaneWidth(200);
      });
      expect(calls).toBe(1);
    });

    it('no observer sees an intermediate state mid-batch', () => {
      const model = new TimeScaleModel();
      const a = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      const seen: number[] = [];
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 700 }, () =>
        seen.push(model.scale.xForInstant(entries[1]!.end!)),
      );
      seen.length = 0; // drop the notify from this binding's own bind() call

      model.batch(() => {
        // Both widths stay above the S1.12 density floor for this fixture's 5-day span (96px/day,
        // i.e. 480px), so the resolved density tracks pane width exactly and isn't itself the
        // thing under test.
        a.setPaneWidth(700);
        a.setPaneWidth(600);
      });
      // Only the final, fully-applied state is ever observed.
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeCloseTo(600);
    });

    it('flushes in a finally so a throwing run still notifies and leaves the model usable', () => {
      const model = new TimeScaleModel();
      const a = bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
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

  describe('fit (S1.9, D-S1.9-2)', () => {
    it("'preset' ignores a measured pane width and uses the preset's own density", () => {
      const model = new TimeScaleModel({ fit: 'preset' });
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);

      // dayPreset's preferredTickWidthPx now already clears its own density floor (header
      // readability follow-up), so 'preset' fit resolves to the preferred density directly.
      expect(model.scale.widthForDuration({ value: 1, unit: 'day' }, entries[0]!.start!)).toBeCloseTo(
        dayPreset.preferredTickWidthPx,
      );
    });

    it('an explicit pxPerMs is read back exactly, ignoring both the pane width and the preset', () => {
      // Small enough to clear the floor and stay under S1.12's MAX_CONTENT_PX ceiling for this
      // fixture's span — a value that only exercises the "read back exactly" behaviour.
      const model = new TimeScaleModel({ fit: 0.01 });
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, noop);

      expect(model.fit).toBe(0.01);
      expect(model.scale.widthForDuration({ value: 1, unit: 'millisecond' }, entries[0]!.start!)).toBeCloseTo(
        0.01,
      );
    });

    it('a fit write notifies iff the resolved scale changed', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 800 }, () => calls++);
      calls = 0;

      model.fit = 0.5;
      expect(calls).toBe(1);

      calls = 0;
      model.fit = 0.5;
      expect(calls).toBe(0);
    });
  });

  describe('preset/range live setters (S1.9)', () => {
    it('preset = notifies iff the resolved scale changed, and is a no-op at the current value', () => {
      const model = new TimeScaleModel();
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 0 }, () => calls++);
      calls = 0;

      model.preset = 'week';
      expect(calls).toBe(1);
      expect(model.preset.id).toBe('week');

      calls = 0;
      model.preset = 'week';
      expect(calls).toBe(0);
    });

    it("preset = notifies even when pxPerMs is unaffected — a measured pane under 'pane' fit", () => {
      // Regression: 'pane' fit's pxPerMs = paneWidth / spanMs does not depend on the preset, so a
      // preset switch that leaves range/timeZone/pxPerMs all unchanged must still be visible to the
      // D-S1.5-4 equality check — otherwise a bound Gantt never re-renders its header bands (U1).
      const model = new TimeScaleModel();
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 700 }, () => calls++);
      calls = 0;

      model.preset = 'weekAndMonth';
      expect(calls).toBe(1);
      expect(model.preset.id).toBe('weekAndMonth');
    });

    it('preset = throws UnknownPresetError for an id outside the shipped set', () => {
      const model = new TimeScaleModel();
      expect(() => {
        model.preset = 'fortnight' as never;
      }).toThrow(UnknownPresetError);
    });

    it('range = notifies iff the resolved scale changed, and is a no-op at the current value', () => {
      const pinned = { start: instant('2026-01-01T00:00:00Z'), end: instant('2026-01-08T00:00:00Z') };
      const model = new TimeScaleModel({ range: pinned });
      let calls = 0;
      bindTimeScale(model, { timeZone: 'UTC', entries, paneWidth: 700 }, () => calls++);
      calls = 0;

      const next = { start: instant('2026-02-01T00:00:00Z'), end: instant('2026-02-08T00:00:00Z') };
      model.range = next;
      expect(calls).toBe(1);
      expect(model.range).toEqual(next);

      calls = 0;
      model.range = next;
      expect(calls).toBe(0);
    });
  });

  it('mutating a ScaleBinding object after bind() cannot change the resolution', () => {
    const model = new TimeScaleModel();
    const binding = { timeZone: 'UTC', entries, paneWidth: 800 };
    bindTimeScale(model, binding, noop);
    expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(800);

    // The model copied the binding at bind time; mutating the caller's object does nothing.
    (binding as { paneWidth: number }).paneWidth = 100;
    expect(model.scale.xForInstant(entries[1]!.end!)).toBeCloseTo(800);
  });
});
