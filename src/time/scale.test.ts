import { describe, expect, it } from 'vitest';
import { createTimeScale, pxPerMsForPreset } from './scale.js';
import { instant } from './instant.js';
import type { ViewPreset } from './scale.js';

const zone = 'America/Chicago';
const rangeStart = instant('2026-09-01T00:00:00Z');
const rangeEnd = instant('2026-09-08T00:00:00Z'); // 7 days
const pxPerMs = 1 / (1000 * 60 * 60); // 1px per hour

const dayPreset: ViewPreset = {
  id: 'day',
  tickUnit: 'd',
  tickIncrement: 1,
  headers: [{ unit: 'd', increment: 1, format: (i) => new Date(i).toISOString() }],
  tickWidthPx: 24,
};

describe('createTimeScale', () => {
  it('round-trips xForInstant/instantForX', () => {
    const scale = createTimeScale({ zone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    const probe = instant('2026-09-03T12:00:00Z');
    const x = scale.xForInstant(probe);
    expect(scale.instantForX(x)).toBe(probe);
    expect(scale.xForInstant(rangeStart)).toBe(0);
  });

  it('computes widthForDuration via zone-aware stepping, not raw ms', () => {
    const scale = createTimeScale({ zone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    // 1 day at 1px/hour = 24px, regardless of DST — the fixture range has no transition here.
    expect(scale.widthForDuration({ value: 1, unit: 'd' }, rangeStart)).toBeCloseTo(24, 5);
  });

  it('generates one tick per day across the range', () => {
    const scale = createTimeScale({ zone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    const ticks = scale.ticks(dayPreset);
    expect(ticks).toHaveLength(7);
    expect(ticks[0]?.instant).toBe(rangeStart);
    expect(ticks[0]?.x).toBe(0);
    expect(ticks[1]?.x).toBeCloseTo(24, 5);
  });

  it('rejects an unsupported preset unit rather than looping forever', () => {
    const scale = createTimeScale({ zone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    const badPreset: ViewPreset = { ...dayPreset, tickUnit: 'M', tickIncrement: 1 };
    expect(() => scale.ticks(badPreset)).toThrow(/unsupported unit/);
  });
});

describe('pxPerMsForPreset', () => {
  it('gives the zoom at which one tick occupies its tickWidthPx', () => {
    const scale = createTimeScale({
      zone,
      range: { start: rangeStart, end: rangeEnd },
      pxPerMs: pxPerMsForPreset(zone, dayPreset, rangeStart),
    });
    expect(scale.widthForDuration({ value: 1, unit: 'd' }, rangeStart)).toBeCloseTo(dayPreset.tickWidthPx, 5);
  });

  it('refuses a preset that does not advance rather than returning Infinity', () => {
    expect(() => pxPerMsForPreset(zone, { ...dayPreset, tickIncrement: 0 }, rangeStart)).toThrow(
      /does not advance/,
    );
  });
});
