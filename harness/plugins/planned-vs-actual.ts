// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt'.
// Dogfoods the `rowSpan` half of `DecorationInput`: the library knows nothing about plans or
// baselines, so this plugin owns that idea and hands the library one generic span per row.

import { definePlugin, diffMs, instant, MS } from 'freegantt';
import type { Instant } from 'freegantt';

/** The two consumer Fields the page declares to hold a row's planned dates. */
export const PLANNED_START = 'plannedStart';
export const PLANNED_END = 'plannedEnd';

/** Names a late finish, for example "+4d". An on-time or early finish has no slip text. */
function slipText(actualEnd: unknown, plannedEnd: Instant): string | undefined {
  if (typeof actualEnd !== 'number') return undefined;
  const days = Math.round(diffMs(actualEnd as Instant, plannedEnd) / MS.DAY);
  return days > 0 ? `+${days}d` : undefined;
}

/** Paints each row's planned dates as a span under its actual bar, so a reader sees the slip. */
export function plannedVsActual() {
  return definePlugin({
    id: 'demo.plannedVsActual',
    view(ctx) {
      const plannedDate = (entry: { read(key: string): unknown }, key: string): Instant | undefined => {
        const value = entry.read(key);
        return typeof value === 'string' ? instant(value) : undefined;
      };

      ctx.view.registerDecoration('underBars', ({ rows }) =>
        rows.flatMap((row) => {
          const entryId = row.entryIds[0];
          const entry = entryId === undefined ? undefined : ctx.dataset.entries.get(entryId);
          if (entry === undefined) return [];
          const start = plannedDate(entry, PLANNED_START);
          const end = plannedDate(entry, PLANNED_END);
          if (start === undefined || end === undefined) return [];
          const span = { kind: 'rowSpan' as const, rowId: row.id, start, end, class: 'demo-planned-span' };
          const slip = slipText(entry.read('end'), end);
          return [slip === undefined ? span : { ...span, text: slip }];
        }),
      );
    },
  });
}
