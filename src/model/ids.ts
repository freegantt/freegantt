// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

export type EntryId = string & { readonly __brand: 'EntryId' };
/** Identity of one Segment, stable for as long as the Segment lives — the Selection holds these
 *  (#212, ADR 0010). An index would renumber on every removal: delete the middle Segment of three
 *  and a Selection holding index 2 lights the wrong bar, and the undo that restores it repeats the
 *  mistake. */
export type SegmentId = string & { readonly __brand: 'SegmentId' };
export type RowId = string & { readonly __brand: 'RowId' };
export type ItemId = string & { readonly __brand: 'ItemId' };
export type ChangeSetId = string & { readonly __brand: 'ChangeSetId' };

export function entryId(value: string): EntryId {
  return value as EntryId;
}

export function segmentId(value: string): SegmentId {
  return value as SegmentId;
}

export function rowId(value: string): RowId {
  return value as RowId;
}

/** Minted from a Dataset's own per-instance counter (never module-level state, I2) — the posture
 * `changeSetId` takes, for the same reason: identity two writers never need to agree on. A Segment
 * a consumer authored with an id of its own keeps that id; this fills the ones nobody named. */
export function mintedSegmentId(counter: number): SegmentId {
  return `sg${counter}` as SegmentId;
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

/** Call: `itemIdFromDataset(bar.dataset['itemId'])` — the DOM→brand trust boundary for a `.fg-bar`
 *  node's `data-item-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, so a caller keeps its own "no bar hit" branch instead of taking one here. */
export function itemIdFromDataset(value: string | undefined): ItemId | undefined {
  return value === undefined ? undefined : (value as ItemId);
}

/** Call: `rowIdFromDataset(row.dataset['rowId'])` — the DOM→brand trust boundary for a `.fg-row`
 *  node's `data-row-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, mirroring `itemIdFromDataset`. */
export function rowIdFromDataset(value: string | undefined): RowId | undefined {
  return value === undefined ? undefined : (value as RowId);
}

/** Call: `entryIdFromDataset(row.dataset['entryId'])` — the DOM→brand trust boundary for a `.fg-row`
 *  node's `data-entry-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, mirroring `itemIdFromDataset`. */
export function entryIdFromDataset(value: string | undefined): EntryId | undefined {
  return value === undefined ? undefined : entryId(value);
}

/** Call: `segmentIdFromDataset(bar.dataset['segmentId'])` — the DOM→brand trust boundary for a
 *  `.fg-bar` node's `data-segment-id` attribute (`render/dom/index.ts` is what writes it).
 *  `undefined` in, `undefined` out, mirroring `itemIdFromDataset`. A bar that draws its Entry's
 *  whole span (a group, a milestone, a plugin's own kind) carries no Segment, so this stays
 *  `undefined` there too — its caller falls back to the owning Entry. */
export function segmentIdFromDataset(value: string | undefined): SegmentId | undefined {
  return value === undefined ? undefined : segmentId(value);
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
