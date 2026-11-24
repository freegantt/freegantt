// layout/ — a consumer's hook into one header tick: what it draws, and what flags it carries (ADR 0045).

import type { ElementDescription, Instant } from '../model/index.js';
import type { Tick, ZonedTime } from '../time/index.js';

export interface HeaderTickContext {
  /** Which header band the tick sits in. Band 0 is the coarsest. */
  readonly band: number;
  readonly tick: Tick;
  /** The Dataset zone, bound once. `time.startOf(tick.instant, 'day')` gives the tick's own day. */
  readonly time: ZonedTime;
  readonly locale: Intl.LocalesArgument;
  /** The first Instant of the axis. A label shows a year only where the year changes. */
  readonly rangeStart: Instant;
}

export interface HeaderTickPaint {
  /** What the tick draws in place of the library text. */
  content?: ElementDescription;
  /** Tokens for `data-flag` on the tick, for example `'off'`. The library adds `'today'` itself. */
  flags?: readonly string[];
}

/** `undefined` keeps the library text and adds no flag. */
export type HeaderTickRenderer = (context: HeaderTickContext) => HeaderTickPaint | undefined;

/** Remembers what the consumer's renderer said for each header tick. A scroll frame asks again for
 *  every visible tick, and the answer does not change until the renderer, the preset, the zone, the
 *  locale or the axis start does. */
export class HeaderTickPaintCache {
  #renderer: HeaderTickRenderer | undefined;
  #presetId: string | undefined;
  #zone: string | undefined;
  #locale: Intl.LocalesArgument;
  #rangeStart: Instant | undefined;
  readonly #paints = new Map<string, HeaderTickPaint | undefined>();

  /** Call: `cache.paintFor(renderer, presetId, context)`. */
  paintFor(
    renderer: HeaderTickRenderer,
    presetId: string,
    context: HeaderTickContext,
  ): HeaderTickPaint | undefined {
    if (
      renderer !== this.#renderer ||
      presetId !== this.#presetId ||
      context.time.zone !== this.#zone ||
      context.locale !== this.#locale ||
      context.rangeStart !== this.#rangeStart
    ) {
      this.#paints.clear();
      this.#renderer = renderer;
      this.#presetId = presetId;
      this.#zone = context.time.zone;
      this.#locale = context.locale;
      this.#rangeStart = context.rangeStart;
    }
    const key = `${context.band}:${context.tick.instant}`;
    if (this.#paints.has(key)) return this.#paints.get(key);
    const paint = renderer(context);
    this.#paints.set(key, paint);
    return paint;
  }
}
