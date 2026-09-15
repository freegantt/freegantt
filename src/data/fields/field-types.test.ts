import { describe, expect, it } from 'vitest';
import type { Duration, Entry, FormatContext, Instant } from '../../model/index.js';
import { DATE_TIME_FORMAT, formatDate, instant, MS } from '../../time/index.js';
import { currency, date, duration, number, percent, text } from './field-types.js';

function ctx(locale: Intl.LocalesArgument): FormatContext {
  return { timeZone: 'UTC', locale };
}

// Neither half of these types reads `entry`, so a bare stand-in is enough to satisfy both signatures.
const entry = {} as Entry;

describe('percent — the shipped Field type', () => {
  it('formats 0, 35, 100 and 120 in en-US', () => {
    const format = (value: number | undefined, formatCtx: FormatContext, e: Entry): string =>
      percent.formatValue!(value, formatCtx, e);
    expect(format(0, ctx('en-US'), entry)).toBe('0%');
    expect(format(35, ctx('en-US'), entry)).toBe('35%');
    expect(format(100, ctx('en-US'), entry)).toBe('100%');
    expect(format(120, ctx('en-US'), entry)).toBe('120%');
  });

  it('formats a fraction through the style default, same as any other reading', () => {
    expect(percent.formatValue!(33.5, ctx('en-US'), entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'percent' }).format(0.335),
    );
  });

  it('formats through Intl in a different locale', () => {
    // fr-FR spaces the sign with U+202F, a narrow no-break space, not an ASCII one.
    expect(percent.formatValue!(35, ctx('fr-FR'), entry)).toBe(
      new Intl.NumberFormat('fr-FR', { style: 'percent' }).format(0.35),
    );
  });

  it('formats undefined and a string as the empty string', () => {
    expect(percent.formatValue!(undefined, ctx('en-US'), entry)).toBe('');
    expect(percent.formatValue!('35' as never, ctx('en-US'), entry)).toBe('');
  });

  it('parses a bare number, a percent sign, and padded whitespace', () => {
    const parse = (text: string, parseCtx: FormatContext): number | undefined =>
      percent.parseValue!(text, parseCtx, entry);
    expect(parse('35', ctx('en-US'))).toBe(35);
    expect(parse('35%', ctx('en-US'))).toBe(35);
    expect(parse(' 35 % ', ctx('en-US'))).toBe(35);
  });

  it('refuses non-numeric text', () => {
    expect(percent.parseValue!('abc', ctx('en-US'), entry)).toBeUndefined();
  });

  it('keeps a negative or an over-100 reading, unclamped', () => {
    expect(percent.parseValue!('-5', ctx('en-US'), entry)).toBe(-5);
    expect(percent.parseValue!('120', ctx('en-US'), entry)).toBe(120);
  });

  it('ships inputType and a column default carrying alignment, and no rollUp', () => {
    expect(percent.inputType).toBe('number');
    expect(percent.column).toEqual({ align: 'end' });
    expect(percent.rollUp).toBeUndefined();
  });
});

describe('text — the shipped Field type', () => {
  it('stringifies a primitive and blanks anything else', () => {
    expect(text.formatValue!('Ada', ctx('en-US'), entry)).toBe('Ada');
    expect(text.formatValue!(undefined, ctx('en-US'), entry)).toBe('');
  });

  it('ships inputType text, and no rollUp or compare', () => {
    expect(text.inputType).toBe('text');
    expect(text.rollUp).toBeUndefined();
    expect(text).not.toHaveProperty('compare');
  });
});

describe('number — the shipped Field type', () => {
  it('formats through Intl decimal style', () => {
    expect(number.formatValue!(35, ctx('en-US'), entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'decimal' }).format(35),
    );
    expect(number.formatValue!(1234.5, ctx('fr-FR'), entry)).toBe(
      new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(1234.5),
    );
  });

  it('parses a trimmed number and refuses non-finite text', () => {
    expect(number.parseValue!('35', ctx('en-US'), entry)).toBe(35);
    expect(number.parseValue!(' 35 ', ctx('en-US'), entry)).toBe(35);
    expect(number.parseValue!('abc', ctx('en-US'), entry)).toBeUndefined();
  });

  it('ships numeric compare, end alignment, number input, and no rollUp', () => {
    expect(number.compare!(10, 3)).toBeGreaterThan(0);
    expect(number.inputType).toBe('number');
    expect(number.column).toEqual({ align: 'end' });
    expect(number.rollUp).toBeUndefined();
  });
});

describe('date — the shipped Field type', () => {
  const noon: Instant = instant('2026-06-15T12:00:00Z');

  it('formats an Instant through formatDate and DATE_TIME_FORMAT', () => {
    expect(date.formatValue!(noon, ctx('en-US'), entry)).toBe(
      formatDate('UTC', noon, 'en-US', DATE_TIME_FORMAT),
    );
    expect(date.formatValue!(noon, ctx('fr-FR'), entry)).toBe(
      formatDate('UTC', noon, 'fr-FR', DATE_TIME_FORMAT),
    );
  });

  it('ships Instant compare, and no parseValue, inputType, or rollUp', () => {
    const earlier: Instant = instant('2026-06-14T12:00:00Z');
    expect(date.compare!(noon, earlier)).toBeGreaterThan(0);
    expect(date).not.toHaveProperty('parseValue');
    expect(date.inputType).toBeUndefined();
    expect(date.rollUp).toBeUndefined();
  });
});

describe('duration — the shipped Field type', () => {
  const twelveDays: Duration = { value: 12 * MS.DAY, unit: 'millisecond' };
  const halfDay: Duration = { value: 0.5 * MS.DAY, unit: 'millisecond' };

  it('formats whole days without a decimal, and a fraction with one', () => {
    expect(duration.formatValue!(twelveDays, ctx('en-US'), entry)).toBe('12 d');
    expect(duration.formatValue!(halfDay, ctx('en-US'), entry)).toBe('0.5 d');
  });

  it('ships duration compare, and no parseValue, inputType, or rollUp', () => {
    expect(duration.compare!(twelveDays, halfDay)).toBeGreaterThan(0);
    expect(duration).not.toHaveProperty('parseValue');
    expect(duration.inputType).toBeUndefined();
    expect(duration.rollUp).toBeUndefined();
  });
});

describe('currency — the factory, not a seeded name', () => {
  const eur = currency({ code: 'EUR' });

  it('formats a number as EUR in en-US and in another locale', () => {
    expect(eur.formatValue!(1234.5, ctx('en-US'), entry)).toBe(
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    expect(eur.formatValue!(1234.5, ctx('de-DE'), entry)).toBe(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
  });

  it('parses a trimmed number and refuses non-finite text', () => {
    expect(eur.parseValue!('35', ctx('en-US'), entry)).toBe(35);
    expect(eur.parseValue!(' 35 ', ctx('en-US'), entry)).toBe(35);
    expect(eur.parseValue!('abc', ctx('en-US'), entry)).toBeUndefined();
  });

  it('ships number input, end alignment, and no rollUp', () => {
    expect(eur.inputType).toBe('number');
    expect(eur.column).toEqual({ align: 'end' });
    expect(eur.rollUp).toBeUndefined();
  });

  it('throws at the factory when the ISO code is not a currency', () => {
    expect(() => currency({ code: 'not-a-code' })).toThrow();
  });
});
