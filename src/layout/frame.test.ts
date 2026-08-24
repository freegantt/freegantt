import { describe, expect, it } from 'vitest';
import { computeFrame } from './frame.js';
import { sampleEntries } from '../../fixtures/sample-project.js';
import { createTimeScale, dayPreset } from '../time/index.js';

const scale = createTimeScale({ timeZone: 'UTC', range: sampleEntries[0]!, pxPerMs: 1 / 1000 });
const preset = dayPreset;
const viewport = { x: 0, y: 0, width: 0, height: 0 };

describe('computeFrame', () => {
  it('emits one row and one bar per entry, positioned by time (S0 scope)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.rows).toHaveLength(sampleEntries.length);
    expect(frame.bars).toHaveLength(sampleEntries.length);
    expect(frame.rows[0]?.top).toBe(0);
    expect(frame.rows[1]?.top).toBe(32);
  });

  it('produces deterministic Item.id across repeated passes (I8)', () => {
    const first = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 0,
    });
    const second = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 1,
    });
    expect(first.bars.map((b) => b.id)).toEqual(second.bars.map((b) => b.id));
    expect(new Set(first.bars.map((b) => b.id)).size).toBe(sampleEntries.length);
  });

  it('labels bars and rows with the entry name, not its id (#26)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars[0]?.label).toBe(sampleEntries[0]?.name);
    expect(frame.rows[0]?.label).toBe(sampleEntries[0]?.name);
  });

  it('culls rows outside the vertical viewport window (#20)', () => {
    const windowed = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport: { x: 0, y: 32, width: 0, height: 32 },
      rowHeight: 32,
      revision: 0,
    });
    expect(windowed.rows.map((r) => r.index)).toEqual([1]);
    // contentHeight still covers every row, from the height index — not just the windowed ones.
    expect(windowed.contentHeight).toBe(sampleEntries.length * 32);
  });

  it('emits header ticks through the render seam, not around it (#19)', () => {
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.header.ticks.length).toBeGreaterThan(0);
    expect(frame.header.ticks[0]).toHaveProperty('x');
    expect(frame.header.ticks[0]).toHaveProperty('label');
  });

  it('matches the golden snapshot for the fixture project', () => {
    const frame = computeFrame({
      entries: sampleEntries.slice(0, 3),
      scale,
      preset,
      viewport,
      rowHeight: 32,
      revision: 0,
    });
    expect(frame.bars).toMatchSnapshot();
  });
});
