import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay } from './zone.js';
import {
  DATE_TIME_FORMAT,
  dropRepeatedGranularity,
  formatDate,
  formatDateTime,
  formatInclusiveDate,
  formatWeekNumber,
  lastCoveredInstant,
} from './format.js';
import type { ViewPresetHeader } from './scale.js';
import type { FormatContext } from '../model/index.js';

const ZONE = 'America/New_York';
const ctx = (locale: Intl.LocalesArgument = 'en-US'): FormatContext => ({ timeZone: ZONE, locale });

describe('formatDate', () => {
  it('formats a start with no conversion', () => {
    const start = instant('2026-08-26T14:30:00Z'); // 10:30 EDT
    expect(formatDate(start, ctx())).toBe('Aug 26, 2026');
  });

  it('includes clock time when DATE_TIME_FORMAT is passed', () => {
    const start = instant('2026-08-26T14:30:00Z'); // 10:30 EDT
    const text = formatDate(start, ctx(), DATE_TIME_FORMAT);
    expect(text).toContain('Aug 26, 2026');
    expect(text).toMatch(/10:30/);
  });

  it('takes a locale-less ctx: locale is optional', () => {
    const start = instant('2026-08-26T14:30:00Z');
    expect(formatDate(start, { timeZone: ZONE })).toBe('Aug 26, 2026');
  });
});

describe('lastCoveredInstant', () => {
  it('steps back one millisecond from end', () => {
    const start = instant('2026-03-02T00:00:00Z');
    const end = instant('2026-03-05T00:00:00Z');
    expect(lastCoveredInstant({ start, end })).toBe(instant('2026-03-04T23:59:59.999Z'));
  });

  it('leaves a zero-length span at its own end, never one millisecond earlier (#240)', () => {
    const at = instant('2026-01-05T10:00:00Z');
    expect(lastCoveredInstant({ start: at, end: at })).toBe(at);
  });

  it('works with no start at all', () => {
    const end = instant('2026-03-05T00:00:00Z');
    expect(lastCoveredInstant({ end })).toBe(instant('2026-03-04T23:59:59.999Z'));
  });

  it('takes no time zone: the millisecond step is the same in every zone', () => {
    const end = instant('2026-03-05T00:00:00Z');
    expect(lastCoveredInstant({ end })).toBe(instant('2026-03-04T23:59:59.999Z'));
  });
});

describe('formatDateTime', () => {
  it('shows the stored moment, date and clock time', () => {
    const at = instant('2026-03-05T00:00:00Z');
    expect(formatDateTime(at, ctx())).toBe('Mar 4, 2026, 7:00 PM');
  });

  it('shows a blank cell for no value', () => {
    expect(formatDateTime(undefined, ctx())).toBe('');
    expect(formatDateTime(null, ctx())).toBe('');
  });
});

describe('formatInclusiveDate', () => {
  const start = instant('2026-03-02T00:00:00Z');

  it('shows the last day a span covers, date only', () => {
    const end = instant('2026-03-05T00:00:00Z'); // boundary: covers through Mar 4 EST
    expect(formatInclusiveDate(end, ctx(), { start })).toBe('Mar 4, 2026');
  });

  it('works with no start at all', () => {
    const end = instant('2026-03-05T00:00:00Z');
    expect(formatInclusiveDate(end, ctx(), {})).toBe('Mar 4, 2026');
  });

  it('shows a zero-length span at its own end, unchanged', () => {
    const at = instant('2026-01-05T10:00:00Z');
    expect(formatInclusiveDate(at, ctx(), { start: at })).toBe(formatDate(at, ctx()));
  });

  it('shows a timed end at its own day, never the day before', () => {
    const end = instant('2026-03-05T00:00:01Z'); // one second after midnight EST
    expect(formatInclusiveDate(end, ctx(), { start })).toBe('Mar 4, 2026');
  });

  it('shows a blank cell for no value', () => {
    expect(formatInclusiveDate(undefined, ctx(), { start })).toBe('');
    expect(formatInclusiveDate(null, ctx(), { start })).toBe('');
  });

  it('is correct across a spring-forward DST boundary', () => {
    const end = startOfDay(ZONE, instant('2026-03-08T12:00:00Z'));
    expect(formatInclusiveDate(end, ctx(), { start })).toBe('Mar 7, 2026');
  });

  it('is correct across a fall-back DST boundary and a month end', () => {
    const end = startOfDay(ZONE, instant('2026-11-01T12:00:00Z'));
    expect(formatInclusiveDate(end, ctx(), { start })).toBe('Oct 31, 2026');
  });
});

describe('dropRepeatedGranularity', () => {
  const at = instant('2026-09-21T12:00:00Z');
  const YEAR_MONTH_DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const YEAR_MONTH: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short' };
  const YEAR: Intl.DateTimeFormatOptions = { year: 'numeric' };

  function label(format: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(undefined, { ...format, timeZone: ZONE }).format(new Date(at));
  }

  it('leaves a single-header preset untouched — nothing coarser to drop granularity against', () => {
    const headers: ViewPresetHeader[] = [{ unit: 'day', increment: 1, format: YEAR_MONTH_DAY }];
    expect(dropRepeatedGranularity(headers)).toEqual([YEAR_MONTH_DAY]);
  });

  it('strips year and month from a finer band once a coarser band already states them', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [month, day] = dropRepeatedGranularity(headers);
    expect(label(month as Intl.DateTimeFormatOptions)).toBe('Sep 2026');
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('21');
  });

  it('strips only the fields an earlier band actually states — a lone year band leaves month alone', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'year', increment: 1, format: YEAR },
      { unit: 'month', increment: 1, format: YEAR_MONTH },
    ];
    const [, month] = dropRepeatedGranularity(headers);
    expect(label(month as Intl.DateTimeFormatOptions)).toBe('Sep');
  });

  it('passes a callback format through untouched, and it still counts as showing nothing to drop', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'week', increment: 1, format: formatWeekNumber },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [week, day] = dropRepeatedGranularity(headers);
    expect(week).toBe(formatWeekNumber);
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('Sep 21, 2026');
  });

  it('repeatCoarserUnits opts a band out of stripping, but it still marks the field as shown below it', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'week', increment: 1, format: YEAR_MONTH_DAY, repeatCoarserUnits: true },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    const [, week, day] = dropRepeatedGranularity(headers);
    expect(label(week as Intl.DateTimeFormatOptions)).toBe('Sep 21, 2026');
    expect(label(day as Intl.DateTimeFormatOptions)).toBe('21');
  });

  it('memoizes by the headers array identity so the stripped format keeps one object identity', () => {
    const headers: ViewPresetHeader[] = [
      { unit: 'month', increment: 1, format: YEAR_MONTH },
      { unit: 'day', increment: 1, format: YEAR_MONTH_DAY },
    ];
    expect(dropRepeatedGranularity(headers)).toBe(dropRepeatedGranularity(headers));
  });
});
