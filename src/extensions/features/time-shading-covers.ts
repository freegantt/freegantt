// extensions/features/ — the five `TimeCover` builders behind `timeShading()` (#404). Confined by
// `extensions-public-only` (D-S5-5) to `api/`/`model/` imports; every import below names its own
// narrow source file, never the `api/index.ts` barrel — that barrel will re-export `timeShading`
// itself, so a feature file importing it back would close a cycle (no-circular).
//
// D-G: each builder answers `coveredSpans(window, time)` with raw, possibly-adjacent spans. The
// union-and-merge into one-rect-per-run bands is `time-shading.ts`'s job, done once for every rule
// (a single cover or a list) so the two paths can never disagree. `mergeSpans`/`complement` live
// here because `notCovered` needs them for its own merge, and `time-shading.ts` reuses them rather
// than re-deriving the same walk.

import type { Instant, InstantInput, TimeSpan, TimeSpanInput, TimeUnit } from '../../model/index.js';
import { EmptyCoversError } from '../../model/index.js';
import { isCoarserThan, readPlainTime } from '../../api/time-facade.js';
import type { ZonedTime } from '../../api/time-facade.js';

/** ISO day of week: 1 = Monday … 7 = Sunday — the numbering `ZonedTime.dayOfWeek` already returns
 *  (settled 2026-09-15). `daysOfWeek(8)` is a compile error. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** What one shading rule covers, and the coarsest tick at which that answer still reads to a person.
 *  A builder returns one. A consumer states one by hand only for a case no builder covers. */
export interface TimeCover {
  hideWhenCoarserThan: TimeUnit;
  coveredSpans(window: TimeSpan, time: ZonedTime): readonly TimeSpan[];
}

/** `at`, clipped to `window` — every builder below returns only what the window can show, so a
 *  distant `dates()` entry or an overnight `hours()` band that pokes in from the day before never
 *  reaches `time-shading.ts` as a span wider than the window it was asked about. */
function clipToWindow(window: TimeSpan, spans: readonly TimeSpan[]): TimeSpan[] {
  const clipped: TimeSpan[] = [];
  for (const span of spans) {
    const start = Math.max(span.start, window.start) as Instant;
    const end = Math.min(span.end, window.end) as Instant;
    if (start < end) clipped.push({ start, end });
  }
  return clipped;
}

/** Call: `mergeSpans(cover.coveredSpans(window, time))`. Sorts ascending, then folds a run of
 *  overlapping or touching spans into one — the fix for the sub-pixel hairline a weekend's two
 *  adjacent day-spans would otherwise paint as (D-G). */
export function mergeSpans(spans: readonly TimeSpan[]): TimeSpan[] {
  const sorted = [...spans].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: TimeSpan[] = [];
  for (const span of sorted) {
    const open = merged[merged.length - 1];
    if (open && span.start <= open.end) {
      if (span.end > open.end) open.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/** The gaps `window` leaves once `mergedSpans` (already sorted and merged) are cut out of it —
 *  `notCovered`'s own answer, and every gap is itself half-open. */
export function complement(window: TimeSpan, mergedSpans: readonly TimeSpan[]): TimeSpan[] {
  const gaps: TimeSpan[] = [];
  let cursor = window.start;
  for (const span of mergedSpans) {
    if (span.start > cursor) gaps.push({ start: cursor, end: span.start });
    if (span.end > cursor) cursor = span.end;
  }
  if (cursor < window.end) gaps.push({ start: cursor, end: window.end });
  return gaps;
}

/** The coarsest of `covers`' own floors (D-H: a list hides only when *no* member reads — the coarsest
 *  floor, never the finest). `covers` always has at least one member; callers check the empty list
 *  before this runs. */
export function coarsestFloor(covers: readonly TimeCover[]): TimeUnit {
  return covers
    .map((cover) => cover.hideWhenCoarserThan)
    .reduce((coarsest, unit) => (isCoarserThan(unit, coarsest) ? unit : coarsest));
}

/** Saturday and Sunday, a holiday list, any set of ISO weekdays. Walks days (`ZonedTime.eachDay`) and
 *  shades each matching day whole — a day boundary is a wall-clock boundary, so a 23-hour or 25-hour
 *  Saturday still shades as a full Saturday. Hides above `'day'`: a weekend at month zoom is a smear
 *  across the grid, not two days. */
export function daysOfWeek(...days: readonly DayOfWeek[]): TimeCover {
  const wanted = new Set<DayOfWeek>(days);
  return {
    hideWhenCoarserThan: 'day',
    coveredSpans(window, time) {
      const spans = time
        .eachDay(window)
        .filter((day) => wanted.has(time.dayOfWeek(day) as DayOfWeek))
        .map((day) => ({ start: day, end: time.addDays(day, 1) }));
      return clipToWindow(window, spans);
    },
  };
}

/** `hours('17:00', '07:00')` wraps midnight — the common case, not the edge case. Walks days one
 *  ahead of `window.start` so an overnight band that starts the evening before still reaches in, and
 *  resolves each day's two boundaries through `ZonedTime.fromPlain` alone (no arithmetic of its own):
 *  DST is `fromPlain`'s answer, not this builder's (`time/zone.ts`, `disambiguation: 'compatible'`) —
 *  the band measures 13 hours on a short day and 15 on a long one, and a plain time that does not
 *  exist that day (the spring-forward gap) resolves forward. Hides above `'hour'`. */
export function hours(from: string, to: string): TimeCover {
  const start = readPlainTime(from, 'hours');
  const end = readPlainTime(to, 'hours');
  return {
    hideWhenCoarserThan: 'hour',
    coveredSpans(window, time) {
      const scanStart = time.addDays(time.startOfDay(window.start), -1);
      const spans = time.eachDay({ start: scanStart, end: window.end }).map((day) => {
        const plain = time.toPlain(day);
        const bandStart = time.fromPlain({ ...plain, ...start });
        let bandEnd = time.fromPlain({ ...plain, ...end });
        if (bandEnd <= bandStart) bandEnd = time.addDays(bandEnd, 1);
        return { start: bandStart, end: bandEnd };
      });
      return clipToWindow(window, spans);
    },
  };
}

/** One or more whole calendar days — `dates('2026-12-25', '2027-01-01')`. Each `at` reads through
 *  `ZonedTime.toInstant`, so the same loose input `InstantInput` accepts anywhere else. Hides above
 *  `'day'`, the same reason `daysOfWeek` does. */
export function dates(...at: readonly InstantInput[]): TimeCover {
  return {
    hideWhenCoarserThan: 'day',
    coveredSpans(window, time) {
      const spans = at.map((input) => {
        const start = time.startOfDay(time.toInstant(input));
        return { start, end: time.addDays(start, 1) };
      });
      return clipToWindow(window, spans);
    },
  };
}

/**
 * One or more explicit bands, stated directly rather than walked — `spans({ start: '2026-07-01', end:
 * '2026-07-15' })` shades a two-week shutdown. A date-only `end` reads inclusively, the way an Entry's
 * own `end` does under `toEndInstant`'s default rule: `'2026-07-15'` covers the 15th, not up to its
 * midnight. This is not a config knob — `spans()` always reads this way, because a shading rule is
 * the plugin's own config, not Entry data the Dataset's `dateOnlyEnd` policy governs.
 *
 * Never hides on its own: a two-week shutdown is real at month zoom as much as at day zoom. A rule's
 * `hideWhenCoarserThan` still overrides this, and a tick with `tickIncrement !== 1` still hides it.
 */
export function spans(...at: readonly TimeSpanInput[]): TimeCover {
  return {
    // The coarsest unit: nothing is ever coarser than 'year', so this floor never triggers on its
    // own — see the JSDoc above.
    hideWhenCoarserThan: 'year',
    coveredSpans(window, time) {
      const raw = at.map((input) => ({
        start: time.toInstant(input.start),
        end: time.toEndInstant(input.end),
      }));
      return clipToWindow(window, raw);
    },
  };
}

/** The complement of `cover` (one, or a list unioned first) inside the window — `notCovered(cover)`
 *  shades everything the inner cover(s) do not. Takes the same list shape `covers` does on a rule,
 *  so one calendar is stated once and applied at both doors (D-G). An empty list is refused: it has
 *  no complement to compute, and shading the whole window is never what a caller meant. */
export function notCovered(cover: TimeCover | readonly TimeCover[]): TimeCover {
  const covers = Array.isArray(cover) ? cover : [cover];
  if (covers.length === 0) throw new EmptyCoversError();
  return {
    hideWhenCoarserThan: coarsestFloor(covers),
    coveredSpans(window, time) {
      const merged = mergeSpans(covers.flatMap((one: TimeCover) => one.coveredSpans(window, time)));
      return complement(window, merged);
    },
  };
}
