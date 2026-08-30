// layout/ — Date line geometry. DOM-free. Paint lives in render/dom/date-line.ts (S1.13).

import type { Instant } from '../model/index.js';
import { now } from '../time/index.js';
import type { TimeScale } from '../time/index.js';

/** One vertical marker at an Instant, in content pixels. Index-keyed by the caller, like Header
 * bands — no `id` (S1.13, D-S1.13-3). `today` marks the Today line wrapper (U5) — paint writes
 * `data-flag="today"`; authored `dateLines` entries omit it. */
export interface DateLine {
  kind: 'dateLine';
  x: number;
  label?: string;
  className?: string;
  today?: true;
}

/** What a caller states to place a Date line besides the today wrapper. Layout-internal resolved
 * shape — `api/gantt.ts`'s `DateLineInput` is the loose public counterpart (S1.13, D-S1.13-2). */
export interface DateLineSpec {
  placeAt: Instant;
  label?: string;
  className?: string;
}

export interface ResolveDateLinesInput {
  scale: Pick<TimeScale, 'range' | 'xForInstant'>;
  /** `true`/`undefined` reads `now()` (or the test-frozen `now` below); `false` omits it; an
   *  `Instant` pins the line there with no clock read at all. Default `true`. */
  todayLine?: boolean | Instant;
  dateLines?: readonly DateLineSpec[];
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
): DateLine | undefined {
  if (!inScaleRange(scale, at)) return undefined;
  const line: DateLine = { kind: 'dateLine', x: scale.xForInstant(at) };
  if (extras.label !== undefined) line.label = extras.label;
  if (extras.className !== undefined) line.className = extras.className;
  if (extras.today) line.today = true;
  return line;
}

/** Turns the today wrapper and any authored Date lines into decorations in range, positionally
 * (no `id` — index-keying is `render/dom`'s job, S1.13, D-S1.13-3). */
export function resolveDateLines(input: ResolveDateLinesInput): DateLine[] {
  const { scale } = input;
  const lines: DateLine[] = [];
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
