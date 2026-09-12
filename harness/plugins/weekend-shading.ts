// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]). This is the
// gate box's whole point — the plugin only compiles because the public surface is enough.

import { definePlugin } from 'freegantt';
import type { Instant } from 'freegantt';

/** A weekend-shading plugin, buildable against `dataset.time`/`ctx.view.registerDecoration` alone
 *  (D-S5-15/D-S5-16). Shades Saturday and Sunday under the bars, in the dataset's own zone — no
 *  `Date`, no `86400000`, no private import.
 *
 *  Shades nothing unless a reader can see individual days. At a week or month tick a weekend is a
 *  slice of a column instead of a column, so the stripe reads as a smear across the grid rather than
 *  "these two days are the weekend". The plugin decides that on its own — not a config key, not page
 *  CSS — because the plugin is what knows the stripe means two days. */
export function weekendShading() {
  return definePlugin({
    id: 'demo.weekendShading',
    view(ctx) {
      ctx.view.registerDecoration('underBars', ({ span, time, tickUnit, tickIncrement }) => {
        if (tickUnit !== 'day' || tickIncrement !== 1) return [];
        // One band per weekend, not one per weekend day. Saturday and Sunday as two adjacent rects
        // meet at a fractional pixel, and the sub-pixel remainder shows the pane through as a
        // hairline that splits every stripe in two on a high-DPI screen.
        return weekendRuns(time.eachDay(span), {
          isWeekend: (day) => time.dayOfWeek(day) >= 6,
          nextDay: (day) => time.addDays(day, 1),
        }).map((weekend) => ({
          kind: 'rangeBand' as const,
          start: weekend.start,
          end: weekend.end,
          class: 'demo-weekend-band',
        }));
      });
      // No disposer: `ctx.disposables` already retracts the registration (review P4).
    },
  });
}

/** Call: `weekendRuns(days, { isWeekend, nextDay })`. Runs of neighbouring weekend days, each one
 *  half-open `[start, end)` — a Saturday and its Sunday come back as one span. */
function weekendRuns(
  days: readonly Instant[],
  calendar: { isWeekend: (day: Instant) => boolean; nextDay: (day: Instant) => Instant },
): { start: Instant; end: Instant }[] {
  const runs: { start: Instant; end: Instant }[] = [];
  for (const day of days) {
    if (!calendar.isWeekend(day)) continue;
    const open = runs[runs.length - 1];
    if (open && open.end === day) open.end = calendar.nextDay(day);
    else runs.push({ start: day, end: calendar.nextDay(day) });
  }
  return runs;
}
