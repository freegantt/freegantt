import { describe, expect, it } from 'vitest';
import { barId, entryId } from '../../model/index.js';
import { createTimeScale, dayPreset, instant } from '../../time/index.js';
import { createVariantRegistry } from '../bars/variants.js';
import type { BarPreview } from '../bar-preview.js';
import type { ConnectorInput } from '../connector-input.js';
import { entryDoubles } from '../entry-double.js';
import { FrameLayout } from '../frame-layout.js';
import type { LayoutInput } from '../frame.js';

// 0.001 px per ms: one million ms is one thousand px, so every number below reads as pixels.
const MS_PER_BAR = 1_000_000;
const scale = createTimeScale({
  timeZone: 'UTC',
  range: { start: instant(0), end: instant(10 * MS_PER_BAR) },
  pxPerMs: 0.001,
});
const variants = createVariantRegistry({ fieldFor: () => undefined });
const EVERYTHING = { x: 0, y: 0, width: 0, height: 0 };

/** `a` spans 0–1000px on row 0, `b` spans 2000–3000px on row 1, `c` spans 4000–5000px on row 2. */
const entries = entryDoubles([
  { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
  { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
  { id: 'c', name: 'C', start: 4 * MS_PER_BAR, end: 5 * MS_PER_BAR },
]);
const aToB: ConnectorInput = {
  id: 'a-b',
  from: { entryId: entryId('a'), edge: 'end' },
  to: { entryId: entryId('b'), edge: 'start' },
};
const bToC: ConnectorInput = {
  id: 'b-c',
  from: { entryId: entryId('b'), edge: 'end' },
  to: { entryId: entryId('c'), edge: 'start' },
};

// One array for every frame: a new array asks the providers again and routes every connector again.
const providers = [() => [aToB, bToC]];

function previewOf(id: string, change: Partial<BarPreview>): BarPreview {
  return {
    entryId: entryId(id),
    barId: barId(entryId(id)),
    dx: 0,
    dy: 0,
    dWidth: 0,
    extra: false,
    ...change,
  };
}

function connectorsOf(barPreviews: readonly BarPreview[] | undefined, layout = new FrameLayout()) {
  const input: LayoutInput = {
    entries,
    scale,
    preset: dayPreset,
    visible: EVERYTHING,
    rowHeight: 32,
    revision: 0,
    datasetRevision: 0,
    variants,
    connectorProviders: providers,
    ...(barPreviews !== undefined ? { barPreviews } : {}),
  };
  return layout.computeFrame(input).connectors;
}

const startOf = (path: readonly { x: number; y: number }[]) => path[0];
const endOf = (path: readonly { x: number; y: number }[]) => path[path.length - 1];

describe('connectors follow a drag preview', () => {
  it('anchors both ends of a moved Entry on its previewed bar edges', () => {
    const connectors = connectorsOf([previewOf('b', { dx: 500 })]);
    const [ab, bc] = connectors;
    expect(endOf(ab!.path)).toMatchObject({ x: 2500, y: 48 });
    expect(startOf(bc!.path)).toMatchObject({ x: 3500, y: 48 });
  });

  it('follows the dragged Entry and each pushed successor', () => {
    const connectors = connectorsOf([previewOf('a', { dx: 300 }), previewOf('b', { dx: 300, extra: true })]);
    const [ab, bc] = connectors;
    expect(startOf(ab!.path)).toMatchObject({ x: 1300 });
    expect(endOf(ab!.path)).toMatchObject({ x: 2300 });
    expect(startOf(bc!.path)).toMatchObject({ x: 3300 });
  });

  it('follows a resize on the edge that moves', () => {
    const [ab] = connectorsOf([previewOf('a', { dWidth: 250 })]);
    expect(startOf(ab!.path)).toMatchObject({ x: 1250 });
    expect(endOf(ab!.path)).toMatchObject({ x: 2000 });
  });

  it('follows a row move', () => {
    const [ab] = connectorsOf([previewOf('a', { dy: 32 })]);
    expect(startOf(ab!.path)).toMatchObject({ x: 1000, y: 48 });
  });

  it('keeps the cached route object of a connector with no moved end', () => {
    const layout = new FrameLayout();
    const committed = connectorsOf(undefined, layout);
    const previewed = connectorsOf([previewOf('c', { dx: 100 })], layout);
    expect(previewed[0]).toBe(committed[0]);
    expect(previewed[1]).not.toBe(committed[1]);
  });

  it('goes back to the committed routes when the preview ends', () => {
    const layout = new FrameLayout();
    const committed = connectorsOf(undefined, layout);
    connectorsOf([previewOf('a', { dx: 300 })], layout);
    expect(connectorsOf(undefined, layout)).toEqual(committed);
  });
});
