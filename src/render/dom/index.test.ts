import { describe, expect, it } from 'vitest';
import { createDomBackend } from './index.js';
import { computeFrame } from '../../layout/index.js';
import type { TimeScale, ViewPreset } from '../../layout/index.js';
import { sampleEntries } from '../../../fixtures/sample-project.js';

const scale: TimeScale = {
  range: sampleEntries[0]!,
  timeZone: 'UTC',
  xForInstant: () => 0,
  instantForX: () => sampleEntries[0]!.start,
  widthForDuration: () => 100,
  ticks: () => [{ instant: sampleEntries[0]!.start, x: 0, width: 24 }],
  contentWidth: 100,
};
const preset: ViewPreset = {
  id: 'none',
  tickUnit: 'd',
  tickIncrement: 1,
  headers: [{ unit: 'd', increment: 1, format: () => 'tick' }],
  tickWidthPx: 24,
};

describe('render/dom backend', () => {
  it('finds the item under a point via event delegation, not a materialized hit index (#31)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const backend = createDomBackend();
    backend.mount(host);

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    const bar = host.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    expect(backend.hitTest(5, 5)).toEqual({ itemId: frame.bars[0]!.id });
    expect(backend.hitTest(999, 999)).toBeNull();

    document.elementFromPoint = original;
    backend.destroy();
    host.remove();
  });

  it('renders rows and labels bars with the entry name, not its id (#26)', () => {
    const host = document.createElement('div');
    const backend = createDomBackend();
    backend.mount(host);

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    expect(host.querySelectorAll('.fg-row')).toHaveLength(2);
    expect(host.querySelector('.fg-row')?.textContent).toBe(sampleEntries[0]?.name);
    expect(host.querySelector('.fg-bar')?.textContent).toBe(sampleEntries[0]?.name);
    backend.destroy();
  });

  it('offsets the bar layer with a margin, not `left` (regression: `left` shifts the box without shrinking its auto width, overflowing the host by the row-label gutter — #9)', () => {
    const host = document.createElement('div');
    const backend = createDomBackend();
    backend.mount(host);

    // happy-dom does not resolve custom properties through getComputedStyle, so this backend
    // falls back to its default gutter width (ROW_LABEL_WIDTH_POLICY) — that fallback path is
    // exercised elsewhere; what matters here is which CSS property carries the offset.
    const barLayer = host.querySelector<HTMLElement>('.fg-bars')!;
    expect(barLayer.style.marginLeft).toBe(`${backend.rowLabelWidth}px`);
    expect(barLayer.style.left).toBe('');

    backend.destroy();
  });

  it('reconciles header ticks through the same keyed pattern as bars (#19)', () => {
    const host = document.createElement('div');
    const backend = createDomBackend();
    backend.mount(host);

    backend.sync(
      computeFrame({
        entries: [],
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
      }),
    );

    const ticks = host.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.textContent).toBe('tick');
    backend.destroy();
  });
});
