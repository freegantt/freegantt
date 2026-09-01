// layout/ — the one deep seam that turns a PlannedRow's entries into Items (D-S4-19, D-S4-24, D-S4-25).
// Type, per-Gantt registry, per-Kind producers, and the row-level fallback all live here so a caller
// and an agent learn one name. Header rows (empty entryIds) produce no Items.

import { itemId } from '../../model/index.js';
import type { Entry, EntryId, EntryKind, ItemId, Instant } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';

export interface Item {
  id: ItemId;
  entryId: EntryId;
  kind: EntryKind;
  label: string;
  start: Instant;
  end: Instant;
}

type ItemProducer = (entry: Entry) => readonly Item[];

export interface ItemProducerRegistry {
  /** The producer for `kind`, or the `'span'` producer when nothing is registered. Never throws. */
  producerFor(kind: EntryKind): ItemProducer;
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
  return [
    {
      id: itemId(entry.id, 0),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: entry.start,
      end: entry.end,
    },
  ];
}

// render/ draws the bracket off data-kind (D-S4-24).
function produceGroupItems(entry: Entry): readonly Item[] {
  return [
    {
      id: itemId(entry.id, 0),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: entry.start,
      end: entry.end,
    },
  ];
}

// render/ draws the diamond off data-kind (D-S4-24).
function produceMilestoneItems(entry: Entry): readonly Item[] {
  return [
    {
      id: itemId(entry.id, 0),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: entry.start,
      end: entry.start,
    },
  ];
}

/** Call: `createItemProducerRegistry()` once in the Gantt constructor; tests pass extras for a Kind. */
export function createItemProducerRegistry(
  extras: Readonly<Record<string, ItemProducer>> = {},
): ItemProducerRegistry {
  const producers = new Map<string, ItemProducer>([
    ['span', produceSpanItems],
    ['group', produceGroupItems],
    ['milestone', produceMilestoneItems],
  ]);
  for (const [kind, producer] of Object.entries(extras)) producers.set(kind, producer);
  return {
    producerFor(kind) {
      return producers.get(kind) ?? produceSpanItems;
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
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = entryById.get(id);
    if (entry === undefined) continue;
    items.push(...registry.producerFor(entry.kind)(entry));
  }
  return items;
}
