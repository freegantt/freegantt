import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay } from './zone.js';
import { formatDate, formatEndInclusive } from './format.js';

const ZONE = 'America/New_York';

describe('formatDate', () => {
  it('formats a start with no conversion', () => {
    const start = instant('2026-08-26T14:30:00Z'); // 10:30 EDT
    expect(formatDate(ZONE, start)).toBe('Aug 26, 2026');
  });
});

describe('formatEndInclusive', () => {
  it('converts a half-open end to the last day the span actually covers', () => {
    // A span stored as [2026-08-26, 2026-08-27) displays as ending Aug 26, not Aug 27.
    const end = startOfDay(ZONE, instant('2026-08-27T12:00:00Z'));
    expect(formatEndInclusive(ZONE, end)).toBe('Aug 26, 2026');
  });

  it('is correct across a spring-forward DST boundary', () => {
    // 2026-03-08 is the US spring-forward transition in America/New_York; a span ending at that
    // day's local midnight displays as ending March 7, not March 8.
    const end = startOfDay(ZONE, instant('2026-03-08T12:00:00Z'));
    expect(formatEndInclusive(ZONE, end)).toBe('Mar 7, 2026');
  });

  it('is correct across a fall-back DST boundary and a month end', () => {
    // 2026-11-01 is the US fall-back transition; a span ending at that day's local midnight
    // displays as ending Oct 31, crossing both a DST fold and a month boundary correctly.
    const end = startOfDay(ZONE, instant('2026-11-01T12:00:00Z'));
    expect(formatEndInclusive(ZONE, end)).toBe('Oct 31, 2026');
  });
});
