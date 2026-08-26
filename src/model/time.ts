// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

/** Absolute instant, epoch ms. Branded to prevent naked-number mixing (plans/01 §2.2). */
export type Instant = number & { readonly __brand: 'Instant' };

export type TimeUnit = 'ms' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';

/** Half-open [start, end) — see plans/01 §5. */
export interface TimeSpan {
  start: Instant;
  end: Instant;
}

export interface Duration {
  value: number;
  unit: TimeUnit;
}

/**
 * What a consumer may write anywhere the library stores an `Instant`.
 *
 * A `number` is epoch milliseconds, so an already-branded `Instant` is accepted unchanged. A string
 * is either absolute (an explicit `Z` or numeric offset) or a Plain time — a wall-clock reading with
 * no zone, which names no Instant until the Dataset's zone resolves it (CONTEXT.md). `time/toInstant`
 * is the one place that reading happens.
 */
export type InstantInput = Instant | Date | number | string;

/** The input twin of `TimeSpan` — still half-open [start, end). */
export interface TimeSpanInput {
  start: InstantInput;
  end: InstantInput;
}

/**
 * How a *date-only* `end` input (`'2026-09-08'`, no time of day) is read.
 *
 * Storage is half-open [start, end) (plans/01 §5), but a consumer writing a bare date on `end` means the
 * last day it wants included. `'inclusive'` (the default) advances such an end to the next day's
 * start, so `end: '2026-09-08'` covers through the 8th. `'exclusive'` reads it literally, as the
 * start of the 8th. Only date-only strings are affected: an `Instant`, a `Date`, and a string
 * carrying a time of day are always literal.
 */
export type DateOnlyEndRule = 'inclusive' | 'exclusive';
