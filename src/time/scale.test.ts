import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTimeScale, pxPerMsForPreset, pxPerMsForUnitWidth } from './scale.js';
import { dayPreset } from './presets.js';
import { instant } from './instant.js';
import { snapInstant } from './snap.js';
import { startOf } from './zone.js';
import type { TickStep, ViewPreset } from './scale.js';
import type { TimeUnit } from '../model/index.js';

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
    expect(() => scale.ticks(badStep, { x: 0, width: 100 })).toThrow(/no time unit called/);
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

// #489: the anchor fix — one tick walk (`time/zone.ts`'s `tickFloor`) that `ticks()`, `snapInstant`
// and `nextTickBoundary` all read, so a gridline never drifts during a pan and a drag always settles
// on a boundary a gridline drew.
describe('ticks() anchoring (#489)', () => {
  const zones = ['America/Chicago', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'UTC'];
  // 2025-01-01..2027-01-01 spans every zone's own DST transitions in that window (Lord Howe's
  // included, a 30-minute-offset transition zone.test.ts's own property tests already lean on).
  const anyInstantMs = fc.integer({
    min: instant('2025-01-01T00:00:00Z'),
    max: instant('2027-01-01T00:00:00Z'),
  });

  it('ticks() from any two overlapping windows agree on every shared instant (the pan-shift #489 fixes)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.constantFrom<TimeUnit>('hour', 'day'),
        fc.integer({ min: 2, max: 6 }),
        anyInstantMs,
        fc.integer({ min: 0, max: 20 * 24 }), // window A's start, hours after rangeStart
        fc.integer({ min: 0, max: 20 * 24 }), // window B's start, hours after rangeStart
        fc.integer({ min: 6, max: 20 * 24 }), // window width, in hours
        (zone, unit, increment, rangeStartMs, aOffsetHours, bOffsetHours, widthHours) => {
          const hourPx = 4;
          const scale = createTimeScale({
            timeZone: zone,
            range: { start: instant(rangeStartMs), end: instant(rangeStartMs + 30 * 24 * 60 * 60 * 1000) },
            pxPerMs: hourPx / (60 * 60 * 1000),
          });
          const step: TickStep = { unit, increment };
          const spanA = { x: aOffsetHours * hourPx, width: widthHours * hourPx };
          const spanB = { x: bOffsetHours * hourPx, width: widthHours * hourPx };
          const overlapStart = Math.max(spanA.x, spanB.x);
          const overlapEnd = Math.min(spanA.x + spanA.width, spanB.x + spanB.width);
          if (overlapEnd <= overlapStart) return; // the two windows don't overlap — nothing to compare
          const inOverlap = (tick: { x: number; width: number }) =>
            tick.x < overlapEnd && tick.x + tick.width > overlapStart;
          const byX = (ticks: readonly { x: number; width: number; instant: number }[]) =>
            new Map(ticks.filter(inOverlap).map((tick) => [tick.x, tick.instant]));
          const ticksA = byX(scale.ticks(step, spanA));
          const ticksB = byX(scale.ticks(step, spanB));
          for (const [x, i] of ticksA) {
            if (ticksB.has(x)) expect(ticksB.get(x)).toBe(i);
          }
        },
      ),
    );
  });

  it('ticks({ increment: 1 }, ...) still starts at the window edge’s own unit floor (unchanged)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.constantFrom<TimeUnit>('minute', 'hour', 'day', 'week', 'month', 'year'),
        anyInstantMs,
        (zone, unit, atMs) => {
          const scale = createTimeScale({
            timeZone: zone,
            range: { start: instant(atMs), end: instant(atMs + 30 * 24 * 60 * 60 * 1000) },
            pxPerMs: 1,
          });
          const ticks = scale.ticks({ unit, increment: 1 }, { x: 0, width: 1 });
          expect(ticks[0]?.instant).toBe(startOf(zone, instant(atMs), unit));
        },
      ),
    );
  });

  it('snapInstant always answers an instant scale.ticks() itself draws, at any increment (one tick walk)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.constantFrom<TimeUnit>('minute', 'hour', 'day'),
        fc.integer({ min: 1, max: 6 }),
        anyInstantMs,
        (zone, unit, increment, atMs) => {
          const step = { unit, increment };
          const snapped = snapInstant(zone, instant(atMs), step);
          // A window wide enough either side of `at` to certainly hold both flanking boundaries: the
          // widest anchor container any of these units resets against is a week ('day' anchors to
          // 'week'), so two weeks either side is ample margin.
          const bufferMs = 14 * 24 * 60 * 60 * 1000;
          const scale = createTimeScale({
            timeZone: zone,
            range: { start: instant(atMs - bufferMs), end: instant(atMs + bufferMs) },
            pxPerMs: 1,
          });
          const drawn = new Set(scale.ticks(step, { x: 0, width: scale.contentWidth }).map((t) => t.instant));
          expect(drawn.has(snapped)).toBe(true);
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('pxPerMsForPreset', () => {
  it('gives the zoom at which one tick occupies its preferredTickWidthPx', () => {
    const scale = createTimeScale({
      timeZone,
      range: { start: rangeStart, end: rangeEnd },
      pxPerMs: pxPerMsForPreset(timeZone, dayPreset, rangeStart),
    });
    expect(scale.widthForDuration({ value: 1, unit: 'day' }, rangeStart)).toBeCloseTo(
      dayPreset.preferredTickWidthPx,
      5,
    );
  });

  it('refuses a preset that does not advance rather than returning Infinity', () => {
    const stalledPreset: ViewPreset = { ...dayPreset, tickIncrement: 0 };
    expect(() => pxPerMsForPreset(timeZone, stalledPreset, rangeStart)).toThrow(/does not advance/);
  });
});

describe('pxPerMsForUnitWidth', () => {
  const HOUR_MS = 1000 * 60 * 60;

  it('resolves a stated unit width against the calendar, not against a fixed constant (#15)', () => {
    // 2026-03-08 is the spring-forward day in Chicago: that local day lasts 23 hours, not 24. An
    // author writing the pixels-per-millisecond form by hand computes `widthPx / 86_400_000` and
    // paints this day 4% too wide. This is the whole reason the shorthand exists.
    const shortDay = instant('2026-03-08T06:00:00Z'); // local midnight, CST
    const resolved = pxPerMsForUnitWidth(timeZone, { unit: 'day', widthPx: 96 }, shortDay);

    expect(resolved).toBeCloseTo(96 / (23 * HOUR_MS), 12);
    expect(resolved).not.toBeCloseTo(96 / (24 * HOUR_MS), 12);
  });

  it('measures the same unit differently on a long day, a short day and an ordinary one', () => {
    const width = { unit: 'day', widthPx: 96 } as const;
    const longDay = pxPerMsForUnitWidth(timeZone, width, instant('2026-11-01T05:00:00Z')); // 25h
    const shortDay = pxPerMsForUnitWidth(timeZone, width, instant('2026-03-08T06:00:00Z')); // 23h
    const plainDay = pxPerMsForUnitWidth(timeZone, width, instant('2026-09-01T05:00:00Z')); // 24h

    // A longer day spreads the same 96 pixels over more milliseconds, so its density is lower.
    expect(longDay).toBeLessThan(plainDay);
    expect(plainDay).toBeLessThan(shortDay);
    expect(plainDay).toBeCloseTo(96 / (24 * HOUR_MS), 12);
  });

  it('defaults increment to 1, and divides a stated width across a longer step', () => {
    const at = instant('2026-09-01T05:00:00Z');
    expect(pxPerMsForUnitWidth(timeZone, { unit: 'day', widthPx: 14 }, at)).toBe(
      pxPerMsForUnitWidth(timeZone, { unit: 'day', increment: 1, widthPx: 14 }, at),
    );
    // "A fortnight is 90 pixels" is half the density of "a week is 90 pixels".
    const fortnight = pxPerMsForUnitWidth(timeZone, { unit: 'week', increment: 2, widthPx: 90 }, at);
    const week = pxPerMsForUnitWidth(timeZone, { unit: 'week', widthPx: 90 }, at);
    expect(fortnight).toBeCloseTo(week / 2, 12);
  });

  it('refuses a step that stands still rather than dividing by zero', () => {
    const at = instant('2026-09-01T05:00:00Z');
    expect(() => pxPerMsForUnitWidth(timeZone, { unit: 'day', increment: 0, widthPx: 14 }, at)).toThrow(
      /fit \{ unit: 'day' \} does not advance/,
    );
  });
});
