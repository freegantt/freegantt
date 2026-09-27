import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { startOfDay, weekOfYear } from './zone.js';
import { startOfNextDay } from './date-only-end.js';
import {
  dateFormatter,
  dropRepeatedGranularity,
  formatDate,
  formatDateTime,
  formatHour,
  formatInclusiveDate,
  formatStartAndEnd,
  formatQuarter,
  formatWeekNumber,
  joinStartAndEnd,
  lastCoveredInstant,
  resolveDateFormat,
} from './format.js';
import type { ViewPresetHeader } from './scale.js';
import type { Field, FormatContext, Instant } from '../model/index.js';

const ZONE = 'America/New_York';
const ctx = (locale: Intl.LocalesArgument = 'en-US'): FormatContext => ({ timeZone: ZONE, locale });

describe('formatDate', () => {
  it('formats a start with no conversion', () => {
    const start = instant('2026-08-26T14:30:00Z'); // 10:30 EDT
    expect(formatDate(start, ctx())).toBe('Aug 26, 2026');
  });

  it('shows a blank cell for no value', () => {
    expect(formatDate(undefined, ctx())).toBe('');
    expect(formatDate(null, ctx())).toBe('');
  });

  it('takes a locale-less ctx: locale is optional in value, still a stated property', () => {
    const start = instant('2026-08-26T14:30:00Z');
    expect(formatDate(start, { timeZone: ZONE, locale: undefined })).toBe('Aug 26, 2026');
  });

  it('is a Formatter: it drops into a Field formatValue as is', () => {
    const field: Field<Instant> = { key: 'start', formatValue: formatDate };
    const start = instant('2026-08-26T14:30:00Z');
    expect(field.formatValue!(start, ctx(), {} as never)).toBe('Aug 26, 2026');
  });
});

describe('dateFormatter', () => {
  it('builds a Formatter for one fixed set of options', () => {
    const start = instant('2026-03-02T14:30:00Z'); // 09:30 EST
    const formatMonthDay = dateFormatter({ day: '2-digit', month: 'short' });
    expect(formatMonthDay(start, ctx())).toBe('Mar 02');
  });

  it('shows a blank cell for no value', () => {
    const formatMonthDay = dateFormatter({ day: '2-digit', month: 'short' });
    expect(formatMonthDay(undefined, ctx())).toBe('');
    expect(formatMonthDay(null, ctx())).toBe('');
  });

  it('freezes its own copy: mutating the caller options object after the call changes nothing', () => {
    const start = instant('2026-03-02T14:30:00Z');
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    const formatMonthDay = dateFormatter(options);
    const before = formatMonthDay(start, ctx());
    options.year = 'numeric';
    expect(formatMonthDay(start, ctx())).toBe(before);
  });

  it('is a Formatter: a built one drops into a Field formatValue as is', () => {
    const field: Field<Instant> = { key: 'start', formatValue: dateFormatter({ day: '2-digit' }) };
    const start = instant('2026-03-02T14:30:00Z');
    expect(field.formatValue!(start, ctx(), {} as never)).toBe('02');
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

describe('joinStartAndEnd', () => {
  it('joins both texts with the separator', () => {
    expect(joinStartAndEnd('Mar 2, 2026', 'Mar 4, 2026', ' → ')).toBe('Mar 2, 2026 → Mar 4, 2026');
  });

  it('reads a start-only text with a trailing separator', () => {
    expect(joinStartAndEnd('Mar 2, 2026', '', ' → ')).toBe('Mar 2, 2026 →');
  });

  it('reads an end-only text with a leading separator', () => {
    expect(joinStartAndEnd('', 'Mar 4, 2026', ' → ')).toBe('→ Mar 4, 2026');
  });

  it('shows two equal texts once', () => {
    expect(joinStartAndEnd('Mar 2, 2026', 'Mar 2, 2026', ' → ')).toBe('Mar 2, 2026');
  });

  it('gives an empty text for two missing sides', () => {
    expect(joinStartAndEnd('', '', ' → ')).toBe('');
  });

  it('defaults to an en dash', () => {
    expect(joinStartAndEnd('Mar 2, 2026', 'Mar 4, 2026')).toBe('Mar 2, 2026 – Mar 4, 2026');
  });
});

describe('formatStartAndEnd', () => {
  it('joins a start day and the last day the pair covers', () => {
    const start = instant('2026-03-02T05:00:00Z'); // 2026-03-02 local midnight EST
    const end = instant('2026-03-05T05:00:00Z'); // boundary: covers through the 4th
    expect(formatStartAndEnd({ start, end }, ctx())).toBe('Mar 2, 2026 – Mar 4, 2026');
  });

  it('reads a start-only pair with a trailing dash', () => {
    const start = instant('2026-03-02T05:00:00Z');
    expect(formatStartAndEnd({ start }, ctx())).toBe('Mar 2, 2026 –');
  });

  it('reads an end-only pair with a leading dash', () => {
    const end = instant('2026-03-05T05:00:00Z');
    expect(formatStartAndEnd({ end }, ctx())).toBe('– Mar 4, 2026');
  });

  it('gives an empty text for a pair with neither side', () => {
    expect(formatStartAndEnd({}, ctx())).toBe('');
  });

  it('gives an empty text for a missing value', () => {
    expect(formatStartAndEnd(undefined, ctx())).toBe('');
  });

  it('names a one-day span once', () => {
    const start = instant('2026-03-02T05:00:00Z');
    const end = instant('2026-03-03T05:00:00Z'); // boundary: covers through the 2nd
    expect(formatStartAndEnd({ start, end }, ctx())).toBe('Mar 2, 2026');
  });

  it('names a timed span inside one day once', () => {
    const start = instant('2026-03-02T13:00:00Z'); // 08:00 EST
    const end = instant('2026-03-02T20:00:00Z'); // 15:00 EST
    expect(formatStartAndEnd({ start, end }, ctx())).toBe('Mar 2, 2026');
  });

  it('names a zero-length span once', () => {
    const at = instant('2026-03-02T15:00:00Z');
    expect(formatStartAndEnd({ start: at, end: at }, ctx())).toBe('Mar 2, 2026');
  });

  it('reads a timed end at its own day, never the day before', () => {
    const start = instant('2026-03-02T05:00:00Z');
    const end = instant('2026-03-04T20:00:00Z'); // 15:00 EST on the 4th
    expect(formatStartAndEnd({ start, end }, ctx())).toBe('Mar 2, 2026 – Mar 4, 2026');
  });

  it('reads a midnight end at the day before it, never the boundary day', () => {
    const start = instant('2026-03-02T05:00:00Z');
    const end = instant('2026-03-04T05:00:00Z'); // local midnight EST on the 4th, boundary
    expect(formatStartAndEnd({ start, end }, ctx())).toBe('Mar 2, 2026 – Mar 3, 2026');
  });

  it('follows a caller locale', () => {
    const start = instant('2026-03-02T05:00:00Z');
    const end = instant('2026-03-05T05:00:00Z');
    expect(formatStartAndEnd({ start, end }, ctx('de-DE'))).toBe('2. März 2026 – 4. März 2026');
  });

  it('is a Formatter: it drops into a Field formatValue as is', () => {
    const field: Field<{ start?: Instant; end?: Instant }> = {
      key: 'dates',
      formatValue: formatStartAndEnd,
    };
    const start = instant('2026-03-02T05:00:00Z');
    const end = instant('2026-03-05T05:00:00Z');
    expect(field.formatValue!({ start, end }, ctx(), {} as never)).toBe('Mar 2, 2026 – Mar 4, 2026');
  });

  it('reads a span within one local day as its own date, for any zone/day (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('UTC', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe'),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2029-12-31') }),
        fc.integer({ min: 0, max: 23 * 60 * 60 * 1000 }),
        fc.integer({ min: 0, max: 23 * 60 * 60 * 1000 }),
        (zone, date, offsetA, offsetB) => {
          const dayStart = startOfDay(zone, date.getTime() as Instant);
          const dayEnd = startOfNextDay(zone, dayStart);
          const span = (dayEnd as number) - (dayStart as number);
          const a = ((dayStart as number) + Math.min(offsetA, span)) as Instant;
          const b = ((dayStart as number) + Math.min(offsetB, span)) as Instant;
          const start = a < b ? a : b;
          const end = a < b ? b : a;
          const zoneCtx: FormatContext = { timeZone: zone, locale: 'en-US' };
          expect(formatStartAndEnd({ start, end }, zoneCtx)).toBe(formatDate(start, zoneCtx));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('formatWeekNumber', () => {
  const at = instant('2026-03-02T12:00:00Z'); // week ten
  const label = `W${weekOfYear(ZONE, at)}`;

  it('labels the ISO week', () => {
    expect(formatWeekNumber(at, ctx())).toBe(label);
  });

  it('shows a blank cell for no value', () => {
    expect(formatWeekNumber(undefined, ctx())).toBe('');
    expect(formatWeekNumber(null, ctx())).toBe('');
  });

  it('is a Formatter: it drops into a Field formatValue as is', () => {
    const field: Field<Instant> = { key: 'start', formatValue: formatWeekNumber };
    expect(field.formatValue!(at, ctx(), {} as never)).toBe(label);
  });
});

describe('formatQuarter', () => {
  it('labels the calendar quarter in the dataset zone, not in UTC', () => {
    // 2026-04-01T02:00Z is still March 31 in New York, so it reads as the first quarter.
    expect(formatQuarter(instant('2026-04-01T02:00:00Z'), ctx())).toBe('Q1');
    expect(formatQuarter(instant('2026-04-01T12:00:00Z'), ctx())).toBe('Q2');
    expect(formatQuarter(instant('2026-09-30T12:00:00Z'), ctx())).toBe('Q3');
    expect(formatQuarter(instant('2026-12-31T12:00:00Z'), ctx())).toBe('Q4');
  });

  it('shows a blank cell for no value', () => {
    expect(formatQuarter(undefined, ctx())).toBe('');
    expect(formatQuarter(null, ctx())).toBe('');
  });
});

describe('formatHour', () => {
  it('shows an unpadded hour, never zero-padded', () => {
    const at = instant('2026-03-02T14:00:00Z'); // 09:00 EST
    expect(formatHour(at, ctx())).toBe('9:00');
  });

  it('shows a blank cell for no value', () => {
    expect(formatHour(undefined, ctx())).toBe('');
    expect(formatHour(null, ctx())).toBe('');
  });

  it('is a Formatter: it drops into a Field formatValue as is', () => {
    const field: Field<Instant> = { key: 'start', formatValue: formatHour };
    const at = instant('2026-03-02T14:00:00Z');
    expect(field.formatValue!(at, ctx(), {} as never)).toBe('9:00');
  });
});

describe('resolveDateFormat', () => {
  it('curries a callback DateFormat over ctx, unchanged output', () => {
    const at = instant('2026-03-02T14:00:00Z');
    const label = resolveDateFormat(formatHour, ctx());
    expect(label(at)).toBe(formatHour(at, ctx()));
  });

  it('resolves options through the same Intl.DateTimeFormat cache as dateFormatter', () => {
    const at = instant('2026-03-02T14:00:00Z');
    const format: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
    const label = resolveDateFormat(format, ctx());
    expect(label(at)).toBe(dateFormatter(format)(at, ctx()));
  });

  it('a Field Formatter labels a header band the same way it labels a cell', () => {
    const at = instant('2026-03-05T00:00:00Z');
    const label = resolveDateFormat(formatDateTime, ctx());
    expect(label(at)).toBe(formatDateTime(at, ctx()));
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
