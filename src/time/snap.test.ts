import { describe, expect, it } from 'vitest';
import { InvalidSnapIncrementError } from '../model/index.js';
import { instant } from './instant.js';
import { snapInstant, stepsBetween } from './snap.js';

const ZONE = 'America/New_York';

describe('snapInstant', () => {
  it('rounds down to the nearer whole-unit boundary', () => {
    // 10:00 is 10 minutes into the [10:00, 11:00) hour boundary either side of it — 10:10 is
    // closer to 10:00 than to 11:00.
    const at = instant('2026-06-15T14:10:00Z'); // 10:10 EDT
    const snapped = snapInstant(ZONE, at, { unit: 'hour', increment: 1 });
    expect(snapped).toBe(instant('2026-06-15T14:00:00Z'));
  });

  it('rounds up to the nearer whole-unit boundary', () => {
    const at = instant('2026-06-15T14:50:00Z'); // 10:50 EDT
    const snapped = snapInstant(ZONE, at, { unit: 'hour', increment: 1 });
    expect(snapped).toBe(instant('2026-06-15T15:00:00Z'));
  });

  it("'none' returns the input unchanged", () => {
    const at = instant('2026-06-15T14:37:23Z');
    expect(snapInstant(ZONE, at, 'none')).toBe(at);
  });

  it('a larger increment pushes the upper boundary farther away, changing which side wins', () => {
    // 14:40 is 40min past the 14:00 hour floor either way, but the upper boundary moves with the
    // increment: a 1-hour snap's upper (15:00) is nearer, a 3-hour snap's upper (17:00) is not.
    const at = instant('2026-06-15T18:40:00Z'); // 14:40 EDT
    expect(snapInstant(ZONE, at, { unit: 'hour', increment: 1 })).toBe(instant('2026-06-15T19:00:00Z'));
    expect(snapInstant(ZONE, at, { unit: 'hour', increment: 3 })).toBe(instant('2026-06-15T18:00:00Z'));
  });

  it('rejects a zero increment instead of looping forever (#201)', () => {
    const at = instant('2026-06-15T14:10:00Z');
    expect(() => snapInstant(ZONE, at, { unit: 'day', increment: 0 })).toThrow(InvalidSnapIncrementError);
  });

  it('rejects a negative increment instead of walking away from the target forever (#201)', () => {
    const at = instant('2026-06-15T14:10:00Z');
    expect(() => snapInstant(ZONE, at, { unit: 'day', increment: -1 })).toThrow(InvalidSnapIncrementError);
  });
});

describe('stepsBetween', () => {
  it('counts zero when from and to already match', () => {
    const at = instant('2026-06-15T14:00:00Z');
    expect(stepsBetween(ZONE, 'hour', 1, at, at)).toBe(0);
  });

  it('counts whole forward steps', () => {
    const from = instant('2026-06-15T14:00:00Z');
    const to = instant('2026-06-18T14:00:00Z');
    expect(stepsBetween(ZONE, 'day', 1, from, to)).toBe(3);
  });

  it('counts whole backward steps as negative', () => {
    const from = instant('2026-06-18T14:00:00Z');
    const to = instant('2026-06-15T14:00:00Z');
    expect(stepsBetween(ZONE, 'day', 1, from, to)).toBe(-3);
  });

  it('preserves wall-clock time stepping by day across a spring-forward transition', () => {
    // America/New_York spring-forward is 2026-03-08. Stepping midnight-to-midnight by 1 day must
    // stay on local midnight, not drift by the missing hour.
    const zone = 'America/New_York';
    const from = instant('2026-03-07T05:00:00Z'); // March 7 00:00 EST
    const to = instant('2026-03-09T04:00:00Z'); // March 9 00:00 EDT
    expect(stepsBetween(zone, 'day', 1, from, to)).toBe(2);
  });

  it('preserves wall-clock time stepping by day across a fall-back transition', () => {
    // America/New_York fall-back is 2026-11-01.
    const zone = 'America/New_York';
    const from = instant('2026-10-31T04:00:00Z'); // Oct 31 00:00 EDT
    const to = instant('2026-11-02T04:00:00Z'); // Nov 2 00:00 EST
    expect(stepsBetween(zone, 'day', 1, from, to)).toBe(2);
  });

  it('rejects a zero increment instead of never reaching the target (#201)', () => {
    const from = instant('2026-06-15T14:00:00Z');
    const to = instant('2026-06-18T14:00:00Z');
    expect(() => stepsBetween(ZONE, 'day', 0, from, to)).toThrow(InvalidSnapIncrementError);
  });

  it('rejects a negative increment instead of stepping the wrong direction forever (#201)', () => {
    const from = instant('2026-06-15T14:00:00Z');
    const to = instant('2026-06-18T14:00:00Z');
    expect(() => stepsBetween(ZONE, 'day', -1, from, to)).toThrow(InvalidSnapIncrementError);
  });
});
