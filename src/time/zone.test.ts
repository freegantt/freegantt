import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay, addDays, diffDays, toCivil } from './zone.js';

const ZONE = 'America/New_York';

describe('zone-aware civil arithmetic', () => {
  it('startOfDay floors to local midnight in the project zone', () => {
    const i = instant('2026-06-15T18:30:00Z'); // 14:30 EDT
    const civil = toCivil(ZONE, startOfDay(ZONE, i));
    expect(civil).toMatchObject({ year: 2026, month: 6, day: 15, hour: 0, minute: 0 });
  });

  it('addDays is DST-correct across a spring-forward transition', () => {
    // 2026-03-08 is the US DST transition (spring forward) in America/New_York.
    const before = startOfDay(ZONE, instant('2026-03-07T12:00:00Z'));
    const after = addDays(ZONE, before, 1);
    const civil = toCivil(ZONE, after);
    expect(civil).toMatchObject({ year: 2026, month: 3, day: 8, hour: 0, minute: 0 });
  });

  it('diffDays counts whole civil days, not 24h chunks', () => {
    // 2026-03-07T23:00Z is March 7 18:00 EST; 2026-03-09T01:00Z is March 8 21:00 EDT — one civil day apart,
    // even though the wall-clock gap across the spring-forward transition is only 23 hours of elapsed time.
    const a = instant('2026-03-07T23:00:00Z');
    const b = instant('2026-03-09T01:00:00Z');
    expect(diffDays(ZONE, a, b)).toBe(1);
  });
});
