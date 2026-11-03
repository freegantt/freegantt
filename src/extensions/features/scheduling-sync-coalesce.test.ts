import { describe, expect, it, vi } from 'vitest';

const engineRuns = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../api/schedule-facade.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/schedule-facade.js')>();
  return {
    ...original,
    schedule: (...args: Parameters<typeof original.schedule>) => {
      engineRuns.count += 1;
      return original.schedule(...args);
    },
  };
});

import { Dataset } from '../../api/dataset.js';
import type { Duration } from '../../model/index.js';
import { entryDependencies } from './entry-dependencies.js';
import { scheduling } from './scheduling.js';

const day = (offset: number): number => Date.UTC(2026, 0, 1 + offset);
const days = (value: number): Duration => ({ value, unit: 'day' });

const dependency = (id: string, fromId: string, toId: string) => ({
  id,
  fromId,
  toId,
  type: 'FS' as const,
  lag: days(0),
});

/** Runs `writes` in one turn and answers how many engine runs the plugin starts after the writes. */
async function runsAfter(
  writes: (dependencies: ReturnType<typeof entryDependencies>) => void,
): Promise<number> {
  const dependencies = entryDependencies();
  const dataset = new Dataset({
    entries: ['a', 'b', 'c'].map((id) => ({ id, name: id, start: day(0), end: day(1) })),
    timeZone: 'UTC',
    plugins: [dependencies, scheduling()],
  });
  await Promise.resolve();
  writes(dependencies);
  const afterWrites = engineRuns.count;
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  expect(dataset.entries.get('c')?.start).toBe(day(2));
  return engineRuns.count - afterWrites;
}

describe('scheduling() and several sync writes in one turn', () => {
  it('runs one push for all of them', async () => {
    const both = [dependency('d1', 'a', 'b'), dependency('d2', 'b', 'c')];

    const single = await runsAfter((dependencies) => dependencies.replaceAll(both));
    const several = await runsAfter((dependencies) => {
      dependencies.replaceAll([dependency('d1', 'a', 'b')]);
      dependencies.replaceAll(both);
    });

    expect(several).toBe(single);
  });
});
