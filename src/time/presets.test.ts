import { describe, expect, it } from 'vitest';
import { presets, resolvePreset } from './presets.js';
import type { ShippedPresetId } from './presets.js';
import { InvalidPresetError, UnknownPresetError } from '../model/index.js';
import type { ViewPreset } from './scale.js';

describe('resolvePreset', () => {
  it('resolves every shipped id to its preset', () => {
    for (const id of Object.keys(presets) as ShippedPresetId[]) {
      expect(resolvePreset(id, 'test')).toBe(presets[id]);
    }
  });

  it('throws UnknownPresetError with code "unknown-preset" for an id outside the shipped set', () => {
    expect(() => resolvePreset('fortnight' as ShippedPresetId, 'test')).toThrow(UnknownPresetError);
    try {
      resolvePreset('fortnight' as ShippedPresetId, 'test');
    } catch (error) {
      expect((error as UnknownPresetError).code).toBe('unknown-preset');
    }
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

describe('shipped presets', () => {
  it('multi-band presets carry headers coarsest-first', () => {
    expect(presets.dayAndWeek.headers.map((h) => h.unit)).toEqual(['week', 'day']);
    expect(presets.weekAndMonth.headers.map((h) => h.unit)).toEqual(['month', 'week']);
    expect(presets.monthAndYear.headers.map((h) => h.unit)).toEqual(['year', 'month']);
  });
});
