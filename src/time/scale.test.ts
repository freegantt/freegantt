import { describe, expect, it } from 'vitest';
import { createTimeScale, pxPerMsForPreset } from './scale.js';
import { dayPreset } from './presets.js';
import { instant } from './instant.js';
import type { TickStep, ViewPreset } from './scale.js';

const timeZone = 'America/Chicago';
// Midnight in America/Chicago (CDT, UTC-5) on the day this range starts — already unit-aligned, so
// the whole-range ticks() call below matches the pre-S1.7 "one tick per day, starting at range.start"
// shape without alignment shifting the first cell earlier.
const rangeStart = instant('2026-09-01T05:00:00Z');
const rangeEnd = instant('2026-09-08T05:00:00Z'); // 7 days later, same wall-clock offset
const pxPerMs = 1 / (1000 * 60 * 60); // 1px per hour

const dayStep: TickStep = { unit: 'day', increment: 1 };

describe('createTimeScale', () => {
  it('round-trips xForInstant/instantForX', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    const probe = instant('2026-09-03T12:00:00Z');
    const x = scale.xForInstant(probe);
    expect(scale.instantForX(x)).toBe(probe);
    expect(scale.xForInstant(rangeStart)).toBe(0);
  });

  it('computes widthForDuration via zone-aware stepping, not raw ms', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    // 1 day at 1px/hour = 24px, regardless of DST — the fixture range has no transition here.
    expect(scale.widthForDuration({ value: 1, unit: 'day' }, rangeStart)).toBeCloseTo(24, 5);
  });

  it('exposes contentWidth as the full range extent at this zoom', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    expect(scale.contentWidth).toBeCloseTo(7 * 24, 5);
  });

  it('{ x: 0, width: contentWidth } reproduces one tick per day across the whole range', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    const ticks = scale.ticks(dayStep, { x: 0, width: scale.contentWidth });
    expect(ticks).toHaveLength(7);
    expect(ticks[0]?.instant).toBe(rangeStart);
    expect(ticks[0]?.x).toBe(0);
    expect(ticks[0]?.width).toBeCloseTo(24, 5);
    expect(ticks[1]?.x).toBeCloseTo(24, 5);
  });

  it('a span inside the range returns exactly the intersecting cells', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    // Day 3 starts at x=48 (2 days * 24px/day); a span covering days 3-4 only.
    const ticks = scale.ticks(dayStep, { x: 48, width: 48 });
    expect(ticks).toHaveLength(2);
    expect(ticks[0]?.x).toBeCloseTo(48, 5);
    expect(ticks[1]?.x).toBeCloseTo(72, 5);
  });

  it('emits the cell covering span.x even when its own x is left of the span', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    // x=10 falls inside day 1's cell [0, 24) — the cell starts left of the span but still intersects it.
    const ticks = scale.ticks(dayStep, { x: 10, width: 5 });
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.x).toBe(0);
    expect(ticks[0]?.width).toBeCloseTo(24, 5);
  });

  it('an empty span returns no ticks', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    expect(scale.ticks(dayStep, { x: 0, width: 0 })).toHaveLength(0);
  });

  it("Tick.width sums to the range across a DST transition — a day cell isn't always 24h of px", () => {
    // 2026-03-08 is the US spring-forward transition in America/Chicago: that day is 23h long.
    const zone = 'America/Chicago';
    const start = instant('2026-03-07T06:00:00Z'); // 2026-03-07T00:00 CST
    const end = instant('2026-03-10T05:00:00Z'); // 2026-03-10T00:00 CDT, 3 calendar days later
    const scale = createTimeScale({ timeZone: zone, range: { start, end }, pxPerMs });
    const ticks = scale.ticks(dayStep, { x: 0, width: scale.contentWidth });
    expect(ticks).toHaveLength(3);
    const totalWidth = ticks.reduce((sum, tick) => sum + tick.width, 0);
    expect(totalWidth).toBeCloseTo(scale.contentWidth, 5);
    // The spring-forward day (index 1, 2026-03-08) is 23 hours of px, not 24.
    expect(ticks[1]?.width).toBeCloseTo(23, 5);
  });

  it('rejects a step unit no stepper is registered for, rather than looping forever', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    // A TickStep is a plain object, so a caller can hand it a unit outside TimeUnit's own closed set
    // at runtime even though the type forbids it statically — hence the cast, exercising that boundary.
    const badStep: TickStep = { unit: 'q' as TickStep['unit'], increment: 1 };
    expect(() => scale.ticks(badStep, { x: 0, width: 100 })).toThrow(/unsupported unit/);
  });

  it('steps month and year units (#29 — a new zoom level is never a library edit)', () => {
    const scale = createTimeScale({ timeZone, range: { start: rangeStart, end: rangeEnd }, pxPerMs });
    expect(() =>
      scale.ticks({ unit: 'month', increment: 1 }, { x: 0, width: scale.contentWidth }),
    ).not.toThrow();
    expect(() =>
      scale.ticks({ unit: 'year', increment: 1 }, { x: 0, width: scale.contentWidth }),
    ).not.toThrow();
  });
});

describe('pxPerMsForPreset', () => {
  it('gives the zoom at which one tick occupies its tickWidthPx', () => {
    const scale = createTimeScale({
      timeZone,
      range: { start: rangeStart, end: rangeEnd },
      pxPerMs: pxPerMsForPreset(timeZone, dayPreset, rangeStart),
    });
    expect(scale.widthForDuration({ value: 1, unit: 'day' }, rangeStart)).toBeCloseTo(
      dayPreset.tickWidthPx,
      5,
    );
  });

  it('refuses a preset that does not advance rather than returning Infinity', () => {
    const stalledPreset: ViewPreset = { ...dayPreset, tickIncrement: 0 };
    expect(() => pxPerMsForPreset(timeZone, stalledPreset, rangeStart)).toThrow(/does not advance/);
  });
});
