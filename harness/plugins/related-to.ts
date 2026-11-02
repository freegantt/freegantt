// harness/plugins/ — written as a third party would: everything below comes from 'freegantt', the
// package's own public entry. The plugin keeps its own list of related Entry pairs and draws one
// connector for each. It holds no dependency code: the connector seam knows two bar edges only.
import { definePlugin } from 'freegantt';
import type { EntryId } from 'freegantt';

export interface RelatedPair {
  readonly id: string;
  readonly fromEntryId: EntryId;
  readonly toEntryId: EntryId;
}

/** A line from the end of one Entry's bar to the start of another's. The label names both Entries,
 *  so a screen reader announces what each line joins. */
export function relatedTo(pairs: readonly RelatedPair[]) {
  return definePlugin({
    id: 'demo.relatedTo',
    view(ctx) {
      const nameOf = (id: EntryId): string => ctx.dataset.entries.get(id)?.name ?? '';
      ctx.view.registerConnector(() =>
        pairs.map((pair) => ({
          id: `related:${pair.id}`,
          from: { entryId: pair.fromEntryId, edge: 'end' },
          to: { entryId: pair.toEntryId, edge: 'start' },
          label: `${nameOf(pair.fromEntryId)} is related to ${nameOf(pair.toEntryId)}`,
        })),
      );
    },
  });
}
