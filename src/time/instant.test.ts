import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';

describe('instant()', () => {
  it('accepts an ISO string carrying an explicit Z offset', () => {
    expect(instant('2026-09-01T00:00:00Z')).toBe(Date.parse('2026-09-01T00:00:00Z'));
  });

  it('accepts an ISO string carrying an explicit numeric offset', () => {
    expect(instant('2026-09-01T00:00:00+02:00')).toBe(Date.parse('2026-09-01T00:00:00+02:00'));
  });

  it('rejects a zoneless plain time regardless of the host machine zone', () => {
    // Not a snapshot of the resolved value (that depends on TZ by definition) — asserting the throw
    // itself, which must hold under any TZ, is the point of this test (see #27).
    expect(() => instant('2026-09-01T00:00:00')).toThrow(RangeError);
    expect(() => instant('2026-09-01')).toThrow(RangeError);
  });

  it('accepts a number as milliseconds since epoch', () => {
    expect(instant(0)).toBe(0);
  });

  it('accepts a Date', () => {
    const d = new Date('2026-09-01T00:00:00Z');
    expect(instant(d)).toBe(d.getTime());
  });
});
