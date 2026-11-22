import { describe, expect, it } from 'vitest';
import { laneBandsOf, laneCountOf, laneRowHeight } from './lane.js';
import type { LaneGeometry, LaneLayout } from './lane.js';
import type { Entry } from '../model/index.js';

const geometry: LaneGeometry = { heightPx: 30, gapPx: 6, paddingPx: 10 };
const entry = {} as Entry;
const layoutOf = (count: number): LaneLayout => ({ rule: { count: () => count, of: () => 0 }, geometry });

describe('lane geometry', () => {
  it('gives a row with one Lane 50 px and a row with two Lanes 86 px', () => {
    expect(laneRowHeight(1, geometry)).toBe(50);
    expect(laneRowHeight(2, geometry)).toBe(86);
  });

  it('stacks Lanes from the padding when the row is exactly as tall as its Lanes', () => {
    expect(laneBandsOf(100, 86, 2, geometry)).toEqual([
      { top: 110, height: 30 },
      { top: 146, height: 30 },
    ]);
  });

  it('centres the stack in a row taller than its Lanes', () => {
    expect(laneBandsOf(0, 100, 1, geometry)).toEqual([{ top: 35, height: 30 }]);
  });

  it.each([
    ['a fraction', 2.9, 2],
    ['zero', 0, 0],
    ['negative', -1, 0],
    ['not a number', Number.NaN, 0],
  ])('reads %s as a whole Lane count', (_label, answer, expected) => {
    expect(laneCountOf(layoutOf(answer), entry)).toBe(expected);
  });
});
