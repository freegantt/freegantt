import { describe, expect, it } from 'vitest';
import { Dataset } from 'freegantt';
import { bufferTrailsTask } from '../../harness/plugins/buffer-trails-task.js';
import type { BufferTrailsTaskProps } from '../../harness/plugins/buffer-trails-task.js';

function newDataset(): Dataset<BufferTrailsTaskProps> {
  return new Dataset<BufferTrailsTaskProps>({
    timeZone: 'UTC',
    entries: [
      { id: 'task', name: 'Task', start: '2026-10-01', end: '2026-10-03' },
      { id: 'buffer', name: 'Buffer', start: '2026-10-03', end: '2026-10-04', props: { bufferOf: 'task' } },
      { id: 'other', name: 'Other', start: '2026-10-10', end: '2026-10-12' },
    ],
    plugins: [bufferTrailsTask()],
  });
}

const dates = (dataset: Dataset<BufferTrailsTaskProps>, id: string) => {
  const entry = dataset.entries.get(id);
  return [entry?.start?.toString(), entry?.end?.toString()];
};

describe('bufferTrailsTask', () => {
  it('moves the buffer when the task end moves, keeps its length, and undoes both in one step', () => {
    const dataset = newDataset();
    const bufferBefore = dates(dataset, 'buffer');

    dataset.entries.update('task', { end: '2026-10-05' });

    expect(dataset.entries.get('buffer')?.start?.toString()).toBe(
      dataset.entries.get('task')?.end?.toString(),
    );
    expect(dataset.entries.get('buffer')?.end?.toString()).not.toBe(bufferBefore[1]);

    dataset.undo();

    expect(dates(dataset, 'buffer')).toEqual(bufferBefore);
    expect(dataset.entries.get('task')?.end?.toString()).not.toBe(
      dataset.entries.get('buffer')?.end?.toString(),
    );
  });

  it('leaves the buffer alone when the write does not touch the task end', () => {
    const dataset = newDataset();
    const bufferBefore = dates(dataset, 'buffer');

    dataset.entries.update('task', { name: 'Renamed' });
    dataset.entries.update('other', { end: '2026-10-20' });

    expect(dates(dataset, 'buffer')).toEqual(bufferBefore);
  });

  it('removes the buffer with its task, and one undo restores both', () => {
    const dataset = newDataset();

    dataset.entries.remove('task');

    expect(dataset.entries.has('buffer')).toBe(false);
    expect(dataset.entries.has('other')).toBe(true);

    dataset.undo();

    expect(dataset.entries.has('task')).toBe(true);
    expect(dataset.entries.has('buffer')).toBe(true);
  });
});
