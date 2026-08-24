import { describe, expect, it } from 'vitest';
import { computeFrame } from './frame.js';
import { sampleEntries } from '../../fixtures/sample-project.js';

const xForInstant = (i: number): number => i / 1000;

describe('computeFrame', () => {
  it('emits one row and one bar per entry, positioned by time (S0 scope)', () => {
    const frame = computeFrame({ entries: sampleEntries, xForInstant, rowHeight: 32, revision: 0 });
    expect(frame.rows).toHaveLength(sampleEntries.length);
    expect(frame.bars).toHaveLength(sampleEntries.length);
    expect(frame.rows[0]?.top).toBe(0);
    expect(frame.rows[1]?.top).toBe(32);
  });

  it('produces deterministic Item.id across repeated passes (I8)', () => {
    const first = computeFrame({ entries: sampleEntries, xForInstant, rowHeight: 32, revision: 0 });
    const second = computeFrame({ entries: sampleEntries, xForInstant, rowHeight: 32, revision: 1 });
    expect(first.bars.map((b) => b.id)).toEqual(second.bars.map((b) => b.id));
    expect(new Set(first.bars.map((b) => b.id)).size).toBe(sampleEntries.length);
  });

  it('matches the golden snapshot for the fixture project', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 3),
      xForInstant,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars).toMatchSnapshot();
  });
});
