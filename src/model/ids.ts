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
