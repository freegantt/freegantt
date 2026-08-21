import { describe, expect, it } from 'vitest';
import { computeFrame } from './frame.js';
import { sampleTasks } from '../../fixtures/sample-project.js';

const xForInstant = (i: number): number => i / 1000;

describe('computeFrame', () => {
  it('emits one row and one bar per task, positioned by time (S0 scope)', () => {
    const frame = computeFrame({ tasks: sampleTasks, xForInstant, rowHeight: 32, revision: 0 });
    expect(frame.rows).toHaveLength(sampleTasks.length);
    expect(frame.bars).toHaveLength(sampleTasks.length);
    expect(frame.rows[0]?.top).toBe(0);
    expect(frame.rows[1]?.top).toBe(32);
  });

  it('produces deterministic Item.id across repeated passes (I8)', () => {
    const first = computeFrame({ tasks: sampleTasks, xForInstant, rowHeight: 32, revision: 0 });
    const second = computeFrame({ tasks: sampleTasks, xForInstant, rowHeight: 32, revision: 1 });
    expect(first.bars.map((b) => b.id)).toEqual(second.bars.map((b) => b.id));
    expect(new Set(first.bars.map((b) => b.id)).size).toBe(sampleTasks.length);
  });

  it('matches the golden snapshot for the fixture project', () => {
    const frame = computeFrame({ tasks: sampleTasks.slice(0, 3), xForInstant, rowHeight: 32, revision: 0 });
    expect(frame.bars).toMatchSnapshot();
  });
});
