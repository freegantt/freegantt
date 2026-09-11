// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (review P2). This plugin is
// `bufferKind()`'s peer. Two plugins each define their own look, and both install: the `bar` point
// keys on the look, so `'buffer'` and `'risk'` are neighbours rather than rivals.

import { wholeEntryItem } from 'freegantt';
import type { EntryEdit, EntryId, GanttPlugin } from 'freegantt';

const RISK_KIND = 'risk';

/** A consumer-defined `'risk'` look, over the same seams D-S5-22 names — and the proof that a
 *  second look-defining plugin is an ordinary install, not a collision. ADR 0013: this plugin, like
 *  `bufferKind()`, stores which ids it owns itself — see that file's own comment. */
export function riskKind(ownedIds: Iterable<string>): GanttPlugin {
  const owned = new Set<EntryId>(ownedIds as Iterable<EntryId>);
  return {
    id: 'demo.riskKind',
    setup(ctx) {
      // Which entries are mine? The ids this plugin owns (Q10).
      ctx.layout.registerLookClaim(RISK_KIND, (entry) => owned.has(entry.id));

      // What shape does it draw? One Item over the whole entry. `wholeEntryItem` is the library's
      // own, so this plugin never restates the Item id convention (review P3).
      ctx.layout.registerItemProducer(RISK_KIND, (entry) => [wholeEntryItem(entry, RISK_KIND)]);

      // How does it look? Its own class, through the ordinary bar renderer seam. `bufferKind()`
      // registers on the same point for its own look, and both registrations stand (review P2).
      ctx.view.registerRenderer('bar', { [RISK_KIND]: () => ({ class: { 'demo-risk-bar': true } }) });

      // What can you do to it? Move refuses — a risk band sits where the plan puts it.
      ctx.interaction.registerLookDefaults(RISK_KIND, { move: false });

      // What actions does it offer? One menu item, scoped to the ids this plugin owns alone.
      ctx.commands.register({
        id: 'demo.riskKind.markAccepted',
        label: 'Mark risk accepted',
        when: ({ entry }) => entry !== undefined && owned.has(entry.id),
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
