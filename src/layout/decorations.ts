// layout/ — runs every registered decoration provider for the current window, converts their
// time-based output into content pixels through the bound `TimeScale`, and memoizes the result so a
// static provider costs one call per window change, not one per render.

import type { Instant, TimeSpan, TimeUnit } from '../model/index.js';
import { createZonedTime } from '../time/index.js';
import type { DecorationInput, DecorationLayer, DecorationProvider } from './decoration.js';
import type { FrameRow } from './frame-row.js';
import type { RangeBand, RowStripe } from './decoration.js';

/** What `PluginContext.view.registerDecoration(layer, provider)` records — the pairing
 *  `DecorationRunner.run` needs to sort each provider's output into the right paint layer. */
export interface RegisteredDecorationProvider {
  layer: DecorationLayer;
  provider: DecorationProvider;
}

export interface DecorationsByLayer {
  underBars: readonly (RangeBand | RowStripe)[];
  overBars: readonly (RangeBand | RowStripe)[];
}

export interface RunDecorationsInput {
  providers: readonly RegisteredDecorationProvider[];
  span: TimeSpan;
  rows: readonly FrameRow[];
  timeZone: string;
  /** The step one tick column stands for — `DecorationContext.tickUnit`/`tickIncrement`. */
  tickUnit: TimeUnit;
  tickIncrement: number;
  xForInstant: (at: Instant) => number;
}

const EMPTY: DecorationsByLayer = Object.freeze({ underBars: [], overBars: [] });

// Narrows on the discriminant field itself ('rowId' in input), not a `.kind` literal comparison —
// `freegantt/no-kind-literal` bans the latter in layout/ (CLAUDE.md, plans/01 §2.5): kind-dependent
// behaviour goes through a seam, and this converter is that seam for a `DecorationInput`.
function toPixels(input: DecorationInput, xForInstant: (at: Instant) => number): RangeBand | RowStripe {
  if ('rowId' in input) {
    const stripe: RowStripe = { kind: 'rowStripe', rowId: input.rowId };
    if (input.class !== undefined) stripe.class = input.class;
    return stripe;
  }
  const x = xForInstant(input.start);
  const width = Math.max(0, xForInstant(input.end) - x);
  const band: RangeBand = { kind: 'rangeBand', x, width };
  if (input.class !== undefined) band.class = input.class;
  return band;
}

function memoKey(input: RunDecorationsInput, providerIds: ReadonlyMap<DecorationProvider, number>): string {
  const rowIds = input.rows.map((row) => row.id).join(',');
  const providers = input.providers
    .map(({ layer, provider }) => `${layer}:${providerIds.get(provider)}`)
    .join(',');
  // Two calls into the bound `TimeScale` stand in for its revision: a container resize under
  // `range: 'fitDataset'` keeps `span.start`/`span.end` unchanged but moves every pixel, so the key
  // must sample the scale itself, not just the dates it maps.
  const scaleSample = `${input.xForInstant(input.span.start)}|${input.xForInstant(input.span.end)}`;
  // The tick step is part of the window a provider reads: one that only paints at day granularity
  // must run again when the preset changes, and switching `dayAndWeek` → `weekAndMonth` can leave
  // span, rows and scale sample all unchanged.
  const tick = `${input.tickUnit}/${input.tickIncrement}`;
  return `${input.timeZone}|${input.span.start}|${input.span.end}|${scaleSample}|${tick}|${providers}|${rowIds}`;
}

/** One instance per Gantt (I2), held alongside its `FrameLayout` — never shared. `run()` recomputes
 *  only when the window (span, visible rows, provider list) actually changed since the last call;
 *  otherwise it returns the previous frame's result unchanged. */
export class DecorationRunner {
  #lastKey: string | undefined;
  #lastResult: DecorationsByLayer = EMPTY;
  #nextProviderId = 0;
  #providerIds = new WeakMap<DecorationProvider, number>();

  /** A stable id per provider function, not its array position — two same-length provider lists
   *  with different providers (or the same providers reordered) must not collide on one memo key. */
  #idOf(provider: DecorationProvider): number {
    let id = this.#providerIds.get(provider);
    if (id === undefined) {
      id = this.#nextProviderId++;
      this.#providerIds.set(provider, id);
    }
    return id;
  }

  run(input: RunDecorationsInput): DecorationsByLayer {
    if (input.providers.length === 0) {
      this.#lastKey = undefined;
      this.#lastResult = EMPTY;
      return EMPTY;
    }

    const providerIds = new Map(input.providers.map(({ provider }) => [provider, this.#idOf(provider)]));
    const key = memoKey(input, providerIds);
    if (key === this.#lastKey) return this.#lastResult;

    const time = createZonedTime(input.timeZone);
    const ctx = {
      span: input.span,
      rows: input.rows,
      time,
      tickUnit: input.tickUnit,
      tickIncrement: input.tickIncrement,
    };
    const underBars: (RangeBand | RowStripe)[] = [];
    const overBars: (RangeBand | RowStripe)[] = [];
    for (const { layer, provider } of input.providers) {
      const target = layer === 'underBars' ? underBars : overBars;
      for (const item of provider(ctx)) target.push(toPixels(item, input.xForInstant));
    }

    this.#lastKey = key;
    this.#lastResult = { underBars, overBars };
    return this.#lastResult;
  }
}
