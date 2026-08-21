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
