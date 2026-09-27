import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { UnknownFieldError } from '../model/index.js';
import { currency } from '../data/fields/field-types.js';
import { formatDateTime } from '../time/index.js';

describe("Dataset.formatFieldValue — a Field's text with no Gantt (#583)", () => {
  it("gives a Field's own formatValue text, in the locale the caller names", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: currency({ code: 'EUR' }) }],
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02', end: '2026-03-05', props: { cost: 1234.5 } }],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'cost', 'de-DE')).toBe('1.234,50 €');
  });

  it('falls back to the plain text of a primitive value for a Field with no formatValue', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'crew' }, { key: 'hours' }],
      entries: [
        {
          id: 't1',
          name: 'Task',
          start: '2026-03-02',
          end: '2026-03-05',
          props: { crew: 'Blue', hours: 12 },
        },
      ],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'crew')).toBe('Blue');
    expect(dataset.formatFieldValue(entry, 'hours')).toBe('12');
  });

  it("formats a compute Field's own text, the same a Grid cell would show", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02', end: '2026-03-05' }],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'duration')).toBe('4 d');
  });

  it("reads the zone from this Dataset, not the caller's own", () => {
    const dataset = new Dataset({
      timeZone: 'Asia/Tokyo',
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02T23:30:00Z', end: '2026-03-04T01:00:00Z' }],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'start', 'en-US')).toBe('Mar 3, 2026, 8:30 AM');
    expect(dataset.formatFieldValue(entry, 'end', 'en-US')).toBe('Mar 4, 2026');
  });

  it('gives an omitted locale as the runtime default, the same createFormatContext gives every caller', () => {
    const dataset = new Dataset({
      timeZone: 'Asia/Tokyo',
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02T23:30:00Z', end: '2026-03-04T01:00:00Z' }],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'start')).toBe(
      formatDateTime(entry.start, { timeZone: 'Asia/Tokyo', locale: [] }),
    );
  });

  it("gives '' for an Entry with no value for the Field", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      fields: [{ key: 'cost', type: currency({ code: 'EUR' }) }],
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02', end: '2026-03-05' }],
    });
    const entry = dataset.entries.all[0]!;
    expect(dataset.formatFieldValue(entry, 'cost')).toBe('');
  });

  it('throws UnknownFieldError naming formatFieldValue for an undeclared key', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [{ id: 't1', name: 'Task', start: '2026-03-02', end: '2026-03-05' }],
    });
    const entry = dataset.entries.all[0]!;
    try {
      dataset.formatFieldValue(entry, 'notAField');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownFieldError);
      expect((error as UnknownFieldError).operation).toBe('formatFieldValue' satisfies string);
      expect((error as UnknownFieldError).field).toBe('notAField' satisfies string);
    }
  });
});
