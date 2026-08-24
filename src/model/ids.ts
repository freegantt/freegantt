// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

export type EntryId = string & { readonly __brand: 'EntryId' };
export type RowId = string & { readonly __brand: 'RowId' };
export type ItemId = string & { readonly __brand: 'ItemId' };

export function entryId(value: string): EntryId {
  return value as EntryId;
}

export function rowId(value: string): RowId {
  return value as RowId;
}

/** Item.id = `${entryId}:${segmentIndex ?? 0}` — deterministic across layout passes (plans/01 §2.4). */
export function itemId(entry: EntryId, segmentIndex = 0): ItemId {
  return `${entry}:${segmentIndex}` as ItemId;
}
