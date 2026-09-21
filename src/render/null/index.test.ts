import { describe, expect, it } from 'vitest';
import { createNullBackend } from './index.js';
import { computeFrame, createVariantRegistry } from '../../layout/index.js';
import type { TimeScale, ViewPreset } from '../../layout/index.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';

// render/ only imports layout/ (plans/01 §1), which type-exports TimeScale/ViewPreset but not the
// runtime time/ constructors — so this fake stands in rather than reaching past the boundary.
const scale: TimeScale = {
  range: { start: sampleEntries[0]!.start!, end: sampleEntries[0]!.end! },
  timeZone: 'UTC',
  pxPerMs: 1,
  xForInstant: () => 0,
  instantForX: () => sampleEntries[0]!.start!,
  widthForDuration: () => 0,
  ticks: () => [],
  spanForPixels: () => ({ start: sampleEntries[0]!.start!, end: sampleEntries[0]!.start! }),
  // Infinity, not 0 (#436): this smoke test only checks that a frame round-trips through the null
  // backend, not that bars sit inside a pane — a real 0-width pane correctly paints no bars at all
  // (barSpan caps a floored bar's width at contentWidth), which this stub does not mean to exercise.
  contentWidth: Number.POSITIVE_INFINITY,
};
const preset: ViewPreset = {
  id: 'none',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [],
  preferredTickWidthPx: 24,
};

describe('null render backend', () => {
  it('consumes a frame in Node with no DOM', () => {
    const backend = createNullBackend();
    const frame = computeFrame({
      entries: sampleEntries,
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
      datasetRevision: 0,
      variants: createVariantRegistry({ fieldFor: () => undefined }),
    });
    backend.mount({ grid: undefined, timeline: undefined });
    backend.sync(frame);
    expect(backend.lastFrame()?.bars).toHaveLength(sampleEntries.length);
    backend.destroy();
    expect(backend.lastFrame()).toBeUndefined();
  });
});
