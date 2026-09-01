// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

export type EntryId = string & { readonly __brand: 'EntryId' };
export type RowId = string & { readonly __brand: 'RowId' };
export type ItemId = string & { readonly __brand: 'ItemId' };
export type ChangeSetId = string & { readonly __brand: 'ChangeSetId' };

export function entryId(value: string): EntryId {
  return value as EntryId;
}

export function rowId(value: string): RowId {
  return value as RowId;
}

/** Minted from a Dataset's own per-instance counter (never module-level state, I2) — not a sync
 * token, just identity two writers never need to agree on (plans/s2-data-core/README.md D-S2-7). */
export function changeSetId(counter: number): ChangeSetId {
  return `cs${counter}` as ChangeSetId;
}

/** Item.id = `${entryId}:${segmentIndex ?? 0}` — deterministic across layout passes (plans/01 §2.4). */
export function itemId(entry: EntryId, segmentIndex = 0): ItemId {
  return `${entry}:${segmentIndex}` as ItemId;
}

/** Call: `dataset.entries.get(entryIdOfItem(hit.itemId))`. Splits on the last colon so an EntryId that
 *  itself contains a colon still round-trips with `itemId`. */
export function entryIdOfItem(id: ItemId): EntryId {
  const sep = id.lastIndexOf(':');
  return entryId(sep < 0 ? id : id.slice(0, sep));
}

/** Call: `segmentIndexOfItem(item.id)` — the index `itemId` wrote. */
export function segmentIndexOfItem(id: ItemId): number {
  const sep = id.lastIndexOf(':');
  if (sep < 0) return 0;
  const index = Number(id.slice(sep + 1));
  return Number.isFinite(index) ? index : 0;
}
