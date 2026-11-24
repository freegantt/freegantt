import { describe, expect, it } from 'vitest';
import { RowLayoutWatch } from './row-layout-watch.js';

const stamp = (planRevision: number, rowCount: number, contentHeight: number, heightIndexRevision = 0) => ({
  planRevision,
  rowCount,
  contentHeight,
  heightIndexRevision,
});

describe('RowLayoutWatch', () => {
  it('sets the baseline on the first frame without telling anyone', () => {
    const watch = new RowLayoutWatch(() => {});
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
    const watch = new RowLayoutWatch(() => {});
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    watch.settle(next);
    expect(calls).toBe(1);
  });

  it('stays quiet when a frame holds the same rows', () => {
    const watch = new RowLayoutWatch(() => {});
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    watch.settle(stamp(1, 3, 96));
    expect(calls).toBe(0);
  });

  it('stops telling a listener after its disposer runs', () => {
    const watch = new RowLayoutWatch(() => {});
    let calls = 0;
    const stop = watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    stop();
    watch.settle(stamp(2, 3, 96));
    expect(calls).toBe(0);
  });

  it('reports a listener that throws and still tells the others', () => {
    const failures: unknown[] = [];
    const watch = new RowLayoutWatch((error) => failures.push(error));
    const boom = new Error('boom');
    let calls = 0;
    watch.onChange(() => {
      throw boom;
    });
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96));
    expect(() => watch.settle(stamp(2, 3, 96))).not.toThrow();
    expect(calls).toBe(1);
    expect(failures).toEqual([boom]);
  });

  it('tells listeners when only the height index moved, as a Row detail swap does', () => {
    const watch = new RowLayoutWatch(() => {});
    let calls = 0;
    watch.onChange(() => (calls += 1));
    watch.settle(stamp(1, 3, 96, 1));
    watch.settle(stamp(1, 3, 96, 2));
    expect(calls).toBe(1);
  });
});
