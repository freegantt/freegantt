import { describe, expect, it } from 'vitest';
import { createDomBackend } from './index.js';
import { computeFrame } from '../../layout/index.js';
import type { TimeScale, ViewPreset } from '../../layout/index.js';
import { sampleEntries } from '../../../fixtures/sample-dataset.js';

const scale: TimeScale = {
  range: sampleEntries[0]!,
  timeZone: 'UTC',
  pxPerMs: 1,
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

function mountSurfaces(): { grid: HTMLElement; timeline: HTMLElement } {
  const grid = document.createElement('div');
  const timeline = document.createElement('div');
  document.body.append(grid, timeline);
  return { grid, timeline };
}

describe('render/dom backend', () => {
  it('finds the item under a point via event delegation, not a materialized hit index (#31)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = (x: number, y: number) => (x === 5 && y === 5 ? bar : original(x, y));

    expect(backend.hitTest(5, 5)).toEqual({ itemId: frame.bars[0]!.id });
    expect(backend.hitTest(999, 999)).toBeNull();

    document.elementFromPoint = original;
    backend.destroy();
    grid.remove();
    timeline.remove();
  });

  it('renders rows and labels bars with the entry name, not its id (#26)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 2),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    expect(grid.querySelectorAll('.fg-row')).toHaveLength(2);
    expect(grid.querySelector('.fg-row')?.textContent).toBe(sampleEntries[0]?.name);
    expect(timeline.querySelector('.fg-bar')?.textContent).toBe(sampleEntries[0]?.name);
    backend.destroy();
  });

  it('puts row labels in the grid surface and ticks/bars/the sizer in the timeline surface, with no gutter offset (S1.8, D-S1.8-2)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
      }),
    );

    expect(grid.querySelector('.fg-row')).not.toBeNull();
    expect(grid.querySelector('.fg-bar')).toBeNull();
    expect(timeline.querySelector('.fg-bar')).not.toBeNull();
    expect(timeline.querySelector('.fg-header')).not.toBeNull();
    // No margin-left gutter anywhere — the gutter is the grid pane's own width now, not a backend offset.
    const barLayer = timeline.querySelector<HTMLElement>('.fg-bars')!;
    expect(barLayer.style.marginLeft).toBe('');

    backend.destroy();
  });

  it("writes the grid row layer's own translateY(-visible.y) each frame (D-S1.8-1)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 40, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
      }),
    );

    expect(grid.style.transform).toBe('translateY(-40px)');
    backend.destroy();
  });

  it('reconciles header ticks through the same keyed pattern as bars (#19)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

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

    const ticks = timeline.querySelectorAll('.fg-header .fg-tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.textContent).toBe('tick');
    backend.destroy();
  });

  it("renders data-flag from a bar's BarFlags keys, generated not hand-mapped (S1.10, D-S1.10-2, U7)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    // computeFrame never sets a flag true today (no scheduling plugin wired yet) — mutate the frame's
    // own bar object, same shape a future scheduling plugin would produce, to prove the generator path.
    (frame.bars[0]!.flags as Record<string, boolean>)['conflict'] = true;
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['flag']).toBe('conflict');
    backend.destroy();
  });

  it('renders a third, hypothetical BarFlags key with no render/dom change (drives the generated path, U7)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    (frame.bars[0]!.flags as Record<string, boolean>)['late'] = true;
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['flag']).toBe('late');
    backend.destroy();
  });

  it('gives .fg-row one .fg-row-label child carrying the row label text (D-S1.10-7)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    backend.sync(
      computeFrame({
        entries: sampleEntries.slice(0, 1),
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 0 },
        rowHeight: 32,
        revision: 0,
      }),
    );

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    const labels = row.querySelectorAll('.fg-row-label');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe(sampleEntries[0]?.name);
    backend.destroy();
  });

  it("stamps .fg-row's aria-posinset/aria-setsize from the frame's absolute row index and total row count, not the windowed count (D-S1.10-5)", () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    // A dataset larger than the window: rowHeight * entries.length exceeds the visible slice, so
    // rows[].index runs ahead of the windowed row count while frame.rowCount stays the full total.
    backend.sync(
      computeFrame({
        entries: sampleEntries,
        scale,
        preset,
        visible: { x: 0, y: 0, width: 0, height: 32 },
        rowHeight: 32,
        revision: 0,
      }),
    );

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.getAttribute('aria-posinset')).toBe('1');
    expect(row.getAttribute('aria-setsize')).toBe(String(sampleEntries.length));
    backend.destroy();
  });

  it('gives .fg-bar role="img" and its a11yLabel, not role="gridcell" (D-S1.10-5, revised)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toBe(frame.bars[0]!.a11yLabel);
    backend.destroy();
  });

  it('gives .fg-row role="listitem" and data-testid/data-row-id, .fg-bar data-testid alongside data-item-id (U6)', () => {
    const backend = createDomBackend();
    const { grid, timeline } = mountSurfaces();
    backend.mount({ grid, timeline });

    const frame = computeFrame({
      entries: sampleEntries.slice(0, 1),
      scale,
      preset,
      visible: { x: 0, y: 0, width: 0, height: 0 },
      rowHeight: 32,
      revision: 0,
    });
    backend.sync(frame);

    const row = grid.querySelector<HTMLElement>('.fg-row')!;
    expect(row.getAttribute('role')).toBe('listitem');
    expect(row.dataset['testid']).toBe('fg-row');
    expect(row.dataset['rowId']).toBe(frame.rows[0]!.id);

    const bar = timeline.querySelector<HTMLElement>('.fg-bar')!;
    expect(bar.dataset['testid']).toBe('fg-bar');
    expect(bar.dataset['itemId']).toBe(frame.bars[0]!.id);
    backend.destroy();
  });
});
