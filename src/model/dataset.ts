// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array (D-S2-2). `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry, EntryEdit, EntryInput } from './entry.js';
import type { Field, FieldKey, FieldValue } from './field.js';
import type { EntryId, SegmentId } from './ids.js';
import type { DatasetEventMap } from './change-set.js';

/** The Dataset's own read view onto its entries (D-S2-2). `all` is the committed array — see D-S2-3
 *  for its cached-identity rule and D-S2-21 for what it does *not* show while a transaction is open
 *  (`get`/`has`/`size`/`childrenOf`/`fieldValue` see a transaction's own uncommitted writes; `all` does not). */
export interface EntryStoreView<TProps = Record<string, unknown>> {
  readonly all: readonly Entry<TProps>[];
  get(id: EntryId | string): Entry<TProps> | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
  /** Direct children, in insertion order. An entry with no children returns `[]`. */
  childrenOf(id: EntryId | string): readonly Entry<TProps>[];
  /** The value of `field` on this entry. Routes through the Field registry, so a `props` Field and
   *  a `compute` Field take the same call as `start`. An unregistered key throws `UnknownFieldError`.
   *  A missing id throws `EntryNotFoundError`.
   *
   *  The return type comes from the key: `'start'` reads as an `Instant`, and a key `TProps`
   *  declares reads as the type the consumer wrote (ADR 0005). This is the far end of the
   *  `Dataset<TProps>` generic, and where it stops. */
  fieldValue<K extends FieldKey>(id: EntryId | string, field: K): FieldValue<TProps, K> | undefined;
  /** The Entry that draws `id`, or `undefined` when no Entry does (ADR 0010, #212). Call:
   *  `dataset.entries.entryIdOfSegment(segmentId)`. */
  entryIdOfSegment(id: SegmentId | string): EntryId | undefined;
  /** Every Entry named by at least one id in `ids`, deduped, in the order first named (ADR 0010,
   *  #212). Call: `dataset.entries.entryIdsOfSegments(selection)`. */
  entryIdsOfSegments(ids: readonly (SegmentId | string)[]): readonly EntryId[];
  /** Every Segment id these Entries draw, deduped, each Entry named once in the order first named,
   *  and each Entry's own Segments in Entry order (ADR 0010, #212, finding 10) — the pair to
   *  `entryIdsOfSegments`, which dedupes the same way, and the published way to select an Entry:
   *  `gantt.selectedSegmentIds = dataset.entries.segmentIdsOfEntries([id])`. An id no Entry currently
   *  draws, or an Entry already named, contributes nothing. Call:
   *  `dataset.entries.segmentIdsOfEntries(ids)`. */
  segmentIdsOfEntries(ids: readonly (EntryId | string)[]): readonly SegmentId[];
}

/** The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8). */
export interface EntryStore<TProps = Record<string, unknown>> extends EntryStoreView<TProps> {
  /** Declared Field keys sit flat at the top, the same shape `update()` takes (ADR 0011, Q15):
   *  `entries.add({ id, name, owner: 'Ali' })`. Nested `props` stays legal for a bag already held or
   *  a passenger key — naming one both there and at the top throws.
   *
   *  Typed as plain `EntryInput<TProps>`, not the `& Partial<TProps>` intersection Q15's wording
   *  suggests: that intersection is uninhabitable by a named `EntryInput<TProps>[]` value once
   *  `TProps` defaults to an open record (`Partial<Record<string, unknown>>` demands an index
   *  signature `EntryInput` does not carry), which broke every fixture that pre-types its own array.
   *  Ingest itself still reads a flat declared key off any object at runtime — `propsFromInput`
   *  (`entry-reader.ts`) does not consult this type — so a caller loses only the static
   *  autocomplete/check, not the behaviour. Flagged for the author (BUILD-LOG Q). */
  add(input: EntryInput<TProps>): Entry<TProps>;
  update(id: EntryId | string, edit: EntryEdit<TProps>): Entry<TProps>;
  remove(id: EntryId | string): void;
  /** Removes Segments in one transaction, across several Entries when `ids` names several (ADR
   *  0010, #212). An Entry that keeps a Segment gets its envelope recomputed; an Entry whose last
   *  Segment this removes is removed with it, in the same transaction. */
  removeSegments(ids: readonly (SegmentId | string)[]): void;
}

/** What a Gantt (and any other `change` subscriber) holds: entries, zone, and the change bus.
 *  The public `Dataset` class also exposes construction options and `transaction()` — those stay on
 *  the class, because a view never opens a transaction. There is no `isRollUpKind` any more (ADR
 *  0013): derivation is structure, so `view/capability.ts` asks `entries.childrenOf(id).length > 0`
 *  directly instead of a per-kind predicate — there is no separate shape to hide. */
export interface Dataset<TProps = Record<string, unknown>> {
  readonly entries: EntryStore<TProps>;
  readonly timeZone: string;
  /** Resolved Field declarations this Dataset owns, core Fields included. */
  readonly fields: { readonly all: readonly Field[] };
  /** Resolved declaration for this key, or `undefined` when the key is not declared. */
  field(key: FieldKey): Field | undefined;
  /** Bumped on every committed changeset. Layout uses it as the pack-cache key (D-S4-26). */
  readonly datasetRevision: number;
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}
