// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (review P2). This plugin is
// `bufferKind()`'s peer. Two plugins each define their own kind, and both install: the `bar` point
// keys on the kind, so `'buffer'` and `'risk'` are neighbours rather than rivals.

import { wholeEntryItem } from 'freegantt';
import type { EntryEdit, GanttPlugin } from 'freegantt';

const RISK_KIND = 'risk';

/** A consumer-defined `'risk'` kind, over the same four seams D-S5-22 names — and the proof that a
 *  second kind-defining plugin is an ordinary install, not a collision. */
export function riskKind(): GanttPlugin {
  return {
    id: 'demo.riskKind',
    setup(ctx) {
      // What shape does it draw? One Item over the whole entry. `wholeEntryItem` is the library's
      // own, so this plugin never restates the Item id convention (review P3).
      ctx.layout.registerItemProducer(RISK_KIND, (entry) => [wholeEntryItem(entry)]);

      // How does it look? Its own class, through the ordinary bar renderer seam. `bufferKind()`
      // registers on the same point for its own kind, and both registrations stand (review P2).
      ctx.view.registerRenderer('bar', { [RISK_KIND]: () => ({ class: { 'demo-risk-bar': true } }) });

      // What can you do to it? Move refuses — a risk band sits where the plan puts it.
      ctx.interaction.registerKindDefaults(RISK_KIND, { move: false });

      // What actions does it offer? One menu item, scoped to this kind alone by `when`.
      ctx.commands.register({
        id: 'demo.riskKind.markAccepted',
        label: 'Mark risk accepted',
        when: ({ entry }) => entry?.kind === RISK_KIND,
        run: ({ entry }) => {
          if (entry === undefined) return;
          // See buffer-kind.ts's own comment: `accepted` is declared on the harness's Dataset, and this
          // cast bridges the same static gap for an untyped plugin.
          ctx.dataset.entries.update(entry.id, { accepted: true } as EntryEdit);
        },
      });

      // No disposer: `ctx.disposables` already retracts all four registrations (review P4).
    },
  };
}
