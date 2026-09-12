import { describe, expect, it } from 'vitest';
import type { Entry, FormatContext } from '../../model/index.js';
import { percent } from './field-types.js';

function ctx(locale: Intl.LocalesArgument): FormatContext {
  return {
    timeZone: 'UTC',
    locale,
    read: () => undefined,
    durationOf: () => ({ value: 0, unit: 'millisecond' }),
  };
}

// formatValue never reads `entry` here, so a bare stand-in is enough to satisfy the signature.
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
      percent.parseValue!(text, parseCtx);
    expect(parse('35', ctx('en-US'))).toBe(35);
    expect(parse('35%', ctx('en-US'))).toBe(35);
    expect(parse(' 35 % ', ctx('en-US'))).toBe(35);
  });

  it('refuses non-numeric text', () => {
    expect(percent.parseValue!('abc', ctx('en-US'))).toBeUndefined();
  });

  it('keeps a negative or an over-100 reading, unclamped', () => {
    expect(percent.parseValue!('-5', ctx('en-US'))).toBe(-5);
    expect(percent.parseValue!('120', ctx('en-US'))).toBe(120);
  });

  it('ships inputType and a column default carrying alignment, and no rollUp', () => {
    expect(percent.inputType).toBe('number');
    expect(percent.column).toEqual({ align: 'end' });
    expect(percent.rollUp).toBeUndefined();
  });
});
