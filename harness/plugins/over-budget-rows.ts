// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (S5.6, [S5-A2]). Dogfoods the
// `rowStripe` half of `DecorationInput` — every other decoration demo on this page (`timeShading()`)
// only ever exercises `rangeBand`, so nothing had painted a whole row before this.

import { definePlugin } from 'freegantt';

/** A whole-row stripe over every row whose `cost` Field reads above `threshold` — the same rows the
 *  page's own `gridCellRenderer` already reddens one cell of (`demo-over-budget` on the `cost`
 *  column), stated the other way: this plugin marks the row, that renderer marks the cell.
 *
 *  Reads `cost` off the live Entry through `ctx.dataset.entries.get(id)`/`entry.read('cost')` — a
 *  decoration provider gets no field access of its own (`DecorationContext` carries `rows`/`time`
 *  only), so a plugin that shades by data value closes over `ctx.dataset` the way this one does. */
export function overBudgetRows(threshold: number) {
  return definePlugin({
    id: 'demo.overBudgetRows',
    view(ctx) {
      ctx.view.registerDecoration('underBars', ({ rows }) =>
        rows
          .filter((row) => {
            const entryId = row.entryIds[0];
            if (entryId === undefined) return false;
            const entry = ctx.dataset.entries.get(entryId);
            const cost = entry?.read('cost');
            return typeof cost === 'number' && cost > threshold;
          })
          .map((row) => ({ kind: 'rowStripe' as const, rowId: row.id, class: 'demo-over-budget-row' })),
      );
      // No disposer: `ctx.disposables` already retracts the registration (review P4, same as
      // `weekendShading()`'s own precedent).
    },
  });
}
