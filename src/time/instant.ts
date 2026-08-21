// time/ owns all civil arithmetic and is the only place Date/Date.now/magic time constants are allowed (I10).

import type { Instant } from '../model/index.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

export function instant(value: Date | number | string): Instant {
  if (value instanceof Date) return value.getTime() as Instant;
  if (typeof value === 'number') return value as Instant;
  return new Date(value).getTime() as Instant;
}

export function now(): Instant {
  return Date.now() as Instant;
}

export function toISO(i: Instant): string {
  return new Date(i).toISOString();
}

export function addMs(i: Instant, ms: number): Instant {
  return (i + ms) as Instant;
}

export function diffMs(a: Instant, b: Instant): number {
  return a - b;
}

export const MS = {
  SECOND: MS_PER_SECOND,
  MINUTE: MS_PER_MINUTE,
  HOUR: MS_PER_HOUR,
  DAY: MS_PER_DAY,
} as const;
