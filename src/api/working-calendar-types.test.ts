import { describe, expect, it } from 'vitest';
import { workingCalendar } from './index.js';
import type { TimeCover } from './index.js';

describe('workingCalendar().offTime()', () => {
  it('is assignable to TimeCover, so timeShading() takes it as covers', () => {
    const cover: TimeCover = workingCalendar({ workdays: [1, 2, 3, 4, 5] }).offTime();
    expect(cover.hideWhenCoarserThan).toBe('day');
  });
});
