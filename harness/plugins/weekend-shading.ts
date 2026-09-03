// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]). This is the
// gate box's whole point — the plugin only compiles because the public surface is enough.

import type { GanttPlugin } from 'freegantt';

/** A weekend-shading plugin, buildable against `dataset.time`/`ctx.view.registerDecoration` alone
 *  (D-S5-15/D-S5-16). Shades Saturday and Sunday under the bars, in the dataset's own zone — no
 *  `Date`, no `86400000`, no private import. */
export function weekendShading(): GanttPlugin {
  return {
    id: 'demo.weekendShading',
    setup(ctx) {
      ctx.view.registerDecoration('underBars', ({ span, time }) =>
        time
          .eachDay(span)
          .filter((day) => time.dayOfWeek(day) >= 6)
          .map((day) => ({
            kind: 'rangeBand' as const,
            start: day,
            end: time.addDays(day, 1),
            class: 'demo-weekend-band',
          })),
      );
      return () => {};
    },
  };
}
