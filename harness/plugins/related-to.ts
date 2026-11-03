// harness/plugins/ — written as a third party would: everything below comes from 'freegantt', the
// package's own public entry. The plugin keeps its related pairs in its own plugin store and draws
// one connector for each. It holds no dependency code: the connector seam knows two bar edges only.
// A connect drag adds a pair, and one undo removes it.
import { definePlugin } from 'freegantt';
import type { ConnectEnds, ConnectorEnd, DataPlugin, EntryId, PluginStore } from 'freegantt';

/** What the store holds: one row per Entry, listing the ends it points at. The row belongs to the
 *  `from` Entry, so removing that Entry removes its pairs in the same change. Removing a `to` Entry
 *  removes the pairs that point at it, through `writeRowsWithEdit`. */
interface RelatedRow {
  readonly pairs: readonly RelatedPair[];
}

/** One related pair, as the `from` Entry's row states it. */
interface RelatedPair {
  readonly fromEdge: ConnectorEnd['edge'];
  readonly to: ConnectorEnd;
}

/** What the page holds after installing: the plugin itself, plus the call that seeds a pair. */
export interface RelatedToPlugin extends DataPlugin {
  relate(ends: ConnectEnds): void;
}

/** A line between two bar edges, with an accessible name that names both Entries. A pair comes from
 *  `relate()` or from a connect drag, which the plugin handles with `ctx.view.onConnect`.
 *
 *  ```ts
 *  const related = relatedTo();
 *  const dataset = new Dataset({ entries, plugins: [related] });
 *  related.relate({ from: { entryId: 'a', edge: 'end' }, to: { entryId: 'b', edge: 'start' } });
 *  ```
 */
export function relatedTo(): RelatedToPlugin {
  let store: PluginStore<RelatedRow> | undefined;

  function relate({ from, to }: ConnectEnds): void {
    const existing = store?.get(from.entryId)?.pairs ?? [];
    const alreadyRelated = existing.some(
      (pair) => pair.fromEdge === from.edge && pair.to.entryId === to.entryId && pair.to.edge === to.edge,
    );
    if (alreadyRelated) return;
    store?.set(from.entryId, { pairs: [...existing, { fromEdge: from.edge, to }] });
  }

  return definePlugin({
    id: 'demo.relatedTo',
    data(ctx) {
      const reserved = ctx.store.reserve<RelatedRow>();
      store = reserved;
      // What happens to a pair when its `to` Entry goes? The pair goes in the same change set, so one
      // undo brings the Entry and the pair back. The row of a removed `from` Entry goes with the Entry.
      ctx.edits.writeRowsWithEdit((request) =>
        [...reserved.all]
          .filter(([, row]) => row.pairs.some((pair) => request.removedEntryIds.has(pair.to.entryId)))
          .map(([fromId, row]) => {
            const kept = row.pairs.filter((pair) => !request.removedEntryIds.has(pair.to.entryId));
            return { id: fromId, row: kept.length > 0 ? { pairs: kept } : undefined };
          }),
      );
    },
    relate,
    view(ctx) {
      const nameOf = (id: EntryId): string => ctx.dataset.entries.get(id)?.name ?? '';
      ctx.view.registerConnector(() =>
        Array.from(store?.all ?? []).flatMap(([fromId, row]) =>
          row.pairs.map((pair) => ({
            id: `related:${fromId}:${pair.fromEdge}:${pair.to.entryId}:${pair.to.edge}`,
            from: { entryId: fromId, edge: pair.fromEdge },
            to: pair.to,
            label: `${nameOf(fromId)} is related to ${nameOf(pair.to.entryId)}`,
          })),
        ),
      );
      ctx.view.onConnect(relate);
    },
  });
}
