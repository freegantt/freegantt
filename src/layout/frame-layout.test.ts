import { describe, expect, it, vi } from 'vitest';
import { computeFrame } from './frame.js';
import { FrameLayout } from './frame-layout.js';
import { sampleEntries } from '../../fixtures/sample-dataset.js';
import { createTimeScale, dayPreset } from '../time/index.js';

// FrameLayout exists to keep ONE row-height index alive across a Gantt's renders (#47), so what has
// to be tested is how often it builds one. Counting constructions is the only observation of that:
// the index is private, exactly as it should be.
const built = vi.hoisted(() => ({ count: 0 }));
vi.mock('./row-height-index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./row-height-index.js')>();
  return {
    ...actual,
    PrefixSumHeightIndex: class extends actual.PrefixSumHeightIndex {
      constructor(count: number, getHeight: (index: number) => number) {
        built.count++;
        super(count, getHeight);
      }
    },
  };
});

const scale = createTimeScale({ timeZone: 'UTC', range: sampleEntries[0]!, pxPerMs: 1 / 1000 });
const preset = dayPreset;
const visible = { x: 0, y: 0, width: 0, height: 0 };

function input(overrides: { entries?: readonly (typeof sampleEntries)[number][]; rowHeight?: number } = {}) {
  return {
    entries: overrides.entries ?? sampleEntries,
    scale,
    preset,
    visible,
    rowHeight: overrides.rowHeight ?? 32,
    revision: 0,
  };
}

describe('FrameLayout', () => {
  it('builds the row-height index once and reuses it across renders', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input());
    layout.computeFrame(input());
    layout.computeFrame(input());

    expect(built.count).toBe(1);
  });

  it('rebuilds the index when the row height changes, and the frame follows the new height', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input());
    const taller = layout.computeFrame(input({ rowHeight: 50 }));

    expect(built.count).toBe(2);
    expect(taller.rows[1]?.top).toBe(50);
  });

  it('rebuilds the index when the row count changes, and the new rows are positioned', () => {
    built.count = 0;
    const layout = new FrameLayout();

    layout.computeFrame(input({ entries: sampleEntries.slice(0, 2) }));
    const grown = layout.computeFrame(input());

    expect(built.count).toBe(2);
    expect(grown.rows).toHaveLength(sampleEntries.length);
    expect(grown.rows[2]?.top).toBe(64);
  });

  it('produces exactly what computeFrame produces for the same input', () => {
    const layout = new FrameLayout();
    expect(layout.computeFrame(input())).toEqual(computeFrame(input()));
  });

  it('rowTop(index) matches the row top computeFrame reports for the same index', () => {
    const layout = new FrameLayout();
    const frame = layout.computeFrame(input());

    for (const [index, row] of frame.rows.entries()) {
      expect(layout.rowTop(index)).toBe(row.top);
    }
  });
});
