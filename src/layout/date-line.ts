// layout/ — Date line geometry. DOM-free. Paint lives in render/dom/date-line.ts (issue #96).

import type { Instant } from '../model/index.js';
import { now } from '../time/index.js';
import type { TimeScale } from '../time/index.js';

/** Key of the Date line the `todayLine` wrapper emits. */
export const TODAY_DATE_LINE_ID = 'today';

/** One vertical marker at an Instant, in content pixels. */
export interface DateLine {
  kind: 'dateLine';
  id: string;
  x: number;
  label?: string;
}

/** What a caller states to place a Date line besides the today wrapper. */
export interface DateLineInput {
  id: string;
  instant: Instant;
  label?: string;
}

export interface ResolveDateLinesInput {
  scale: Pick<TimeScale, 'range' | 'xForInstant'>;
  /** Emits the today wrapper. Default `true`. */
  todayLine?: boolean;
  dateLines?: readonly DateLineInput[];
  /** Frozen Instant for tests. Omitted, the pass reads `now()`. */
  now?: Instant;
}

function inScaleRange(scale: Pick<TimeScale, 'range'>, at: Instant): boolean {
  return at >= scale.range.start && at < scale.range.end;
}

function dateLineAt(
  scale: Pick<TimeScale, 'range' | 'xForInstant'>,
  id: string,
  at: Instant,
  label: string | undefined,
): DateLine | undefined {
  if (!inScaleRange(scale, at)) return undefined;
  if (label !== undefined) {
    return { kind: 'dateLine', id, x: scale.xForInstant(at), label };
  }
  return { kind: 'dateLine', id, x: scale.xForInstant(at) };
}

/** Turns the today wrapper and any authored Date lines into decorations in range. */
export function resolveDateLines(input: ResolveDateLinesInput): DateLine[] {
  const { scale } = input;
  const lines: DateLine[] = [];
  const todayOn = input.todayLine ?? true;
  if (todayOn) {
    const at = input.now ?? now();
    const today = dateLineAt(scale, TODAY_DATE_LINE_ID, at, undefined);
    if (today) lines.push(today);
  }
  for (const spec of input.dateLines ?? []) {
    const line = dateLineAt(scale, spec.id, spec.instant, spec.label);
    if (line) lines.push(line);
  }
  return lines;
}
