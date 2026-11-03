import { describe, expect, it } from 'vitest';
import { Dataset } from '../../api/dataset.js';
import type { Duration } from '../../model/index.js';
import { entryDependencies } from './entry-dependencies.js';
import type { DependencyInput } from './entry-dependencies.js';
import { scheduling } from './scheduling.js';
import type { SchedulingOptions } from './scheduling.js';

/** Midnight UTC of January 1 plus `offset` days. */
const day = (offset: number): number => Date.UTC(2026, 0, 1 + offset);
const days = (value: number): Duration => ({ value, unit: 'day' });

function finishToStart(id: string, fromId: string, toId: string): DependencyInput {
  return { id, fromId, toId, type: 'FS', lag: days(0) };
}

/** `a` runs day 0, `b` starts on day 0 too, `c` starts on day 5. No Dependency yet. */
function plan(options?: SchedulingOptions, manual = false) {
  const dependencies = entryDependencies();
  const dataset = new Dataset<{ manuallyScheduled: boolean }>({
    entries: [
      { id: 'a', name: 'a', start: day(0), end: day(1) },
      { id: 'b', name: 'b', start: day(0), end: day(1), props: { manuallyScheduled: manual } },
      { id: 'c', name: 'c', start: day(5), end: day(6) },
    ],
    timeZone: 'UTC',
    plugins: [dependencies, scheduling(options)],
  });
  return { dependencies, dataset };
}

const startOf = (dataset: Dataset<{ manuallyScheduled: boolean }>, id: string): number | undefined =>
  dataset.entries.get(id)?.start;

describe('scheduling() and a new Dependency', () => {
  it('pushes a successor that starts too early, in the same step as the link', () => {
    const { dependencies, dataset } = plan();

    dependencies.add(finishToStart('d1', 'a', 'b'));

    expect(startOf(dataset, 'b')).toBe(day(1));
  });

  it('pushes the followers of the successor too', () => {
    const { dependencies, dataset } = plan();
    dependencies.add({ ...finishToStart('d2', 'b', 'c'), lag: days(10) });
    const followerStart = startOf(dataset, 'c');

    dependencies.add({ ...finishToStart('d1', 'a', 'b'), lag: days(3) });

    expect(startOf(dataset, 'b')).toBe(day(4));
    expect(startOf(dataset, 'c')).toBe(day(15));
    expect(followerStart).toBe(day(11));
  });

  it('restores the link and the move with one undo', () => {
    const { dependencies, dataset } = plan();

    dependencies.add(finishToStart('d1', 'a', 'b'));
    dataset.undo();

    expect(dependencies.all()).toEqual([]);
    expect(startOf(dataset, 'b')).toBe(day(0));
    expect(dataset.canUndo).toBe(false);
  });

  it('leaves a successor that starts late enough where it is', () => {
    const { dependencies, dataset } = plan();

    dependencies.add(finishToStart('d1', 'a', 'c'));

    expect(startOf(dataset, 'c')).toBe(day(5));
  });

  it('keeps a manually scheduled successor where it is', () => {
    const { dependencies, dataset } = plan(undefined, true);

    dependencies.add(finishToStart('d1', 'a', 'b'));

    expect(startOf(dataset, 'b')).toBe(day(0));
  });

  it('moves nothing when a Dependency goes', () => {
    const { dependencies, dataset } = plan();
    dependencies.add(finishToStart('d1', 'a', 'b'));

    dependencies.remove('d1');

    expect(startOf(dataset, 'b')).toBe(day(1));
  });

  it('writes float in the same step, so one undo restores it', () => {
    const { dependencies, dataset } = plan();
    const floatBefore = dataset.entries.get('a')?.read('float');

    dependencies.add(finishToStart('d1', 'a', 'c'));
    const floatAfter = dataset.entries.get('a')?.read('float');
    dataset.undo();

    expect(floatAfter).not.toBe(floatBefore);
    expect(dataset.entries.get('a')?.read('float')).toBe(floatBefore);
  });

  it('pushes after replaceAll and records no undo step', async () => {
    const { dependencies, dataset } = plan();

    dependencies.replaceAll([finishToStart('d1', 'a', 'b')]);
    await Promise.resolve();

    expect(startOf(dataset, 'b')).toBe(day(1));
    expect(dataset.canUndo).toBe(false);
  });
});
