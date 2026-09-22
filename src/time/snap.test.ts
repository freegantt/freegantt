import { describe, expect, it } from 'vitest';
import { InvalidSnapIncrementError } from '../model/index.js';
import { instant } from './instant.js';
import { nextTickBoundary, snapInstant, stepsBetween } from './snap.js';

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

  it('a larger increment pushes the flanking boundaries apart, changing which side wins', () => {
    // 14:40 EDT is 40min past the 1-hour floor (14:00), so its nearer boundary is the 15:00 upper.
    // A 3-hour step (#489) anchors on the day (00, 03, 06, …, 21 local), not on 14:40's own floor:
    // its flanking boundaries are 12:00 and 15:00, and 14:40 is still nearer the 15:00 upper.
    const at = instant('2026-06-15T18:40:00Z'); // 14:40 EDT
    expect(snapInstant(ZONE, at, { unit: 'hour', increment: 1 })).toBe(instant('2026-06-15T19:00:00Z'));
    expect(snapInstant(ZONE, at, { unit: 'hour', increment: 3 })).toBe(instant('2026-06-15T19:00:00Z'));
  });

  it('#489: a 6-hour snap lands on 00/06/12/18 local, never on the caller-supplied instant’s own floor', () => {
    const at = instant('2026-06-15T11:10:00Z'); // 07:10 EDT — closer to 06:00 than to 12:00
    expect(snapInstant(ZONE, at, { unit: 'hour', increment: 6 })).toBe(instant('2026-06-15T10:00:00Z')); // 06:00 EDT
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

describe('nextTickBoundary', () => {
  it('walks forward to the next whole-unit boundary strictly after at', () => {
    const at = instant('2026-06-15T14:10:00Z'); // 10:10 EDT
    expect(nextTickBoundary(ZONE, at, 'hour', 1)).toBe(instant('2026-06-15T15:00:00Z'));
  });

  it('steps past at even when at already sits on a boundary — never returns at itself (#476)', () => {
    const at = instant('2026-06-15T14:00:00Z'); // 10:00 EDT, already a whole hour
    expect(nextTickBoundary(ZONE, at, 'hour', 1)).toBe(instant('2026-06-15T15:00:00Z'));
  });

  it('honours a multi-step increment, landing on the next multiple of the day-anchored grid (#489)', () => {
    // 14:40 EDT sits between the day-anchored 12:00 and 15:00 boundaries (00, 03, 06, …, 21 local) —
    // the next one strictly after it is 15:00, not 17:00 (14:40's own floor plus 3h).
    const at = instant('2026-06-15T18:40:00Z'); // 14:40 EDT
    expect(nextTickBoundary(ZONE, at, 'hour', 3)).toBe(instant('2026-06-15T19:00:00Z'));
  });

  it('rejects a zero increment instead of looping forever (#201)', () => {
    const at = instant('2026-06-15T14:10:00Z');
    expect(() => nextTickBoundary(ZONE, at, 'day', 0)).toThrow(InvalidSnapIncrementError);
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
