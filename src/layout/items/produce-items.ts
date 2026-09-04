// layout/ — the one deep seam that turns a PlannedRow's entries into Items (D-S4-19, D-S4-24, D-S4-25).
// Type, per-Gantt registry, per-Kind producers, and the row-level fallback all live here so a caller
// and an agent learn one name. Header rows (`kind: 'header'`) produce no Items.

import { itemId } from '../../model/index.js';
import type { Disposer, Entry, EntryId, EntryKind, ItemId, Instant } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';
import { isPlannedHeaderRow } from '../rows/row-source.js';

export interface Item {
  id: ItemId;
  entryId: EntryId;
  kind: EntryKind;
  label: string;
  start: Instant;
  end: Instant;
}

export type ItemProducer = (entry: Entry) => readonly Item[];

function wholeEntryItem(entry: Entry, end: Instant): Item {
  return {
    id: itemId(entry.id, 0),
    entryId: entry.id,
    kind: entry.kind,
    label: entry.name,
    start: entry.start,
    end,
  };
}

export interface ItemProducerRegistry {
  /** The producer for `kind`, or the `'span'` producer when nothing is registered. Never throws. */
  producerFor(kind: EntryKind): ItemProducer;
  /** S5.9, D-S5-22: `ctx.layout.registerItemProducer(kind, producer)` — a plugin claiming what
   *  shape a consumer-defined kind draws. Replaces whichever producer `kind` resolved to before
   *  (the shipped three included — a plugin may re-skin `'span'` itself). The returned `Disposer`
   *  restores that prior producer, the same "undo on plugin disposal" every other `register*`
   *  gives (D-S5-4). */
  register(kind: EntryKind, producer: ItemProducer): Disposer;
}

function produceSpanItems(entry: Entry): readonly Item[] {
  const segments = entry.segments;
  if (segments !== undefined && segments.length > 0) {
    return segments.map((segment, index) => ({
      id: itemId(entry.id, index),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: segment.start,
      end: segment.end,
    }));
  }
  return [wholeEntryItem(entry, entry.end)];
}

// render/ draws the bracket off data-kind (D-S4-24).
function produceGroupItems(entry: Entry): readonly Item[] {
  return [wholeEntryItem(entry, entry.end)];
}

// render/ draws the diamond off data-kind (D-S4-24).
function produceMilestoneItems(entry: Entry): readonly Item[] {
  return [wholeEntryItem(entry, entry.start)];
}

/** Call: `createItemProducerRegistry()` once in the Gantt constructor; tests pass extras for a Kind. */
export function createItemProducerRegistry(
  extras: Readonly<Partial<Record<EntryKind, ItemProducer>>> = {},
): ItemProducerRegistry {
  const producers = new Map<EntryKind, ItemProducer>([
    ['span', produceSpanItems],
    ['group', produceGroupItems],
    ['milestone', produceMilestoneItems],
  ]);
  for (const [kind, producer] of Object.entries(extras)) {
    if (producer !== undefined) producers.set(kind, producer);
  }
  return {
    producerFor(kind) {
      return producers.get(kind) ?? produceSpanItems;
    },
    register(kind, producer) {
      const previous = producers.get(kind);
      producers.set(kind, producer);
      return () => {
        if (previous === undefined) producers.delete(kind);
        else producers.set(kind, previous);
      };
    },
  };
}

/** Call: `produceItemsForRow(planned, entryById, registry)`. The registry is required — one per
 *  Gantt (I2), never a fresh one per row. */
export function produceItemsForRow(
  row: PlannedRow,
  entryById: ReadonlyMap<EntryId, Entry>,
  registry: ItemProducerRegistry,
): readonly Item[] {
  if (isPlannedHeaderRow(row)) return [];
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    items.push(...registry.producerFor(entry.kind)(entry));
  }
  return items;
}
