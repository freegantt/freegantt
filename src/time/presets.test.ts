import { describe, expect, it } from 'vitest';
import { presets, resolvePreset } from './presets.js';
import type { ShippedPresetId } from './presets.js';
import { InvalidPresetError, UnknownPresetError } from '../model/index.js';
import type { ViewPreset } from './scale.js';

describe('resolvePreset', () => {
  it('resolves every shipped id to its preset', () => {
    for (const id of Object.keys(presets) as ShippedPresetId[]) {
      expect(resolvePreset(id)).toBe(presets[id]);
    }
  });

  it('throws UnknownPresetError with code "unknown-preset" for an id outside the shipped set', () => {
    expect(() => resolvePreset('fortnight' as ShippedPresetId)).toThrow(UnknownPresetError);
    try {
      resolvePreset('fortnight' as ShippedPresetId);
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
    expect(resolvePreset(custom)).toBe(custom);
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
    expect(() => resolvePreset(tooNarrow)).toThrow(InvalidPresetError);
    try {
      resolvePreset(tooNarrow);
    } catch (error) {
      expect((error as InvalidPresetError).code).toBe('invalid-preset');
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
    expect(resolvePreset(exact)).toBe(exact);
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
    expect(() => resolvePreset(weekTickUnderDayBand)).toThrow(InvalidPresetError);
  });

  it('throws when tickIncrement is coarser than the finest header at the same unit (day x2 under day x1)', () => {
    const dayTimesTwoUnderDayBand: ViewPreset = {
      id: 'custom-day-x2-tick',
      tickUnit: 'day',
      tickIncrement: 2,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(() => resolvePreset(dayTimesTwoUnderDayBand)).toThrow(InvalidPresetError);
  });

  it('allows a tick step equal to the finest header', () => {
    const equalStep: ViewPreset = {
      id: 'custom-equal-step',
      tickUnit: 'day',
      tickIncrement: 1,
      headers: [{ unit: 'day', increment: 1, format: () => 'x' }],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(equalStep)).toBe(equalStep);
  });

  it('allows empty headers — there is no band to compare the tick step against', () => {
    const noHeaders: ViewPreset = {
      id: 'custom-no-headers',
      tickUnit: 'week',
      tickIncrement: 1,
      headers: [],
      preferredTickWidthPx: 40,
    };
    expect(resolvePreset(noHeaders)).toBe(noHeaders);
  });
});

describe('shipped presets', () => {
  it('multi-band presets carry headers coarsest-first', () => {
    expect(presets.dayAndWeek.headers.map((h) => h.unit)).toEqual(['week', 'day']);
    expect(presets.weekAndMonth.headers.map((h) => h.unit)).toEqual(['month', 'week']);
    expect(presets.monthAndYear.headers.map((h) => h.unit)).toEqual(['year', 'month']);
  });
});
