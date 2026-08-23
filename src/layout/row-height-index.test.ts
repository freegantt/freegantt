import { describe, expect, it } from 'vitest';
import { PrefixSumHeightIndex } from './row-height-index.js';

describe('PrefixSumHeightIndex', () => {
  it('reports uniform row tops and total height', () => {
    const index = new PrefixSumHeightIndex(5, () => 32);
    expect(index.topAt(0)).toBe(0);
    expect(index.topAt(1)).toBe(32);
    expect(index.topAt(4)).toBe(128);
    expect(index.totalHeight).toBe(160);
  });

  it('reports variable row tops from a per-row height function', () => {
    const heights = [20, 40, 10, 60];
    const index = new PrefixSumHeightIndex(heights.length, (i) => heights[i]!);
    expect(index.topAt(0)).toBe(0);
    expect(index.topAt(1)).toBe(20);
    expect(index.topAt(2)).toBe(60);
    expect(index.topAt(3)).toBe(70);
    expect(index.totalHeight).toBe(130);
    expect(index.heightAt(2)).toBe(10);
  });

  it('maps a y offset to the row that contains it, including exact boundaries', () => {
    const heights = [20, 40, 10, 60]; // tops: 0, 20, 60, 70; end: 130
    const index = new PrefixSumHeightIndex(heights.length, (i) => heights[i]!);
    expect(index.indexAtY(0)).toBe(0);
    expect(index.indexAtY(19)).toBe(0);
    expect(index.indexAtY(20)).toBe(1); // exact boundary belongs to the next row
    expect(index.indexAtY(59)).toBe(1);
    expect(index.indexAtY(60)).toBe(2);
    expect(index.indexAtY(129)).toBe(3);
    expect(index.indexAtY(1000)).toBe(3); // clamps to the last row past content end
  });

  it('handles an empty index without throwing', () => {
    const index = new PrefixSumHeightIndex(0, () => 32);
    expect(index.totalHeight).toBe(0);
    expect(index.indexAtY(0)).toBe(0);
  });

  it('recomputes only the invalidated suffix after a height change', () => {
    const heights = [20, 20, 20, 20];
    const index = new PrefixSumHeightIndex(heights.length, (i) => heights[i]!);

    // Warm the cache for the whole index.
    expect(index.totalHeight).toBe(80);
    expect(index.topAt(3)).toBe(60);

    // Mutate row 1's height behind the index and invalidate from there.
    heights[1] = 50;
    index.invalidateFrom(1);

    // topAt(0) and topAt(1) don't depend on row 1's own height, so they're unaffected...
    expect(index.topAt(0)).toBe(0);
    expect(index.topAt(1)).toBe(20);
    // ...but everything after row 1 reflects the change.
    expect(index.topAt(2)).toBe(70);
    expect(index.topAt(3)).toBe(90);
    expect(index.totalHeight).toBe(110);
  });

  it('invalidateFrom(0) forces a full recompute', () => {
    const heights = [10, 10];
    const index = new PrefixSumHeightIndex(heights.length, (i) => heights[i]!);
    expect(index.totalHeight).toBe(20);

    heights[0] = 5;
    heights[1] = 5;
    index.invalidateFrom(0);

    expect(index.totalHeight).toBe(10);
  });

  it('a later invalidateFrom does not resurrect an earlier, still-pending invalidation', () => {
    const heights = [10, 10, 10];
    const index = new PrefixSumHeightIndex(heights.length, (i) => heights[i]!);
    index.invalidateFrom(0);
    index.invalidateFrom(2); // less aggressive than the pending invalidation at 0 — must not widen the cache
    heights[0] = 1;
    expect(index.topAt(2)).toBe(11);
  });
});
