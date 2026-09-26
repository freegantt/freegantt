// layout/ — Date line geometry. DOM-free. Paint lives in render/dom/date-line.ts (S1.13).

import type { Instant } from '../model/index.js';
import { now } from '../time/index.js';
import type { TimeScale } from '../time/index.js';

/** One vertical marker at an Instant, in content pixels. Index-keyed by the caller, like Header
 * bands — no `id`. `today` marks the Today line wrapper (U5) — paint writes
 * `data-flag="today"`; authored `dateLines` entries omit it. Named apart from `DateLine` (S4-1):
 * this is screen-space paint geometry, not the resolved Date line a consumer reads back. */
export interface DateLineDecoration {
  kind: 'dateLine';
  x: number;
  label?: string;
  className?: string;
  today?: true;
}

/** What a caller states to place a Date line besides the today wrapper, resolved to an `Instant`.
 * `api/gantt.ts` publishes this same shape as `Gantt.dateLines`'s read type (S4-1) — `DateLineInput`
 * is its loose counterpart on the way in. */
export interface DateLine {
  placeAt: Instant;
  label?: string;
  className?: string;
}

/** Where a Date line's own label paints, relative to the sticky header (#318 follow-up to #225).
 * `'belowHeader'` (the default) anchors below the header, clear of its ticks — #225's own
 * fix. It can still meet a bar: the header stays put while the timeline pane scrolls, so whichever
 * row's bar is scrolled to the top sits right under it. `'inHeader'` anchors inside the
 * header instead, where no row can ever scroll under it, at the cost of #225's own ticks collision
 * when the label's x lands on one. A `number` is a px offset from the header's own top edge, for a
 * caller who wants neither shorthand and states the anchor itself. */
export type DateLineLabelPlacement = 'inHeader' | 'belowHeader' | number;

export const DEFAULT_DATE_LINE_LABEL_PLACEMENT: DateLineLabelPlacement = 'belowHeader';

export interface ResolveDateLinesInput {
  scale: Pick<TimeScale, 'range' | 'xForInstant'>;
  /** `true`/`undefined` reads `now()` (or the test-frozen `now` below); `false` omits it; an
   *  `Instant` pins the line there with no clock read at all. Default `true`. */
  todayLine?: boolean | Instant;
  dateLines?: readonly DateLine[];
  /** Frozen Instant for tests, used only when `todayLine` resolves to "now" mode. */
  now?: Instant;
}

function inScaleRange(scale: Pick<TimeScale, 'range'>, at: Instant): boolean {
  return at >= scale.range.start && at < scale.range.end;
}

function dateLineAt(
  scale: Pick<TimeScale, 'range' | 'xForInstant'>,
  at: Instant,
  extras: { label?: string; className?: string; today?: true } = {},
): DateLineDecoration | undefined {
  if (!inScaleRange(scale, at)) return undefined;
  const line: DateLineDecoration = { kind: 'dateLine', x: scale.xForInstant(at) };
  if (extras.label !== undefined) line.label = extras.label;
  if (extras.className !== undefined) line.className = extras.className;
  if (extras.today) line.today = true;
  return line;
}

/** Turns the today wrapper and any authored Date lines into decorations in range, positionally
 * (no `id` — index-keying is `render/dom`'s job). */
export function resolveDateLines(input: ResolveDateLinesInput): DateLineDecoration[] {
  const { scale } = input;
  const lines: DateLineDecoration[] = [];
  const todayLine = input.todayLine ?? true;
  if (todayLine !== false) {
    const at = todayLine === true ? (input.now ?? now()) : todayLine;
    const today = dateLineAt(scale, at, { today: true });
    if (today) lines.push(today);
  }
  for (const spec of input.dateLines ?? []) {
    const extras: { label?: string; className?: string } = {};
    if (spec.label !== undefined) extras.label = spec.label;
    if (spec.className !== undefined) extras.className = spec.className;
    const line = dateLineAt(scale, spec.placeAt, extras);
    if (line) lines.push(line);
  }
  return lines;
}
