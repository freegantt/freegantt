import { describe, expect, it } from 'vitest';
import { presets, resolvePreset } from './presets.js';
import type { ShippedPresetId } from './presets.js';
import { UnknownPresetError } from '../model/index.js';
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
      tickWidthPx: 40,
    };
    expect(resolvePreset(custom)).toBe(custom);
  });
});

describe('shipped presets', () => {
  it("every preset's tickUnit is no coarser than its finest (last) header", () => {
    const rank: Record<string, number> = {
      millisecond: 0,
      minute: 1,
      hour: 2,
      day: 3,
      week: 4,
      month: 5,
      year: 6,
    };
    for (const preset of Object.values(presets)) {
      const finestHeader = preset.headers[preset.headers.length - 1]!;
      expect(rank[preset.tickUnit]!).toBeLessThanOrEqual(rank[finestHeader.unit]!);
    }
  });

  it('multi-band presets carry headers coarsest-first', () => {
    expect(presets.dayAndWeek.headers.map((h) => h.unit)).toEqual(['week', 'day']);
    expect(presets.weekAndMonth.headers.map((h) => h.unit)).toEqual(['month', 'week']);
    expect(presets.monthAndYear.headers.map((h) => h.unit)).toEqual(['year', 'month']);
  });
});
