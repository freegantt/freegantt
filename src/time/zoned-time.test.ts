import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { createZonedTime } from './zoned-time.js';

// America/Chicago: springs forward on 2026-03-08, falls back on 2026-11-01.
const CHICAGO = 'America/Chicago';

describe('createZonedTime()', () => {
  it('step() forwards to the same zone-aware stepping zone.ts already has, default increment 1', () => {
    const time = createZonedTime(CHICAGO);
    const start = time.startOfDay(instant('2026-06-15T12:00:00Z'));
    expect(time.step(start, 'day')).toBe(time.addDays(start, 1));
    expect(time.step(start, 'day', 3)).toBe(time.addDays(start, 3));
    expect(time.step(start, 'hour', -1)).toBeLessThan(start);
  });

  it('each() walks every unit boundary in the span, matching eachDay for "day"', () => {
    const time = createZonedTime(CHICAGO);
    const start = time.startOfDay(instant('2026-06-15T12:00:00Z'));
    const end = time.addDays(start, 5);
    expect(time.each({ start, end }, 'day')).toEqual(time.eachDay({ start, end }));
  });

  it('each("hour") walks a 23-hour spring-forward day without skipping or duplicating an hour', () => {
    const time = createZonedTime(CHICAGO);
    const start = time.startOfDay(instant('2026-03-08T06:00:00Z'));
    const end = time.addDays(start, 1);
    const hours = time.each({ start, end }, 'hour');
    expect(hours).toHaveLength(23);
  });

  it('each("hour") walks a 25-hour fall-back day without skipping or duplicating an hour', () => {
    const time = createZonedTime(CHICAGO);
    const start = time.startOfDay(instant('2026-11-01T05:00:00Z'));
    const end = time.addDays(start, 1);
    const hours = time.each({ start, end }, 'hour');
    expect(hours).toHaveLength(25);
  });

  it('toInstant() reads a consumer-written value in this zone, the same as time/toInstant', () => {
    const time = createZonedTime(CHICAGO);
    expect(time.toInstant('2026-09-01')).toBe(instant('2026-09-01T05:00:00Z')); // CDT, UTC-5
    expect(time.toInstant(0)).toBe(0);
  });

  it("toEndInstant() reads a date-only end inclusively by default — '2026-07-15' covers the 15th", () => {
    const time = createZonedTime(CHICAGO);
    expect(time.toEndInstant('2026-07-15')).toBe(instant('2026-07-16T05:00:00Z'));
  });

  it("toEndInstant() reads a date-only end literally under 'exclusive'", () => {
    const time = createZonedTime(CHICAGO);
    expect(time.toEndInstant('2026-07-15', 'exclusive')).toBe(instant('2026-07-15T05:00:00Z'));
  });
});
