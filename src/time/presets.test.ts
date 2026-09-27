import { describe, expect, it } from 'vitest';
import { presets, resolvePreset, ZOOM_PRESETS } from './presets.js';
import type { ShippedPresetId } from './presets.js';
import { InvalidPresetError, UnknownPresetError } from '../model/index.js';
import { createTimeScale } from './scale.js';
import type { ViewPreset } from './scale.js';
import { resolveDateFormat } from './format.js';
import { instant } from './instant.js';
import { toPlain } from './zone.js';
import type { Instant } from '../model/index.js';

describe('resolvePreset', () => {
  it('resolves every shipped id to its preset', () => {
    for (const id of Object.keys(presets) as ShippedPresetId[]) {
      expect(resolvePreset(id, 'test')).toBe(presets[id]);
    }
  });

  it('throws UnknownPresetError with code "unknown-preset" for an id outside the shipped set', () => {
    expect(() => resolvePreset('fortnight', 'test')).toThrow(UnknownPresetError);
    try {
      resolvePreset('fortnight', 'test');
    } catch (error) {
      expect((error as UnknownPresetError).code).toBe('unknown-preset');
    }
  });

  it('lists only the shipped ids when no ladder was searched (#489)', () => {
    try {
      resolvePreset('fortnight', 'test');
      expect.unreachable();
    } catch (error) {
      const unknown = error as UnknownPresetError;
      expect(unknown.ladderIds).toEqual([]);
      expect(unknown.shippedIds).toEqual(Object.keys(presets));
      expect(unknown.operation).toBe('test');
      expect(unknown.message).not.toMatch(/zoomPresets/);
    }
  });

  // #489 owner ruling: `gantt.preset` also finds a preset in this Gantt's own `zoomPresets`, not
  // only the shipped table — a custom rung then resolves the same way a shipped id does.
  describe('a ladder is passed (the gantt.preset door)', () => {
    const sixHour: ViewPreset = {
      id: 'sixHour',
      tickUnit: 'hour',
      tickIncrement: 6,
      headers: [{ unit: 'hour', increment: 6, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    const ladder = [presets.hour, sixHour, presets.day];

    it('resolves a custom id found only in the ladder', () => {
      expect(resolvePreset('sixHour', 'gantt.preset', ladder)).toBe(sixHour);
    });

    it('resolves a shipped id found in the ladder too', () => {
      expect(resolvePreset('day', 'gantt.preset', ladder)).toBe(presets.day);
    });

    it('falls back to the shipped table for an id the ladder does not carry', () => {
      expect(resolvePreset('week', 'gantt.preset', ladder)).toBe(presets.week);
    });

    it('the ladder wins over the shipped table for a shared id (#489 owner ruling)', () => {
      const customHour: ViewPreset = { ...presets.hour, preferredTickWidthPx: 999 };
      expect(resolvePreset('hour', 'gantt.preset', [customHour])).toBe(customHour);
    });

    it('names both tables it checked when the id is in neither', () => {
      try {
        resolvePreset('fortnight', 'gantt.preset', ladder);
        expect.unreachable();
      } catch (error) {
        const unknown = error as UnknownPresetError;
        expect(unknown.ladderIds).toEqual(['hour', 'sixHour', 'day']);
        expect(unknown.shippedIds).toEqual(Object.keys(presets));
        expect(unknown.operation).toBe('gantt.preset');
        expect(unknown.message).toMatch(/zoomPresets/);
      }
    });
  });

  it('passes a ViewPreset object through unchanged — a custom preset is never a library edit', () => {
    const custom: ViewPreset = {
      id: 'custom',
      tickUnit: 'hour',
      tickIncrement: 6,
      headers: [{ unit: 'hour', increment: 6, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(custom, 'test')).toBe(custom);
  });

  it('throws InvalidPresetError with code "invalid-preset" when a custom preset\'s minTickWidthPx exceeds its preferredTickWidthPx', () => {
    const tooNarrow: ViewPreset = {
      id: 'custom-too-narrow',
      tickUnit: 'hour',
      tickIncrement: 6,
      headers: [{ unit: 'hour', increment: 6, format: () => 'x' }],
      preferredTickWidthPx: 24,
      minTickWidthPx: 32,
    };
    expect(() => resolvePreset(tooNarrow, 'test')).toThrow(InvalidPresetError);
    try {
      resolvePreset(tooNarrow, 'test');
    } catch (error) {
      expect((error as InvalidPresetError).code).toBe('invalid-preset');
    }
  });

  // C3/#482 review: `resolvePreset` is one function reached from three doors — its own `operation`
  // must be the message, not a hardcoded `gantt.preset` that names the wrong door for a caller that
  // reached it some other way (`InvertedSpanError` already takes `operation` for the same reason).
  it("names the caller's own operation in the thrown message and in .operation, not a hardcoded door", () => {
    const tooNarrow: ViewPreset = {
      id: 'custom-too-narrow',
      tickUnit: 'hour',
      tickIncrement: 6,
      headers: [{ unit: 'hour', increment: 6, format: () => 'x' }],
      preferredTickWidthPx: 24,
      minTickWidthPx: 32,
    };
    try {
      resolvePreset(tooNarrow, 'gantt.zoomPresets');
      expect.unreachable('expected InvalidPresetError');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPresetError);
      expect((error as InvalidPresetError).operation).toBe('gantt.zoomPresets');
      expect((error as InvalidPresetError).message).toMatch(/^gantt\.zoomPresets: the preset/);
      expect((error as InvalidPresetError).message).not.toMatch(/^gantt\.preset:/);
    }
  });

  it('allows a custom preset whose minTickWidthPx equals its preferredTickWidthPx', () => {
    const exact: ViewPreset = {
      id: 'custom-exact',
      tickUnit: 'hour',
      tickIncrement: 6,
      headers: [{ unit: 'hour', increment: 6, format: () => 'x' }],
      preferredTickWidthPx: 32,
      minTickWidthPx: 32,
    };
    expect(resolvePreset(exact, 'test')).toBe(exact);
  });
});

describe('validatePresetTickWidths (via freezePreset)', () => {
  it('every shipped preset has minTickWidthPx <= preferredTickWidthPx', () => {
    for (const preset of Object.values(presets)) {
      if (preset.minTickWidthPx !== undefined) {
        expect(preset.minTickWidthPx).toBeLessThanOrEqual(preset.preferredTickWidthPx);
      }
    }
  });
});

describe('validatePresetTickStep (via resolvePreset)', () => {
  it('throws when tickUnit is coarser than the finest header (week tick under a day band)', () => {
    const weekTickUnderDayBand: ViewPreset = {
      id: 'custom-week-tick',
      tickUnit: 'week',
      tickIncrement: 1,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(weekTickUnderDayBand, 'test')).toThrow(InvalidPresetError);
  });

  it('throws when tickIncrement is coarser than the finest header at the same unit (day x2 under day x1)', () => {
    const dayTimesTwoUnderDayBand: ViewPreset = {
      id: 'custom-day-x2-tick',
      tickUnit: 'day',
      tickIncrement: 2,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(dayTimesTwoUnderDayBand, 'test')).toThrow(InvalidPresetError);
  });

  it('allows a tick step equal to the finest header', () => {
    const equalStep: ViewPreset = {
      id: 'custom-equal-step',
      tickUnit: 'day',
      tickIncrement: 1,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(equalStep, 'test')).toBe(equalStep);
  });

  it('allows a tick step finer than the finest header (hour tick under a day band)', () => {
    const hourTickUnderDayBand: ViewPreset = {
      id: 'custom-hour-tick',
      tickUnit: 'hour',
      tickIncrement: 1,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(hourTickUnderDayBand, 'test')).toBe(hourTickUnderDayBand);
  });

  // T1/#481: `isCoarserThan` answered calendar nesting, not duration, so a coarser tick in a
  // different unit than its header slipped through. `isCoarserStep` compares real span instead.
  it.each([
    [
      'a 2-day grid under a day header',
      { tickUnit: 'hour', tickIncrement: 48 } as const,
      { unit: 'day', increment: 1 } as const,
    ],
    [
      '10-day steps under a weekly header',
      { tickUnit: 'day', tickIncrement: 10 } as const,
      { unit: 'week', increment: 1 } as const,
    ],
    [
      'a 1440-minute tick under an hour header',
      { tickUnit: 'minute', tickIncrement: 1440 } as const,
      { unit: 'hour', increment: 1 } as const,
    ],
  ])('throws for %s, coarser than its header by real span, not just by unit', (_label, tick, header) => {
    const preset: ViewPreset = {
      id: 'custom-cross-unit-coarser',
      tickUnit: tick.tickUnit,
      tickIncrement: tick.tickIncrement,
      headers: [{ ...header, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(preset, 'test')).toThrow(InvalidPresetError);
    try {
      resolvePreset(preset, 'test');
    } catch (error) {
      expect((error as InvalidPresetError).rule).toBe('tick-step');
    }
  });

  // T1/#481: the same guard over-refused a finer-or-equal tick whenever the header band carried a
  // large increment, because it only compared increments when the units matched.
  it.each([
    ['a fortnight-column header', { unit: 'day', increment: 14 } as const],
    ['a span-equal week-column header', { unit: 'day', increment: 7 } as const],
  ])('allows a week tick under %s, no coarser once the header increment is counted', (_label, header) => {
    const preset: ViewPreset = {
      id: 'custom-cross-unit-finer',
      tickUnit: 'week',
      tickIncrement: 1,
      headers: [{ ...header, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(preset, 'test')).toBe(preset);
  });

  it('allows empty headers — there is no band to compare the tick step against', () => {
    const noHeaders: ViewPreset = {
      id: 'custom-no-headers',
      tickUnit: 'week',
      tickIncrement: 1,
      headers: [],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(noHeaders, 'test')).toBe(noHeaders);
  });
});

// NEW-2/#481 review: an increment that cannot advance a step (0, negative, or fractional) used to
// resolve clean here and crash much later, as an untyped RangeError from time/scale.ts, far from the
// preset that caused it.
describe('validatePresetTickIncrement (via resolvePreset)', () => {
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('throws with rule "tick-increment" for a %s tickIncrement', (_label, tickIncrement) => {
    const preset: ViewPreset = {
      id: 'custom-bad-tick-increment',
      tickUnit: 'day',
      tickIncrement,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(preset, 'test')).toThrow(InvalidPresetError);
    try {
      resolvePreset(preset, 'test');
    } catch (error) {
      expect((error as InvalidPresetError).rule).toBe('tick-increment');
    }
  });

  it('throws with rule "tick-increment" for a header band whose own increment cannot advance', () => {
    const preset: ViewPreset = {
      id: 'custom-bad-header-increment',
      tickUnit: 'day',
      tickIncrement: 1,
      headers: [{ unit: 'week', increment: 0, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(preset, 'test')).toThrow(InvalidPresetError);
    try {
      resolvePreset(preset, 'test');
    } catch (error) {
      expect((error as InvalidPresetError).rule).toBe('tick-increment');
    }
  });

  it('allows a tickIncrement and header increments that are all positive whole numbers', () => {
    const preset: ViewPreset = {
      id: 'custom-good-increments',
      tickUnit: 'day',
      tickIncrement: 1,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(preset, 'test')).toBe(preset);
  });
});

describe('shipped presets', () => {
  it('multi-band presets carry headers coarsest-first', () => {
    expect(presets.dayAndWeek.headers.map((h) => h.unit)).toEqual(['week', 'day']);
    expect(presets.weekAndMonth.headers.map((h) => h.unit)).toEqual(['month', 'week']);
    expect(presets.monthAndYear.headers.map((h) => h.unit)).toEqual(['year', 'month']);
  });
});

// #101 items 1-2: sub-hour rungs and the day-letter band, shipped as named presets a consumer can
// reach by id, outside the default `ZOOM_PRESETS` ladder — none of these change default zoom
// behaviour.
describe('#101 new shipped presets', () => {
  const timeZone = 'UTC';

  it('minute/fifteenMinute/sixHour stay off the default zoom ladder', () => {
    const ladderIds = ZOOM_PRESETS.map((preset) => preset.id);
    expect(ladderIds).not.toContain('minute');
    expect(ladderIds).not.toContain('fifteenMinute');
    expect(ladderIds).not.toContain('sixHour');
    expect(ladderIds).not.toContain('dayLetterAndWeek');
  });

  it('minutePreset ticks once per minute', () => {
    const range = { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-01T00:10:00Z') };
    const scale = createTimeScale({ timeZone, range, pxPerMs: 1 });
    const ticks = scale.ticks(
      { unit: presets.minute.tickUnit, increment: presets.minute.tickIncrement },
      { x: 0, width: scale.contentWidth },
    );
    expect(ticks).toHaveLength(10);
    expect(ticks[1]?.instant).toBe(instant('2026-09-01T00:01:00Z'));
  });

  it('fifteenMinutePreset ticks align to the hour, every 15 minutes', () => {
    const range = { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-01T01:00:00Z') };
    const scale = createTimeScale({ timeZone, range, pxPerMs: 1 });
    const ticks = scale.ticks(
      { unit: presets.fifteenMinute.tickUnit, increment: presets.fifteenMinute.tickIncrement },
      { x: 0, width: scale.contentWidth },
    );
    expect(ticks.map((t) => t.instant)).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T00:15:00Z'),
      instant('2026-09-01T00:30:00Z'),
      instant('2026-09-01T00:45:00Z'),
    ]);
  });

  it('sixHourPreset ticks four times a day', () => {
    const range = { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-02T00:00:00Z') };
    const scale = createTimeScale({ timeZone, range, pxPerMs: 1 });
    const ticks = scale.ticks(
      { unit: presets.sixHour.tickUnit, increment: presets.sixHour.tickIncrement },
      { x: 0, width: scale.contentWidth },
    );
    expect(ticks.map((t) => t.instant)).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T06:00:00Z'),
      instant('2026-09-01T12:00:00Z'),
      instant('2026-09-01T18:00:00Z'),
    ]);
  });

  // #489: the anchor fix — a stepped tick counts from the calendar (`tickFloor`), not from wherever
  // the visible window's own left edge happens to sit, so two windows that start at different
  // moments still draw the same boundaries.
  it('fifteenMinutePreset ticks land on :00/:15/:30/:45 no matter where the window starts', () => {
    const aligned = createTimeScale({
      timeZone,
      range: { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-01T01:00:00Z') },
      pxPerMs: 1,
    });
    // A window starting mid-step (7 minutes into the hour) — the same calendar hour, a different
    // left edge.
    const shifted = createTimeScale({
      timeZone,
      range: { start: instant('2026-09-01T00:07:00Z'), end: instant('2026-09-01T01:00:00Z') },
      pxPerMs: 1,
    });
    const step = { unit: presets.fifteenMinute.tickUnit, increment: presets.fifteenMinute.tickIncrement };
    const alignedTicks = aligned.ticks(step, { x: 0, width: aligned.contentWidth }).map((t) => t.instant);
    const shiftedTicks = shifted.ticks(step, { x: 0, width: shifted.contentWidth }).map((t) => t.instant);
    expect(alignedTicks).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T00:15:00Z'),
      instant('2026-09-01T00:30:00Z'),
      instant('2026-09-01T00:45:00Z'),
    ]);
    // The shifted window draws the same calendar boundaries — the tick that covers its own left
    // edge (:00, drawn partial) then :15/:30/:45 — none of them drift to :07, :22, :37, :52.
    expect(shiftedTicks).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T00:15:00Z'),
      instant('2026-09-01T00:30:00Z'),
      instant('2026-09-01T00:45:00Z'),
    ]);
  });

  it('sixHourPreset ticks land on 00/06/12/18 no matter where the window starts', () => {
    const aligned = createTimeScale({
      timeZone,
      range: { start: instant('2026-09-01T00:00:00Z'), end: instant('2026-09-02T00:00:00Z') },
      pxPerMs: 1,
    });
    // A window starting mid-step (two hours into the first six-hour band) — the same calendar day,
    // a different left edge.
    const shifted = createTimeScale({
      timeZone,
      range: { start: instant('2026-09-01T02:00:00Z'), end: instant('2026-09-02T00:00:00Z') },
      pxPerMs: 1,
    });
    const step = { unit: presets.sixHour.tickUnit, increment: presets.sixHour.tickIncrement };
    const alignedTicks = aligned.ticks(step, { x: 0, width: aligned.contentWidth }).map((t) => t.instant);
    const shiftedTicks = shifted.ticks(step, { x: 0, width: shifted.contentWidth }).map((t) => t.instant);
    expect(alignedTicks).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T06:00:00Z'),
      instant('2026-09-01T12:00:00Z'),
      instant('2026-09-01T18:00:00Z'),
    ]);
    // The shifted window draws the same calendar boundaries — the tick that covers its own left
    // edge (00:00, drawn partial) then 06:00/12:00/18:00 — none of them drift to 02:00, 08:00,
    // 14:00, 20:00.
    expect(shiftedTicks).toEqual([
      instant('2026-09-01T00:00:00Z'),
      instant('2026-09-01T06:00:00Z'),
      instant('2026-09-01T12:00:00Z'),
      instant('2026-09-01T18:00:00Z'),
    ]);
  });

  it('dayLetterAndWeekPreset carries its week band coarsest-first, day-letter finest', () => {
    expect(presets.dayLetterAndWeek.headers.map((h) => h.unit)).toEqual(['week', 'day']);
  });

  it('dayLetterAndWeekPreset ticks once per day, one letter per label (format-only, no new TimeUnit)', () => {
    const range = { start: instant('2026-09-06T00:00:00Z'), end: instant('2026-09-13T00:00:00Z') }; // a Sunday through the next
    const scale = createTimeScale({ timeZone, range, pxPerMs: 1 });
    const dayBand = presets.dayLetterAndWeek.headers[1]!;
    const ticks = scale.ticks(
      { unit: dayBand.unit, increment: dayBand.increment },
      { x: 0, width: scale.contentWidth },
    );
    expect(ticks).toHaveLength(7);
    const label = resolveDateFormat(dayBand.format, { timeZone, locale: 'en-US' });
    // 2026-09-06 is a Sunday: S M T W T F S.
    expect(ticks.map((t) => label(t.instant))).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});

describe('quarterAndYear preset', () => {
  const quarterBand = presets.quarterAndYear.headers[1]!;
  const quarterStep = { unit: quarterBand.unit, increment: quarterBand.increment };

  function quarterTicks(timeZone: string, start: string): readonly Instant[] {
    const scale = createTimeScale({
      timeZone,
      range: { start: instant(start), end: instant('2027-12-01T00:00:00Z') },
      pxPerMs: 1e-9,
    });
    return scale.ticks(quarterStep, { x: 0, width: scale.contentWidth }).map((tick) => tick.instant);
  }

  it('sits on the default zoom ladder between monthAndYear and year', () => {
    const ladderIds = ZOOM_PRESETS.map((preset) => preset.id);
    const quarterRung = ladderIds.indexOf('quarterAndYear');
    expect(ladderIds[quarterRung - 1]).toBe('monthAndYear');
    expect(ladderIds[quarterRung + 1]).toBe('year');
  });

  it('carries its year band coarsest-first, quarters finest', () => {
    expect(presets.quarterAndYear.headers.map((h) => h.unit)).toEqual(['year', 'month']);
  });

  // A window that opens mid-quarter still draws calendar quarters, never a 3-month walk from its
  // left edge. Each zone below has a clock change inside the range.
  it.each(['UTC', 'America/New_York', 'Australia/Sydney'])(
    'ticks land on Jan 1, Apr 1, Jul 1 and Oct 1 at local midnight in %s',
    (timeZone) => {
      for (const start of ['2026-01-01T00:00:00Z', '2026-02-17T00:00:00Z', '2026-05-31T13:00:00Z']) {
        const starts = quarterTicks(timeZone, start).map((at) => {
          const { month, day, hour, minute } = toPlain(timeZone, at);
          return { month, day, hour, minute };
        });
        expect(starts.length).toBeGreaterThanOrEqual(7);
        for (const quarterStart of starts) {
          expect([1, 4, 7, 10]).toContain(quarterStart.month);
          expect(quarterStart).toMatchObject({ day: 1, hour: 0, minute: 0 });
        }
      }
    },
  );

  it('labels the four quarters of a year in order', () => {
    const timeZone = 'America/New_York';
    const label = resolveDateFormat(quarterBand.format, { timeZone, locale: 'en-US' });
    const labels = quarterTicks(timeZone, '2026-01-01T05:00:00Z').map((at) => label(at));
    expect(labels.slice(0, 5)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q1']);
  });
});
