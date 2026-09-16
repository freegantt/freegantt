// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

/** Absolute instant, epoch ms. Branded to prevent naked-number mixing (plans/01 §2.2). */
export type Instant = number & { readonly __brand: 'Instant' };

export type TimeUnit = 'millisecond' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** Half-open [start, end) — see plans/01 §5. */
export interface TimeSpan {
  start: Instant;
  end: Instant;
}

export interface Duration {
  value: number;
  unit: TimeUnit;
}

/** How core measures an Entry's duration (ADR 0017, Q6/J12). One policy per Dataset — a per-Field
 *  setting would let two Fields on one Dataset disagree about what a duration is.
 *
 *  - `'span'` — `end - start`, gaps between Segments counted. The default.
 *  - `'segments'` — the sum of the Segments, gaps counted nowhere.
 *
 *  A union rather than a boolean: a calendar-aware third answer (duration in working time) is
 *  plausible at S7, and a union takes it without deleting a published key. */
export type DurationMeasure = 'span' | 'segments';

/**
 * A *plain* time: a wall-clock reading with no zone attached, so it names no `Instant` until a zone
 * resolves it (CONTEXT.md). A domain shape, not zone machinery — which is why it lives here and not
 * in `time/`: `extensions/` needs it for the `dateInput` seam (D-S5-20) and may import `model/`,
 * while `time/` is sealed from it (D-S5-5). `time/`'s own `PlainParts` extends this with the
 * `dayOfWeek` its zone math fills in.
 */
export interface PlainParts {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO day of week: 1 = Monday … 7 = Sunday (D-S5-16). Derived, never authored: `time/`'s
   *  `toPlain` always fills it and its `fromPlain` never reads it, so a caller building a
   *  `PlainParts` to write may omit it. */
  dayOfWeek?: number;
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
 * A wall-clock time of day, with no date and no zone attached — `'17:00'` or `'17:00:00'`.
 *
 * A narrower cousin of a Plain time (`PlainParts`): a Plain time names a full reading, year through
 * second, while a `PlainTimeInput` names only the hour, minute and optional second, because its date
 * comes from elsewhere (the day a builder is already walking). `time/readPlainTime` is the one place
 * this string is read.
 */
export type PlainTimeInput = string;

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
