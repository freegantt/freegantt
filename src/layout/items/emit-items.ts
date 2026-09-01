// layout/ — what one PlannedRow carries as Items (D-S4-19). S4.7 replaces this with the ItemEmitter seam.

import { itemId } from '../../model/index.js';
import type { Entry, EntryId, EntryKind, Instant, ItemId } from '../../model/index.js';
import type { PlannedRow } from '../rows/row-source.js';

export interface Item {
  id: ItemId;
  entryId: EntryId;
  kind: EntryKind;
  label: string;
  start: Instant;
  end: Instant;
}

export interface ItemEmissionContext {
  entryById: ReadonlyMap<EntryId, Entry>;
}

export function emitRow(row: PlannedRow, ctx: ItemEmissionContext): readonly Item[] {
  const items: Item[] = [];
  for (const id of row.entryIds) {
    const entry = ctx.entryById.get(id);
    if (entry === undefined) continue;
    items.push({
      id: itemId(entry.id),
      entryId: entry.id,
      kind: entry.kind,
      label: entry.name,
      start: entry.start,
      end: entry.end,
    });
  }
  return items;
}
