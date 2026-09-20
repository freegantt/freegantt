import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import { InvalidInstantError } from '../model/index.js';

describe('instant()', () => {
  it('accepts an ISO string carrying an explicit Z offset', () => {
    expect(instant('2026-09-01T00:00:00Z')).toBe(Date.parse('2026-09-01T00:00:00Z'));
  });

  it('accepts an ISO string carrying an explicit numeric offset', () => {
    expect(instant('2026-09-01T00:00:00+02:00')).toBe(Date.parse('2026-09-01T00:00:00+02:00'));
  });

  it('rejects a zoneless plain time regardless of the local machine zone', () => {
    // Not a snapshot of the resolved value (that depends on TZ by definition) — asserting the throw
    // itself, which must hold under any TZ, is the point of this test (see #27).
    expect(() => instant('2026-09-01T00:00:00')).toThrow(InvalidInstantError);
    expect(() => instant('2026-09-01')).toThrow(InvalidInstantError);
    // It names the remedy, because the value really is a date and really is missing a zone.
    expect(() => instant('2026-09-01')).toThrow(/names no instant until a zone resolves it/);
  });

  it('refuses null with its own fault, not the zoneless one (#431 F6)', () => {
    // The public helper meets the same untyped door `toInstant` does — a row out of a database
    // carrying `start: null`. Sending that reader to look at zones is the one wrong answer, because
    // a zone is the single thing that is not the matter here.
    expect(() => instant(null as unknown as string)).toThrow(InvalidInstantError);
    expect(() => instant(null as unknown as string)).toThrow(
      'null names no instant. An absent date is a value left out, not a null one. Write a date, or leave it out.',
    );
    expect(() => instant(null as unknown as string)).not.toThrow(/zone|offset/i);
    expect(() => instant(undefined as unknown as string)).toThrow(/names no instant/);
  });

  it('says a value naming no date is unreadable, rather than blaming a missing zone', () => {
    // 'next tuesday' carries no zone either, but "write an offset" is not the fix for it.
    expect(() => instant('next tuesday')).toThrow('"next tuesday" is not a date this library reads.');
    expect(() => instant('next tuesday')).not.toThrow(/zone|offset/i);
    expect(() => instant({} as unknown as string)).toThrow('{} is not a date this library reads.');
    expect(() => instant(true as unknown as string)).toThrow('true is not a date this library reads.');
  });

  it('refuses a value that reads back as NaN instead of answering NaN', () => {
    // Every one of these used to return `NaN as Instant`. A NaN Instant flows on and shows up much
    // later as a bar that never paints, with nothing left pointing at the value that caused it.
    expect(() => instant(new Date('nope'))).toThrow('Invalid Date is not a date this library reads.');
    expect(() => instant(Number.NaN)).toThrow(/is not a finite count of epoch milliseconds/);
    expect(() => instant(Infinity)).toThrow(/is not a finite count of epoch milliseconds/);
    // OFFSET_ISO is a suffix test, so this string clears it and still names no date.
    expect(() => instant('laterZ')).toThrow('"laterZ" is not a date this library reads.');
  });

  it('carries the value the consumer wrote, for a loader that names the row it came from', () => {
    try {
      instant('laterZ');
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidInstantError).value).toBe('laterZ');
      expect((error as InvalidInstantError).code).toBe('invalid-instant');
    }
  });

  it('accepts a number as milliseconds since epoch', () => {
    expect(instant(0)).toBe(0);
  });

  it('accepts a Date', () => {
    const d = new Date('2026-09-01T00:00:00Z');
    expect(instant(d)).toBe(d.getTime());
  });
});
