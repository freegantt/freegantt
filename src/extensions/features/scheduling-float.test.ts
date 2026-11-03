import { describe, expect, it } from 'vitest';
import { Dataset } from '../../api/dataset.js';
import { SchedulingNotInstalledError } from '../../model/index.js';
import type { Duration } from '../../model/index.js';
import { entryDependencies } from './entry-dependencies.js';
import type { DependencyInput } from './entry-dependencies.js';
import { scheduling } from './scheduling.js';

/** Midnight UTC of January 1 plus `offset` days. */
const day = (offset: number): number => Date.UTC(2026, 0, 1 + offset);
const days = (value: number): Duration => ({ value, unit: 'day' });

interface FloatProps {
  float?: number;
  critical?: boolean;
}

function link(id: string, fromId: string, toId: string): DependencyInput {
  return { id, fromId, toId, type: 'FS', lag: days(0) };
}

/** A(3d) then B(4d) or C(2d), then D(2d). B is the long branch, so C has two days of float. */
function network() {
  const dependencies = entryDependencies();
  const plugin = scheduling();
  const dataset = new Dataset<FloatProps>({
    entries: [
      { id: 'a', name: 'A', start: day(0), end: day(3) },
      { id: 'b', name: 'B', start: day(3), end: day(7) },
      { id: 'c', name: 'C', start: day(3), end: day(5) },
      { id: 'd', name: 'D', start: day(7), end: day(9) },
    ],
    timeZone: 'UTC',
    plugins: [dependencies, plugin],
  });
  dependencies.replaceAll([
    link('ab', 'a', 'b'),
    link('ac', 'a', 'c'),
    link('bd', 'b', 'd'),
    link('cd', 'c', 'd'),
  ]);
  return { dependencies, plugin, dataset };
}

const floatOf = (dataset: Dataset<FloatProps>, id: string): unknown => dataset.entries.get(id)?.read('float');
const criticalOf = (dataset: Dataset<FloatProps>, id: string): unknown =>
  dataset.entries.get(id)?.read('critical');
const settled = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

describe('scheduling() float', () => {
  it('fills float and critical for a Dataset as built, with no undo step', async () => {
    const { dataset } = network();
    await settled();
    expect(['a', 'b', 'c', 'd'].map((id) => floatOf(dataset, id))).toEqual([0, 0, 2, 0]);
    expect(['a', 'b', 'c', 'd'].map((id) => criticalOf(dataset, id))).toEqual([true, true, false, true]);
    expect(dataset.canUndo).toBe(false);
  });

  it('updates float when a Dependency is added or replaced', async () => {
    const { dataset, dependencies } = network();
    await settled();
    dependencies.replaceAll([link('ab', 'a', 'b'), link('bd', 'b', 'd')]);
    await settled();
    // C hangs free now, so it may start as late as day 7.
    expect(floatOf(dataset, 'c')).toBe(4);
  });

  it('writes float in the same change set as a date edit, and one undo restores both', () => {
    const { dataset } = network();
    return settled().then(() => {
      dataset.entries.update('c', { start: day(5), end: day(7) });
      expect(floatOf(dataset, 'c')).toBe(0);
      expect(criticalOf(dataset, 'c')).toBe(true);
      dataset.undo();
      expect(floatOf(dataset, 'c')).toBe(2);
      expect(criticalOf(dataset, 'c')).toBe(false);
    });
  });

  it('follows a successor push through the whole chain', async () => {
    const { dataset } = network();
    await settled();
    dataset.entries.update('c', { start: day(6), end: day(8) });
    // D now starts after C, so B is the branch with float.
    expect(floatOf(dataset, 'b')).toBe(1);
    expect(floatOf(dataset, 'c')).toBe(0);
  });

  it('never gives a summary Entry a float', async () => {
    const dependencies = entryDependencies();
    const dataset = new Dataset<FloatProps>({
      entries: [
        { id: 'g', name: 'G', start: day(0), end: day(5) },
        { id: 'x', name: 'X', parentId: 'g', start: day(0), end: day(5) },
      ],
      timeZone: 'UTC',
      plugins: [dependencies, scheduling()],
    });
    await settled();
    expect(floatOf(dataset, 'g')).toBeUndefined();
    expect(floatOf(dataset, 'x')).toBe(0);
  });
});

describe('scheduling().drivingPath', () => {
  it('lists the chain that holds the Entry in place, the Entry last', () => {
    const { plugin } = network();
    expect(plugin.drivingPath('d')).toEqual(['a', 'b', 'd']);
    expect(plugin.drivingPath('c')).toEqual(['a', 'c']);
  });

  it('refuses to run before the plugin is installed', () => {
    expect(() => scheduling().drivingPath('a')).toThrow(SchedulingNotInstalledError);
  });
});
