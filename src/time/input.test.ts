import { describe, expect, it } from 'vitest';
import { toEndInstant, toInstant } from './input.js';
import { InvalidInstantError } from '../model/index.js';

// America/Chicago is the zone the assertions below lean on: it observes DST, so a Plain time read
// through it proves the reading is zone-aware rather than a UTC parse that happens to agree. In 2026
// it springs forward on March 8 and falls back on November 1.
const CHICAGO = 'America/Chicago';

const utc = (iso: string): number => Date.parse(iso);

describe('toInstant()', () => {
  it('reads a date-only string as that day start in the zone', () => {
    expect(toInstant(CHICAGO, '2026-09-01')).toBe(utc('2026-09-01T05:00:00Z')); // CDT, UTC-5
    expect(toInstant(CHICAGO, '2026-01-15')).toBe(utc('2026-01-15T06:00:00Z')); // CST, UTC-6
  });

  it('reads the same date-only string differently in a different zone', () => {
    expect(toInstant('UTC', '2026-09-01')).toBe(utc('2026-09-01T00:00:00Z'));
    expect(toInstant('Asia/Tokyo', '2026-09-01')).toBe(utc('2026-08-31T15:00:00Z'));
  });

  it('reads a zoneless date-time as a wall-clock reading in the zone', () => {
    expect(toInstant(CHICAGO, '2026-09-01T14:30')).toBe(utc('2026-09-01T19:30:00Z'));
    expect(toInstant(CHICAGO, '2026-09-01T14:30:45')).toBe(utc('2026-09-01T19:30:45Z'));
    expect(toInstant(CHICAGO, '2026-09-01 14:30')).toBe(utc('2026-09-01T19:30:00Z'));
  });

  it('reads a fractional second on a zoneless date-time', () => {
    // No zone offset has ever shifted by a sub-second amount, so the fraction rides along unchanged.
    expect(toInstant(CHICAGO, '2026-09-01T14:30:45.5')).toBe(utc('2026-09-01T19:30:45.500Z'));
    expect(toInstant(CHICAGO, '2026-09-01T14:30:45.500')).toBe(utc('2026-09-01T19:30:45.500Z'));
    expect(toInstant(CHICAGO, '2026-09-01T14:30:45.007')).toBe(utc('2026-09-01T19:30:45.007Z'));
  });

  it('ignores the zone for a string carrying an explicit offset', () => {
    expect(toInstant(CHICAGO, '2026-09-01T00:00:00Z')).toBe(utc('2026-09-01T00:00:00Z'));
    expect(toInstant('Asia/Tokyo', '2026-09-01T00:00:00Z')).toBe(utc('2026-09-01T00:00:00Z'));
    expect(toInstant(CHICAGO, '2026-09-01T00:00:00+02:00')).toBe(utc('2026-09-01T00:00:00+02:00'));
  });

  it('passes a Date, a number, and an already-branded Instant through unchanged', () => {
    const date = new Date('2026-09-01T00:00:00Z');
    expect(toInstant(CHICAGO, date)).toBe(date.getTime());
    expect(toInstant(CHICAGO, 0)).toBe(0);
    expect(toInstant(CHICAGO, toInstant('UTC', '2026-09-01'))).toBe(utc('2026-09-01T00:00:00Z'));
  });

  it('resolves a Plain time inside a DST gap forward, and a folded one to the earlier offset', () => {
    // 02:30 on the spring-forward day does not exist; 'compatible' shifts it by the gap.
    expect(toInstant(CHICAGO, '2026-03-08T02:30')).toBe(utc('2026-03-08T08:30:00Z'));
    // 01:30 on the fall-back day happens twice; 'compatible' takes the first (CDT, UTC-5).
    expect(toInstant(CHICAGO, '2026-11-01T01:30')).toBe(utc('2026-11-01T06:30:00Z'));
  });

  it('rejects a date the calendar does not have rather than sliding it', () => {
    // Temporal constrains an out-of-range field instead of throwing, so a silent slide to Feb 28 is
    // the failure this guards.
    expect(() => toInstant(CHICAGO, '2026-02-31')).toThrow(InvalidInstantError);
    expect(() => toInstant(CHICAGO, '2026-13-01')).toThrow(InvalidInstantError);
    expect(() => toInstant(CHICAGO, '2026-09-00')).toThrow(InvalidInstantError);
  });

  it('rejects a value that names no instant', () => {
    expect(() => toInstant(CHICAGO, 'next tuesday')).toThrow(InvalidInstantError);
    expect(() => toInstant(CHICAGO, '')).toThrow(InvalidInstantError);
    expect(() => toInstant(CHICAGO, new Date('nope'))).toThrow(InvalidInstantError);
    expect(() => toInstant(CHICAGO, Number.NaN)).toThrow(InvalidInstantError);
  });
});

describe('toEndInstant()', () => {
  it("advances a date-only end by one day under 'inclusive'", () => {
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(toEndInstant('UTC', '2026-09-08', 'inclusive')).toBe(utc('2026-09-09T00:00:00Z'));
    expect(toEndInstant(CHICAGO, '2026-09-08', 'inclusive')).toBe(utc('2026-09-09T05:00:00Z'));
  });

  it("reads a date-only end literally under 'exclusive'", () => {
    expect(toEndInstant('UTC', '2026-09-08', 'exclusive')).toBe(utc('2026-09-08T00:00:00Z'));
  });

  it('advances across a DST boundary by a calendar day, not by 86,400,000 ms', () => {
    const end = toEndInstant(CHICAGO, '2026-03-07', 'inclusive');
    expect(end).toBe(utc('2026-03-08T06:00:00Z')); // the spring-forward day is 23 hours long
    expect(end - toInstant(CHICAGO, '2026-03-07')).toBe(24 * 60 * 60 * 1000);
  });

  it('leaves every input that already carries a time of day literal, under either rule', () => {
    for (const rule of ['inclusive', 'exclusive'] as const) {
      expect(toEndInstant(CHICAGO, '2026-09-08T00:00', rule)).toBe(utc('2026-09-08T05:00:00Z'));
      expect(toEndInstant(CHICAGO, '2026-09-08T00:00:00Z', rule)).toBe(utc('2026-09-08T00:00:00Z'));
      expect(toEndInstant(CHICAGO, 0, rule)).toBe(0);
      expect(toEndInstant(CHICAGO, new Date(1234), rule)).toBe(1234);
    }
  });
});
