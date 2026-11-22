import { describe, expect, it } from 'vitest';
import { RowLayoutWatch } from './row-layout-watch.js';

const stamp = (planRevision: number, rowCount: number, contentHeight: number) => ({
  planRevision,
  rowCount,
  contentHeight,
});

describe('RowLayoutWatch', () => {
  it('sets the baseline on the first frame without telling anyone', () => {
    const watch = new RowLayoutWatch();
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    expect(calls).toBe(0);
  });

  it.each([
    ['a new plan', stamp(2, 3, 96)],
    ['another row count', stamp(1, 4, 96)],
    ['another content height', stamp(1, 3, 120)],
  ])('tells listeners about %s', (_label, next) => {
    const watch = new RowLayoutWatch();
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    watch.settle(next);
    expect(calls).toBe(1);
  });

  it('stays quiet when a frame holds the same rows', () => {
    const watch = new RowLayoutWatch();
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    watch.settle(stamp(1, 3, 96));
    expect(calls).toBe(0);
  });

  it('stops telling a listener after its disposer runs', () => {
    const watch = new RowLayoutWatch();
    let calls = 0;
    const stop = watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    stop();
    watch.settle(stamp(2, 3, 96));
    expect(calls).toBe(0);
  });
});
