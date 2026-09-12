// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src' (review P2). This plugin is
// `bufferKind()`'s peer. Two plugins each define their own variant, and both install: two rules that
// claim different rows are neighbours rather than rivals.

import { definePlugin } from 'freegantt';
import type { EntryEdit } from 'freegantt';

const RISK_VARIANT = 'risk';

/** A consumer-defined `'risk'` variant, over the same two doors — and the proof that a second
 *  variant-defining plugin is an ordinary install, not a collision. Like `bufferKind()`, its rule
 *  reads the row, so it keeps no list of the ids it owns. */
export function riskKind() {
  return definePlugin({
    id: 'demo.riskKind',
    view(ctx) {
      ctx.variants.add({
        // Which rows are mine? The ones the page marked as risk.
        name: RISK_VARIANT,
        when: { risk: true },
        // How does it look? Its own class. `bufferKind()` installs its own variant, and both stand.
        paint: () => ({ class: { 'demo-risk-bar': true } }),
        // What can you do to it? Move refuses — a risk band sits where the plan puts it.
        can: { move: false },
      });

      // What actions does it offer? One menu item, scoped to the rows this variant claimed.
      ctx.commands.register({
        id: 'demo.riskKind.markAccepted',
        label: 'Mark risk accepted',
        when: ({ variant }) => variant === RISK_VARIANT,
        run: ({ entry }) => {
          if (entry === undefined) return;
          // See buffer-kind.ts's own comment: `accepted` is declared on the harness's Dataset, and this
          // cast bridges the same static gap for an untyped plugin.
          ctx.dataset.entries.update(entry.id, { accepted: true } as EntryEdit);
        },
      });

      // No disposer: `ctx.disposables` already retracts both registrations (review P4).
    },
  });
}
