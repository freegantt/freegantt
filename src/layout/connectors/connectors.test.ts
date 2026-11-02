import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import { createTimeScale, dayPreset, instant } from '../../time/index.js';
import { entryDoubles } from '../entry-double.js';
import { createVariantRegistry } from '../bars/variants.js';
import { FrameLayout } from '../frame-layout.js';
import type { LayoutInput } from '../frame.js';
import type { ConnectorInput, ConnectorProvider } from '../connector-input.js';

// 0.001 px per ms: one million ms is one thousand px, so every number below reads as pixels.
const MS_PER_BAR = 1_000_000;
const scale = createTimeScale({
  timeZone: 'UTC',
  range: { start: instant(0), end: instant(10 * MS_PER_BAR) },
  pxPerMs: 0.001,
});
const variants = createVariantRegistry({ fieldFor: () => undefined });
const EVERYTHING = { x: 0, y: 0, width: 0, height: 0 };

/** Entry `a` spans 0–1000px on row 0, `b` spans 2000–3000px on row 1. */
const entries: readonly Entry[] = entryDoubles([
  { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
  { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
]);

const finishToStart: ConnectorInput = {
  id: 'related:ab',
  from: { entryId: entryId('a'), edge: 'end' },
  to: { entryId: entryId('b'), edge: 'start' },
};

function frameOf(
  providers: readonly ConnectorProvider[],
  overrides: Partial<LayoutInput> = {},
  layout = new FrameLayout(),
) {
  return layout.computeFrame({
    entries,
    scale,
    preset: dayPreset,
    visible: EVERYTHING,
    rowHeight: 32,
    revision: 0,
    datasetRevision: 0,
    variants,
    connectorProviders: providers,
    ...overrides,
  });
}

describe('connectors in the frame', () => {
  it('is empty when no provider is registered', () => {
    expect(frameOf([]).connectors).toEqual([]);
  });

  it('routes a finish-to-start connector from bar edge to bar edge', () => {
    const [connector] = frameOf([() => [finishToStart]]).connectors;
    expect(connector?.id).toBe('related:ab');
    expect(connector?.path).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 1008, y: 16 },
      { cmd: 'L', x: 1008, y: 48 },
      { cmd: 'L', x: 2000, y: 48 },
    ]);
  });

  it('runs along the row boundary when the target lies behind the source', () => {
    const backwards: ConnectorInput = {
      ...finishToStart,
      from: { entryId: entryId('b'), edge: 'end' },
      to: { entryId: entryId('a'), edge: 'start' },
    };
    const [connector] = frameOf([() => [backwards]]).connectors;
    expect(connector?.path[0]).toEqual({ cmd: 'M', x: 3000, y: 48 });
    expect(connector?.path.at(-1)).toEqual({ cmd: 'L', x: 0, y: 16 });
  });

  it('draws a connector whose ends are both outside the window but whose path crosses it', () => {
    const frame = frameOf([() => [finishToStart]], {
      visible: { x: 1500, y: 0, width: 100, height: 100 },
      overscan: { verticalRows: 0, horizontalPx: 0 },
    });
    expect(frame.bars).toHaveLength(0);
    expect(frame.connectors[0]?.path).toEqual([
      { cmd: 'M', x: 1500, y: 48 },
      { cmd: 'L', x: 1600, y: 48 },
    ]);
  });

  it('draws nothing when the path misses the window', () => {
    const frame = frameOf([() => [finishToStart]], {
      visible: { x: 5000, y: 0, width: 100, height: 100 },
      overscan: { verticalRows: 0, horizontalPx: 0 },
    });
    expect(frame.connectors).toEqual([]);
  });

  it('property: a path that crosses the window always draws, with both ends outside it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1100, max: 1850 }), fc.integer({ min: 20, max: 140 }), (x, width) => {
        const frame = frameOf([() => [finishToStart]], {
          visible: { x, y: 0, width, height: 100 },
          overscan: { verticalRows: 0, horizontalPx: 0 },
        });
        expect(frame.connectors.map((c) => c.id)).toEqual(['related:ab']);
      }),
    );
  });

  it('draws nothing and raises no error for an end with no Entry', () => {
    const ghost: ConnectorInput = { ...finishToStart, to: { entryId: entryId('missing'), edge: 'start' } };
    expect(frameOf([() => [ghost]]).connectors).toEqual([]);
  });

  it('attaches an end inside a collapsed group to its nearest visible ancestor', () => {
    const tree = entryDoubles([
      { id: 'group', name: 'Group', start: 0, end: MS_PER_BAR },
      { id: 'inner', name: 'Inner', parentId: 'group', start: 0, end: MS_PER_BAR / 2 },
      { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const fromInner: ConnectorInput = { ...finishToStart, from: { entryId: entryId('inner'), edge: 'end' } };
    const open = frameOf([() => [fromInner]], { entries: tree });
    const collapsed = frameOf([() => [fromInner]], { entries: tree, collapsed: ['group'] });
    expect(open.connectors[0]?.path[0]).toEqual({ cmd: 'M', x: 500, y: 48 });
    expect(collapsed.connectors[0]?.path[0]).toEqual({ cmd: 'M', x: 1000, y: 16 });
  });

  it('lets the first provider own a shared id and lets a later one add only true flags', () => {
    const first: ConnectorProvider = () => [{ ...finishToStart, flags: { inactive: true }, label: 'first' }];
    const second: ConnectorProvider = () => [
      {
        ...finishToStart,
        from: { entryId: entryId('b'), edge: 'end' },
        flags: { inactive: false, cycle: true },
        label: 'second',
      },
    ];
    const connectors = frameOf([first, second]).connectors;
    expect(connectors).toHaveLength(1);
    expect(connectors[0]).toMatchObject({
      label: 'first',
      flags: { inactive: true, cycle: true },
      flagTokens: 'inactive cycle',
    });
    expect(connectors[0]?.path[0]).toEqual({ cmd: 'M', x: 1000, y: 16 });
  });

  it('reads the providers once per dataset revision, not once per scroll', () => {
    const provider = vi.fn<ConnectorProvider>(() => [finishToStart]);
    const providers = [provider];
    const layout = new FrameLayout();
    frameOf(providers, { visible: { x: 0, y: 0, width: 400, height: 100 } }, layout);
    frameOf(providers, { visible: { x: 300, y: 0, width: 400, height: 100 } }, layout);
    expect(provider).toHaveBeenCalledTimes(1);
    frameOf(providers, { datasetRevision: 1 }, layout);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('keeps the routed paths across a scroll', () => {
    const providers = [() => [finishToStart]];
    const layout = new FrameLayout();
    const left = frameOf(providers, { visible: { x: 0, y: 0, width: 5000, height: 100 } }, layout);
    const right = frameOf(
      providers,
      { visible: { x: 0, y: 0, width: 5000, height: 100 }, revision: 1 },
      layout,
    );
    expect(right.connectors).toBe(left.connectors);
  });

  it('draws one Bar per Entry on a segmented row, so a connector joins two segments', () => {
    const segmented = entryDoubles([
      { id: 'row', name: 'Row', start: 0, end: 3 * MS_PER_BAR },
      { id: 's1', name: 'S1', parentId: 'row', start: 0, end: MS_PER_BAR },
      { id: 's2', name: 'S2', parentId: 'row', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const frame = frameOf(
      [
        () => [
          {
            ...finishToStart,
            from: { entryId: entryId('s1'), edge: 'end' },
            to: { entryId: entryId('s2'), edge: 'start' },
          },
        ],
      ],
      { entries: segmented, rows: { source: 'entries', childrenAsSegments: true } },
    );
    expect(frame.bars.filter((bar) => bar.entryId === entryId('s1'))).toHaveLength(1);
    expect(frame.bars.filter((bar) => bar.entryId === entryId('s2'))).toHaveLength(1);
    expect(frame.connectors[0]?.path).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 2000, y: 16 },
    ]);
  });
});
