import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay } from './zone.js';
import { dedupeHeaderFormats, formatDate, formatEndInclusive, formatWeekNumber } from './format.js';
import type { ViewPresetHeader } from './scale.js';

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

describe('dedupeHeaderFormats', () => {
  const at = instant('2026-09-21T12:00:00Z');
  const YEAR_MONTH_DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const YEAR_MONTH: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short' };
  const YEAR: Intl.DateTimeFormatOptions = { year: 'numeric' };

  function label(format: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(undefined, { ...format, timeZone: ZONE }).format(new Date(at));
  }

  it('leaves a single-header preset untouched — nothing coarser to dedupe against', () => {
    const headers: ViewPresetHeader[] = [{ unit: 'day', increment: 1, format: YEAR_MONTH_DAY }];
    expect(dedupeHeaderFormats(headers)).toEqual([YEAR_MONTH_DAY]);
  });

  it('strips year and month from a finer band once a coarser band already states them', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [month, day] = dedupeHeaderFormats(headers);
    expect(label(month as Intl.DateTimeFormatOptions)).toBe('Sep 2026');
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('21');
  });

  it('strips only the fields an earlier band actually states — a lone year band leaves month alone', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'year', increment: 1, format: YEAR },
      { unit: 'month', increment: 1, format: YEAR_MONTH },
    ];
    const [, month] = dedupeHeaderFormats(headers);
    expect(label(month as Intl.DateTimeFormatOptions)).toBe('Sep');
  });

  it('passes a callback format through untouched, and it still counts as showing nothing to dedupe', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'week', increment: 1, format: formatWeekNumber },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [week, day] = dedupeHeaderFormats(headers);
    expect(week).toBe(formatWeekNumber);
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('Sep 21, 2026');
  });

  it('repeatCoarserUnits opts a band out of stripping, but it still marks the field as shown below it', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'week', increment: 1, format: YEAR_MONTH_DAY, repeatCoarserUnits: true },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [, week, day] = dedupeHeaderFormats(headers);
    expect(label(week as Intl.DateTimeFormatOptions)).toBe('Sep 21, 2026');
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('21');
  });

  it('memoizes by the headers array identity so the stripped format keeps one object identity', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    expect(dedupeHeaderFormats(headers)).toBe(dedupeHeaderFormats(headers));
  });
});
