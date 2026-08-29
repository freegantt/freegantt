import { describe, expect, it } from 'vitest';
import { createTimeScale, instant } from '../time/index.js';
import { resolveDateLines, TODAY_DATE_LINE_ID } from './date-line.js';

const start = instant('2026-01-01T00:00:00Z');
const end = instant('2027-01-01T00:00:00Z');
const scale = createTimeScale({ timeZone: 'UTC', range: { start, end }, pxPerMs: 0.001 });
const inside = instant('2026-06-01T00:00:00Z');
const outside = instant('2025-06-01T00:00:00Z');

describe('resolveDateLines', () => {
  it('emits the today wrapper when now() falls inside the scale range', () => {
    const lines = resolveDateLines({ scale, now: inside });
    expect(lines).toEqual([{ kind: 'dateLine', id: TODAY_DATE_LINE_ID, x: scale.xForInstant(inside) }]);
  });

  it('emits nothing for the today wrapper when now() is outside the scale range', () => {
    expect(resolveDateLines({ scale, now: outside })).toEqual([]);
  });

  it('emits nothing for the today wrapper when todayLine is false', () => {
    expect(resolveDateLines({ scale, todayLine: false, now: inside })).toEqual([]);
  });

  it('emits an authored Date line that falls inside the scale range', () => {
    const lines = resolveDateLines({
      scale,
      todayLine: false,
      dateLines: [{ id: 'deadline', instant: inside, label: 'Ship' }],
    });
    expect(lines).toEqual([
      { kind: 'dateLine', id: 'deadline', x: scale.xForInstant(inside), label: 'Ship' },
    ]);
  });

  it('drops an authored Date line outside the scale range', () => {
    expect(
      resolveDateLines({
        scale,
        todayLine: false,
        dateLines: [{ id: 'deadline', instant: outside }],
      }),
    ).toEqual([]);
  });

  it('emits the today wrapper and authored Date lines on one path', () => {
    const other = instant('2026-09-01T00:00:00Z');
    const lines = resolveDateLines({
      scale,
      now: inside,
      dateLines: [{ id: 'kickoff', instant: other }],
    });
    expect(lines).toEqual([
      { kind: 'dateLine', id: TODAY_DATE_LINE_ID, x: scale.xForInstant(inside) },
      { kind: 'dateLine', id: 'kickoff', x: scale.xForInstant(other) },
    ]);
  });
});
