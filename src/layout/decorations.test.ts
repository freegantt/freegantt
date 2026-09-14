import { describe, expect, it, vi } from 'vitest';
import { rowId } from '../model/index.js';
import type { TimeSpan } from '../model/index.js';
import { addDays, createTimeScale, instant } from '../time/index.js';
import { DecorationRunner } from './decorations.js';
import type { RegisteredDecorationProvider, RunDecorationsInput } from './decorations.js';
import type { DecorationContext, DecorationProvider } from './decoration.js';
import type { FrameRow } from './frame-row.js';

const ZONE = 'UTC';
const start = instant('2026-06-15T00:00:00Z'); // Monday
const end = instant('2026-06-22T00:00:00Z');
const span: TimeSpan = { start, end };
const scale = createTimeScale({ timeZone: ZONE, range: { start, end }, pxPerMs: 0.001 });
const xForInstant = (at: Parameters<typeof scale.xForInstant>[0]): number => scale.xForInstant(at);
const dayEnd = addDays(ZONE, start, 1);

const row: FrameRow = {
  id: rowId('row-1'),
  kind: 'entry',
  index: 0,
  top: 0,
  height: 32,
  depth: 0,
  expandable: false,
  expanded: false,
  cells: [],
  entryIds: [],
  segmentIds: [],
};

function baseInput(providers: readonly RegisteredDecorationProvider[]): RunDecorationsInput {
  return { providers, span, rows: [row], timeZone: ZONE, tickUnit: 'day', tickIncrement: 1, xForInstant };
}

describe('DecorationRunner', () => {
  it('converts a rangeBand through the bound scale', () => {
    const runner = new DecorationRunner();
    const provider: DecorationProvider = () => [{ kind: 'rangeBand', start, end: dayEnd }];
    const result = runner.run(baseInput([{ layer: 'underBars', provider }]));
    expect(result.underBars).toEqual([
      { kind: 'rangeBand', x: xForInstant(start), width: xForInstant(dayEnd) },
    ]);
    expect(result.overBars).toEqual([]);
  });

  it('a class on the input reaches the resolved decoration', () => {
    const runner = new DecorationRunner();
    const provider: DecorationProvider = () => [{ kind: 'rangeBand', start, end: dayEnd, class: 'weekend' }];
    const result = runner.run(baseInput([{ layer: 'underBars', provider }]));
    expect(result.underBars[0]).toMatchObject({ class: 'weekend' });
  });

  it('sorts providers into underBars and overBars, kept as separate lists', () => {
    const runner = new DecorationRunner();
    const under: DecorationProvider = () => [{ kind: 'rowStripe', rowId: row.id }];
    const over: DecorationProvider = () => [{ kind: 'rowStripe', rowId: row.id, class: 'flag' }];
    const result = runner.run(
      baseInput([
        { layer: 'underBars', provider: under },
        { layer: 'overBars', provider: over },
      ]),
    );
    expect(result.underBars).toEqual([{ kind: 'rowStripe', rowId: row.id }]);
    expect(result.overBars).toEqual([{ kind: 'rowStripe', rowId: row.id, class: 'flag' }]);
  });

  it('passes the DecorationContext a bound ZonedTime and the window span/rows', () => {
    const runner = new DecorationRunner();
    let seen: DecorationContext | undefined;
    const provider: DecorationProvider = (ctx) => {
      seen = ctx;
      return [];
    };
    runner.run(baseInput([{ layer: 'underBars', provider }]));
    expect(seen?.span).toEqual(span);
    expect(seen?.rows).toEqual([row]);
    expect(seen?.time.zone).toBe(ZONE);
    expect(seen?.time.dayOfWeek(start)).toBe(1);
    expect(seen?.tickUnit).toBe('day');
    expect(seen?.tickIncrement).toBe(1);
  });

  it('recomputes when the tick step changes, with the same span, rows and scale', () => {
    const runner = new DecorationRunner();
    const provider = vi.fn<DecorationProvider>((ctx) =>
      ctx.tickUnit === 'day' ? [{ kind: 'rangeBand', start, end: dayEnd }] : [],
    );
    const providers: readonly RegisteredDecorationProvider[] = [{ layer: 'underBars', provider }];
    runner.run(baseInput(providers));
    const atWeek = runner.run({ ...baseInput(providers), tickUnit: 'week' });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(atWeek.underBars).toEqual([]);
  });

  it('recomputes when only the tick increment changes', () => {
    const runner = new DecorationRunner();
    const provider = vi.fn<DecorationProvider>(() => []);
    const providers: readonly RegisteredDecorationProvider[] = [{ layer: 'underBars', provider }];
    runner.run(baseInput(providers));
    runner.run({ ...baseInput(providers), tickIncrement: 2 });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('runs each provider once per window, memoizing an unchanged window', () => {
    const runner = new DecorationRunner();
    const provider = vi.fn<DecorationProvider>(() => []);
    const input = baseInput([{ layer: 'underBars', provider }]);
    runner.run(input);
    runner.run(input);
    runner.run({ ...input });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the window (span) actually changes', () => {
    const runner = new DecorationRunner();
    const provider = vi.fn<DecorationProvider>(() => []);
    const providers: readonly RegisteredDecorationProvider[] = [{ layer: 'underBars', provider }];
    runner.run(baseInput(providers));
    const movedSpan: TimeSpan = { start: addDays(ZONE, start, 1), end: addDays(ZONE, end, 1) };
    runner.run({ ...baseInput(providers), span: movedSpan });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('returns an empty result with no registered providers, doing no work', () => {
    const runner = new DecorationRunner();
    const result = runner.run(baseInput([]));
    expect(result).toEqual({ underBars: [], overBars: [] });
  });

  it('recomputes when a same-count provider list swaps in a different provider', () => {
    const runner = new DecorationRunner();
    const first = vi.fn<DecorationProvider>(() => [{ kind: 'rangeBand', start, end: dayEnd, class: 'a' }]);
    const second = vi.fn<DecorationProvider>(() => [{ kind: 'rangeBand', start, end: dayEnd, class: 'b' }]);
    runner.run(baseInput([{ layer: 'underBars', provider: first }]));
    const result = runner.run(baseInput([{ layer: 'underBars', provider: second }]));
    expect(second).toHaveBeenCalledTimes(1);
    expect(result.underBars).toEqual([
      { kind: 'rangeBand', x: xForInstant(start), width: xForInstant(dayEnd), class: 'b' },
    ]);
  });

  it('recomputes once the bound scale changes, even with the same span and row set', () => {
    const runner = new DecorationRunner();
    const provider: DecorationProvider = () => [{ kind: 'rangeBand', start, end: dayEnd }];
    runner.run(baseInput([{ layer: 'underBars', provider }]));
    const rescaled = createTimeScale({ timeZone: ZONE, range: { start, end }, pxPerMs: 0.002 });
    const result = runner.run({
      ...baseInput([{ layer: 'underBars', provider }]),
      xForInstant: (at) => rescaled.xForInstant(at),
    });
    expect(result.underBars).toEqual([
      { kind: 'rangeBand', x: rescaled.xForInstant(start), width: rescaled.xForInstant(dayEnd) },
    ]);
  });
});
