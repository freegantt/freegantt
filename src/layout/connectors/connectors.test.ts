import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import { createTimeScale, dayPreset, instant } from '../../time/index.js';
import { BarIndex } from './bar-index.js';
import { routeConnector } from './route-connector.js';
import type { ConnectorAnchor } from './route-connector.js';
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
  it('puts a text anchor at the middle of the line only when the provider shows the label', () => {
    const shown = { ...finishToStart, label: 'A → B', showLabel: true };
    const hidden = { ...finishToStart, label: 'A → B' };

    expect(frameOf([() => [shown]]).connectors[0]?.labelAnchor).toEqual({ x: 1484, y: 48 });
    expect(frameOf([() => [hidden]]).connectors[0]?.labelAnchor).toBeUndefined();
    expect(
      frameOf([() => [{ ...finishToStart, showLabel: true }]]).connectors[0]?.labelAnchor,
    ).toBeUndefined();
  });

  it('is empty when no provider is registered', () => {
    expect(frameOf([]).connectors).toEqual([]);
  });

  it('routes a finish-to-start connector from bar edge to bar edge', () => {
    const [connector] = frameOf([() => [finishToStart]]).connectors;
    expect(connector?.id).toBe('related:ab');
    expect(connector?.path).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 1012, y: 16 },
      { cmd: 'L', x: 1012, y: 48 },
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

describe('connector route shapes', () => {
  /** Four rows. `a` and `d` sit at the left, and the middle rows hold bars far to the right. */
  const rows = entryDoubles([
    { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
    { id: 'm1', name: 'M1', start: 5 * MS_PER_BAR, end: 6 * MS_PER_BAR },
    { id: 'm2', name: 'M2', start: 5 * MS_PER_BAR, end: 6 * MS_PER_BAR },
    { id: 'd', name: 'D', start: MS_PER_BAR / 2, end: 3 * MS_PER_BAR },
  ]);
  const pathOf = (from: ConnectorInput['from'], to: ConnectorInput['to']) =>
    frameOf([() => [{ id: 'c', from, to }]], { entries: rows }).connectors[0]?.path;
  const end = (id: string) => ({ entryId: entryId(id), edge: 'end' as const });
  const start = (id: string) => ({ entryId: entryId(id), edge: 'start' as const });

  it('runs a backward finish-to-start along the near gap of the target row, going down', () => {
    expect(pathOf(end('a'), start('d'))).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 1012, y: 16 },
      { cmd: 'L', x: 1012, y: 96 },
      { cmd: 'L', x: 488, y: 96 },
      { cmd: 'L', x: 488, y: 112 },
      { cmd: 'L', x: 500, y: 112 },
    ]);
  });

  it('runs a backward finish-to-start along the near gap of the target row, going up', () => {
    expect(pathOf(end('d'), start('a'))).toEqual([
      { cmd: 'M', x: 3000, y: 112 },
      { cmd: 'L', x: 3012, y: 112 },
      { cmd: 'L', x: 3012, y: 32 },
      { cmd: 'L', x: -12, y: 32 },
      { cmd: 'L', x: -12, y: 16 },
      { cmd: 'L', x: 0, y: 16 },
    ]);
  });

  it('keeps the adjacent-row backward route on the shared gap', () => {
    const adjacent = entryDoubles([
      { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
      { id: 'e', name: 'E', start: 0, end: MS_PER_BAR / 2 },
    ]);
    const [connector] = frameOf([() => [{ id: 'c', from: end('a'), to: start('e') }]], {
      entries: adjacent,
    }).connectors;
    expect(connector?.path).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 1012, y: 16 },
      { cmd: 'L', x: 1012, y: 32 },
      { cmd: 'L', x: -12, y: 32 },
      { cmd: 'L', x: -12, y: 48 },
      { cmd: 'L', x: 0, y: 48 },
    ]);
  });

  it('draws start-to-start with one vertical left of both bars', () => {
    expect(pathOf(start('a'), start('d'))).toEqual([
      { cmd: 'M', x: 0, y: 16 },
      { cmd: 'L', x: -12, y: 16 },
      { cmd: 'L', x: -12, y: 112 },
      { cmd: 'L', x: 500, y: 112 },
    ]);
  });

  it('draws finish-to-finish with one vertical right of both bars', () => {
    expect(pathOf(end('a'), end('d'))).toEqual([
      { cmd: 'M', x: 1000, y: 16 },
      { cmd: 'L', x: 3012, y: 16 },
      { cmd: 'L', x: 3012, y: 112 },
      { cmd: 'L', x: 3000, y: 112 },
    ]);
  });

  it('loops below the row when both ends sit on one row and the target lies behind', () => {
    const segmented = entryDoubles([
      { id: 'row', name: 'Row', start: 0, end: 3 * MS_PER_BAR },
      { id: 's1', name: 'S1', parentId: 'row', start: 0, end: MS_PER_BAR },
      { id: 's2', name: 'S2', parentId: 'row', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const [connector] = frameOf([() => [{ id: 'c', from: end('s2'), to: start('s1') }]], {
      entries: segmented,
      rows: { source: 'entries', childrenAsSegments: true },
    }).connectors;
    expect(connector?.path).toEqual([
      { cmd: 'M', x: 3000, y: 16 },
      { cmd: 'L', x: 3012, y: 16 },
      { cmd: 'L', x: 3012, y: 32 },
      { cmd: 'L', x: -12, y: 32 },
      { cmd: 'L', x: -12, y: 16 },
      { cmd: 'L', x: 0, y: 16 },
    ]);
  });
});

describe('routeConnector property', () => {
  const ROW = 32;
  const anchor = fc
    .record({
      x: fc.integer({ min: -500, max: 500 }),
      row: fc.integer({ min: 0, max: 6 }),
      edge: fc.constantFrom('start' as const, 'end' as const),
    })
    .map(({ x, row, edge }): ConnectorAnchor => ({
      x,
      y: row * ROW + ROW / 2,
      edge,
      rowIndex: row,
      rowTop: row * ROW,
      rowBottom: row * ROW + ROW,
    }));

  it('is orthogonal and joins the source anchor to the target anchor', () => {
    fc.assert(
      fc.property(anchor, anchor, (from, to) => {
        const points = routeConnector(from, to);
        expect(points[0]).toEqual({ x: from.x, y: from.y });
        expect(points.at(-1)).toEqual({ x: to.x, y: to.y });
        points.slice(1).forEach((point, index) => {
          const before = points[index]!;
          expect(point.x === before.x || point.y === before.y).toBe(true);
        });
      }),
    );
  });
});

describe('bars in the way of a vertical', () => {
  const bars = (byRow: Record<number, [number, number][]>) =>
    new BarIndex((row) => (byRow[row] ?? []).map(([left, right]) => ({ left, right })), 200);
  const ask = (index: BarIndex, preferredX: number, minX: number, maxX: number) =>
    index.freeX({ fromRow: 0, toRow: 4, preferredX, minX, maxX });

  it('keeps the default x when no row between holds a bar there', () => {
    expect(ask(bars({ 2: [[100, 200]] }), 50, 0, 90)).toBe(50);
  });

  it('moves to the nearest free x, with 2 px of air beside the bar', () => {
    const index = bars({ 2: [[40, 60]] });
    expect(ask(index, 55, 0, 100)).toBe(62);
    expect(ask(index, 45, 0, 100)).toBe(38);
  });

  it('hops over bars that touch in different rows', () => {
    expect(ask(bars({ 1: [[40, 60]], 3: [[60, 80]] }), 50, 0, 200)).toBe(38);
  });

  it('keeps the default x when no x in the range is free', () => {
    expect(ask(bars({ 2: [[0, 200]] }), 50, 40, 60)).toBe(50);
  });

  it('ignores the rows of the two ends', () => {
    expect(ask(bars({ 0: [[0, 200]], 4: [[0, 200]] }), 50, 0, 90)).toBe(50);
  });

  it('keeps the default x for a vertical over more rows than the cap', () => {
    const capped = new BarIndex(() => [{ left: 40, right: 60 }], 2);
    expect(capped.freeX({ fromRow: 0, toRow: 4, preferredX: 50, minX: 0, maxX: 100 })).toBe(50);
    expect(capped.freeX({ fromRow: 0, toRow: 3, preferredX: 55, minX: 0, maxX: 100 })).toBe(62);
  });

  it('draws a forward connector beside a bar that stands on its vertical', () => {
    // `a` ends at 1000 on row 0, `b` starts at 2000 on row 3. `x` sits on x 1006–1050 in row 1.
    const crowded = entryDoubles([
      { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
      { id: 'x', name: 'X', start: 1.006 * MS_PER_BAR, end: 1.05 * MS_PER_BAR },
      { id: 'y', name: 'Y', start: 8 * MS_PER_BAR, end: 9 * MS_PER_BAR },
      { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const connector = (avoid: boolean) =>
      frameOf([() => [{ ...finishToStart, to: { entryId: entryId('b'), edge: 'start' } }]], {
        entries: crowded,
        connectorRouting: { avoidBars: avoid },
      }).connectors[0]?.path;
    expect(connector(false)?.[1]).toEqual({ cmd: 'L', x: 1012, y: 16 });
    expect(connector(true)?.[1]).toEqual({ cmd: 'L', x: 1052, y: 16 });
  });

  it('leaves a connector alone when the option turns avoidance off', () => {
    const crowded = entryDoubles([
      { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
      { id: 'x', name: 'X', start: 1.006 * MS_PER_BAR, end: 1.05 * MS_PER_BAR },
      { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const path = frameOf([() => [{ ...finishToStart, to: { entryId: entryId('b'), edge: 'start' } }]], {
      entries: crowded,
      connectorRouting: { avoidBars: false },
    }).connectors[0]?.path;
    expect(path?.[1]).toEqual({ cmd: 'L', x: 1012, y: 16 });
  });

  it('reroutes when the routing option changes on the same dataset', () => {
    const crowded = entryDoubles([
      { id: 'a', name: 'A', start: 0, end: MS_PER_BAR },
      { id: 'x', name: 'X', start: 1.006 * MS_PER_BAR, end: 1.05 * MS_PER_BAR },
      { id: 'b', name: 'B', start: 2 * MS_PER_BAR, end: 3 * MS_PER_BAR },
    ]);
    const providers = [() => [{ ...finishToStart, to: { entryId: entryId('b'), edge: 'start' as const } }]];
    const layout = new FrameLayout();
    const on = frameOf(providers, { entries: crowded }, layout).connectors[0]?.path[1];
    const off = frameOf(
      providers,
      { entries: crowded, connectorRouting: { avoidBars: false }, revision: 1 },
      layout,
    ).connectors[0]?.path[1];
    expect(on).toEqual({ cmd: 'L', x: 1052, y: 16 });
    expect(off).toEqual({ cmd: 'L', x: 1012, y: 16 });
  });
});
