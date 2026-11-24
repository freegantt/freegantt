import { describe, expect, it } from 'vitest';
import { createTimeScale, instant } from '../time/index.js';
import { resolveDateLines } from './date-line.js';

const start = instant('2026-01-01T00:00:00Z');
const end = instant('2027-01-01T00:00:00Z');
const scale = createTimeScale({ timeZone: 'UTC', range: { start, end }, pxPerMs: 0.001 });
const inside = instant('2026-06-01T00:00:00Z');
const outside = instant('2025-06-01T00:00:00Z');

describe('resolveDateLines', () => {
  it('emits the today wrapper when now() falls inside the scale range', () => {
    const lines = resolveDateLines({ scale, now: inside });
    expect(lines).toEqual([{ kind: 'dateLine', x: scale.xForInstant(inside), today: true }]);
  });

  it('emits nothing for the today wrapper when now() is outside the scale range', () => {
    expect(resolveDateLines({ scale, now: outside })).toEqual([]);
  });

  it('emits nothing for the today wrapper when todayLine is false', () => {
    expect(resolveDateLines({ scale, todayLine: false, now: inside })).toEqual([]);
  });

  it('pins the today wrapper at an Instant with no clock read', () => {
    const other = instant('2026-09-01T00:00:00Z');
    const lines = resolveDateLines({ scale, todayLine: other, now: inside });
    expect(lines).toEqual([{ kind: 'dateLine', x: scale.xForInstant(other), today: true }]);
  });

  it('emits an authored Date line that falls inside the scale range, with className', () => {
    const lines = resolveDateLines({
      scale,
      todayLine: false,
      dateLines: [{ placeAt: inside, label: 'Ship', className: 'fg-deadline-line' }],
    });
    expect(lines).toEqual([
      { kind: 'dateLine', x: scale.xForInstant(inside), label: 'Ship', className: 'fg-deadline-line' },
    ]);
  });

  it('drops an authored Date line outside the scale range', () => {
    expect(
      resolveDateLines({
        scale,
        todayLine: false,
        dateLines: [{ placeAt: outside }],
      }),
    ).toEqual([]);
  });

  it('emits the today wrapper and authored Date lines on one path, positionally', () => {
    const other = instant('2026-09-01T00:00:00Z');
    const lines = resolveDateLines({
      scale,
      now: inside,
      dateLines: [{ placeAt: other, label: 'Kickoff' }],
    });
    expect(lines).toEqual([
      { kind: 'dateLine', x: scale.xForInstant(inside), today: true },
      { kind: 'dateLine', x: scale.xForInstant(other), label: 'Kickoff' },
    ]);
  });

  it("puts the today line in the middle of today's day for todayLineAt: 'dayCenter'", () => {
    const afternoon = instant('2026-06-01T15:00:00Z');
    const [line] = resolveDateLines({ scale, todayLineAt: 'dayCenter', now: afternoon });
    expect(line?.x).toBe(scale.xForInstant(instant('2026-06-01T12:00:00Z')));
  });

  it("keeps the clock instant for todayLineAt: 'now'", () => {
    const [line] = resolveDateLines({ scale, todayLineAt: 'now', now: inside });
    expect(line?.x).toBe(scale.xForInstant(inside));
  });

  it('keeps a pinned Instant where it is, whatever todayLineAt says', () => {
    const [line] = resolveDateLines({ scale, todayLine: inside, todayLineAt: 'dayCenter' });
    expect(line?.x).toBe(scale.xForInstant(inside));
  });
});
