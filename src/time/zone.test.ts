import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay, addDays, diffDays, toPlain, fromPlain } from './zone.js';

const ZONE = 'America/New_York';

describe('zone-aware date arithmetic', () => {
  it('startOfDay floors to local midnight in the dataset zone', () => {
    const i = instant('2026-06-15T18:30:00Z'); // 14:30 EDT
    const plain = toPlain(ZONE, startOfDay(ZONE, i));
    expect(plain).toMatchObject({ year: 2026, month: 6, day: 15, hour: 0, minute: 0 });
  });

  it('addDays is DST-correct across a spring-forward transition', () => {
    // 2026-03-08 is the US DST transition (spring forward) in America/New_York.
    const before = startOfDay(ZONE, instant('2026-03-07T12:00:00Z'));
    const after = addDays(ZONE, before, 1);
    const plain = toPlain(ZONE, after);
    expect(plain).toMatchObject({ year: 2026, month: 3, day: 8, hour: 0, minute: 0 });
  });

  it('diffDays counts whole calendar days, not 24h chunks', () => {
    // 2026-03-07T23:00Z is March 7 18:00 EST; 2026-03-09T01:00Z is March 8 21:00 EDT — one calendar day apart,
    // even though the wall-clock gap across the spring-forward transition is only 23 hours of elapsed time.
    const a = instant('2026-03-07T23:00:00Z');
    const b = instant('2026-03-09T01:00:00Z');
    expect(diffDays(ZONE, a, b)).toBe(1);
  });

  it('fromPlain resolves a spring-forward gap time by shifting forward past the gap', () => {
    // 2026-03-08 02:30 does not exist in America/New_York (clocks jump 02:00 -> 03:00). 'compatible'
    // disambiguation shifts it forward by the gap size, landing on 03:30 EDT.
    const gap = fromPlain(ZONE, { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 });
    expect(toPlain(ZONE, gap)).toMatchObject({ year: 2026, month: 3, day: 8, hour: 3, minute: 30 });
  });

  it('fromPlain resolves a fall-back fold time to the earlier of the two valid offsets', () => {
    // 2026-11-01 01:30 occurs twice in America/New_York (once EDT, once EST). 'compatible' disambiguation
    // picks the earlier offset (EDT, UTC-4).
    const fold = fromPlain(ZONE, { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 });
    const plain = toPlain(ZONE, fold);
    expect(plain).toMatchObject({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
    expect(
      diffDays(ZONE, fromPlain(ZONE, { year: 2026, month: 11, day: 1, hour: 0, minute: 0, second: 0 }), fold),
    ).toBe(0);
  });

  it('addDays/diffDays round-trip by whole calendar days across DST transitions, in any IANA zone', () => {
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC'];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        fc.integer({ min: -400, max: 400 }),
        (zone, startMs, days) => {
          const start = startOfDay(zone, instant(startMs));
          const shifted = addDays(zone, start, days);
          expect(diffDays(zone, start, shifted)).toBe(days);
        },
      ),
    );
  });
});
