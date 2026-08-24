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
  ticks: () => [{ instant: sampleEntries[0]!.start, x: 0 }],
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
      viewport: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    const bar = host.querySelector<HTMLElement>('.fg-bar')!;
    const rect = { left: 0, top: 0, width: 100, height: 32, right: 100, bottom: 32 } as DOMRect;
    bar.getBoundingClientRect = () => rect;
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
      viewport: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    expect(host.querySelectorAll('.fg-row')).toHaveLength(2);
    expect(host.querySelector('.fg-row')?.textContent).toBe(sampleEntries[0]?.name);
    expect(host.querySelector('.fg-bar')?.textContent).toBe(sampleEntries[0]?.name);
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
        viewport: { x: 0, y: 0, width: 0, height: 0 },
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
