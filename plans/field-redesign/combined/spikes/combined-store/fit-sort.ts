/** Fit and sort. Skip dateless in fitDataset. Explicit hole compare for asc and desc. Improvement C. */

import { hasDates } from './dates.js';
import type { Entry, Instant } from './types.js';

export type Range = { start: Instant; end: Instant };

export function fitDataset(entries: readonly Entry[]): Range | undefined {
  let start: Instant | undefined;
  let end: Instant | undefined;
  for (const entry of entries) {
    if (!hasDates(entry)) continue;
    if (start === undefined || entry.start! < start) start = entry.start;
    if (end === undefined || entry.end! > end) end = entry.end;
  }
  if (start === undefined || end === undefined) return undefined;
  return { start, end };
}

export type SortDirection = 'asc' | 'desc';

/**
 * Explicit Instant compare. A hole sorts last in both directions.
 * Models direction * order like layout/rows/sort.ts.
 */
/** Hole sorts last on asc and desc. Direction applies only to dated values. */
export function compareInstant(
  a: Instant | undefined,
  b: Instant | undefined,
  direction: SortDirection,
): number {
  const aMissing = a === undefined;
  const bMissing = b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (a < b) return direction === 'asc' ? -1 : 1;
  if (a > b) return direction === 'asc' ? 1 : -1;
  return 0;
}

/** Sort via direction-aware compare. No extra direction * order multiply. */
export function applySort(
  entries: readonly Entry[],
  direction: SortDirection,
  key: 'start' = 'start',
): Entry[] {
  return [...entries].sort((left, right) =>
    compareInstant(left[key], right[key], direction),
  );
}
