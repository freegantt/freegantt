// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src'. ADR 0013: core ships no diamond
// and no `'milestone'` kind any more, so a page that wants one look owns it the same way
// `bufferKind()`/`riskKind()` do — it stores which ids it owns itself.

import { wholeEntryItem } from 'freegantt';
import type { EntryId, GanttPlugin } from 'freegantt';

const MILESTONE_KIND = 'milestone';

/** A consumer-defined `'milestone'` look. The page's own `barRenderer` paints the `'milestone'` key
 *  this plugin's item producer makes real — this plugin supplies only the "what shape does it
 *  draw?" seam (D-S5-22); a milestone has no resize/move restrictions of its own, so the other
 *  three seams stay at the library default. */
export function milestoneKind(ownedIds: Iterable<string>): GanttPlugin {
  const owned = new Set<EntryId>(ownedIds as Iterable<EntryId>);
  return {
    id: 'demo.milestoneKind',
    setup(ctx) {
      // Which entries are mine, and what shape do they draw? The two halves of one look (Q10).
      ctx.layout.registerLookClaim(MILESTONE_KIND, (entry) => owned.has(entry.id));
      ctx.layout.registerItemProducer(MILESTONE_KIND, (entry) => [wholeEntryItem(entry, MILESTONE_KIND)]);
      // No disposer: `ctx.disposables` already retracts the registration (review P4).
    },
  };
}
