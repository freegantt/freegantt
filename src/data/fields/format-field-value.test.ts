import { describe, expect, it } from 'vitest';
import type { Entry, Field, FormatContext } from '../../model/index.js';
import { formatFieldValue } from './format-field-value.js';

const ctx: FormatContext = { timeZone: 'UTC', locale: 'en-US' };

function entryWith(props: Record<string, unknown>): Entry {
  return { read: (key: string) => props[key] } as unknown as Entry;
}

describe("formatFieldValue — the one read for a Field's displayed text", () => {
  it("calls the Field's own formatValue with (value, ctx, entry)", () => {
    const seen: unknown[] = [];
    const field: Field = {
      key: 'cost',
      formatValue: (value, formatCtx, entry) => {
        seen.push(value, formatCtx, entry);
        return `$${String(value)}`;
      },
    };
    const entry = entryWith({ cost: 500 });
    expect(formatFieldValue(field, entry, ctx)).toBe('$500');
    expect(seen).toEqual([500, ctx, entry]);
  });

  it('falls back to stringifyPrimitive for a Field with no formatValue', () => {
    const field: Field = { key: 'count' };
    expect(formatFieldValue(field, entryWith({ count: 12 }), ctx)).toBe('12');
  });

  it('gives "" for a Field with no formatValue and an object value', () => {
    const field: Field = { key: 'tags' };
    expect(formatFieldValue(field, entryWith({ tags: ['a', 'b'] }), ctx)).toBe('');
  });
});
