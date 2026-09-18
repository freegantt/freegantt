// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).

export type EntryId = string & { readonly __brand: 'EntryId' };
export type RowId = string & { readonly __brand: 'RowId' };
export type BarId = string & { readonly __brand: 'BarId' };
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

/** Bar.id = `${entryId}:${partIndex ?? 0}` — deterministic across layout passes (plans/01 §2.4). A
 *  core producer always calls this with the default: an Entry draws one Bar over its own span
 *  (#421, ADR 0026). The index stays for a plugin's own `BarProducer` that draws several Bars for
 *  one Entry. */
export function barId(entry: EntryId, partIndex = 0): BarId {
  return `${entry}:${partIndex}` as BarId;
}

/** Call: `barIdFromDataset(bar.dataset['barId'])` — the DOM→brand trust boundary for a `.fg-bar`
 *  node's `data-bar-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, so a caller keeps its own "no bar hit" branch instead of taking one here. */
export function barIdFromDataset(value: string | undefined): BarId | undefined {
  return value === undefined ? undefined : (value as BarId);
}

/** Call: `rowIdFromDataset(row.dataset['rowId'])` — the DOM→brand trust boundary for a `.fg-row`
 *  node's `data-row-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, mirroring `barIdFromDataset`. */
export function rowIdFromDataset(value: string | undefined): RowId | undefined {
  return value === undefined ? undefined : (value as RowId);
}

/** Call: `entryIdFromDataset(row.dataset['entryId'])` — the DOM→brand trust boundary for a `.fg-row`
 *  node's `data-entry-id` attribute (`render/dom/index.ts` is what writes it). `undefined` in,
 *  `undefined` out, mirroring `barIdFromDataset`. */
export function entryIdFromDataset(value: string | undefined): EntryId | undefined {
  return value === undefined ? undefined : entryId(value);
}

/** Call: `dataset.entries.get(entryIdOfBar(hit.barId))`. Splits on the last colon so an EntryId that
 *  itself contains a colon still round-trips with `barId`. */
export function entryIdOfBar(id: BarId): EntryId {
  const sep = id.lastIndexOf(':');
  return entryId(sep < 0 ? id : id.slice(0, sep));
}

/** Call: `partIndexOfBar(bar.id)` — the index `barId` wrote. Core's own producers always write 0;
 *  a plugin's own `BarProducer` that draws several Bars for one Entry writes the rest. */
export function partIndexOfBar(id: BarId): number {
  const sep = id.lastIndexOf(':');
  if (sep < 0) return 0;
  const index = Number(id.slice(sep + 1));
  return Number.isFinite(index) ? index : 0;
}
