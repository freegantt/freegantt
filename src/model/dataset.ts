// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array (D-S2-2). `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry, EntryEdit, EntryInput, EntryKind } from './entry.js';
import type { Field, FieldKey, FieldValue } from './field.js';
import type { EntryId, SegmentId } from './ids.js';
import type { DatasetEventMap } from './change-set.js';

/** Which parent Kinds derive rolling-up Fields from their children (`01` §2.6, D-S4-6). `'none'` and
 *  `[]` both mean no Kind derives. */
export type RollUpKinds = readonly EntryKind[] | 'none';

/** Parent/child Kind policy on a Dataset (`02` §2, D-S4-17). Default is on. Call:
 *  `new Dataset({ hierarchy: { autoGroup: false }, entries })` to opt out. */
export interface DatasetHierarchy {
  readonly autoGroup: boolean;
}

/** The Dataset's own read view onto its entries (D-S2-2). `all` is the committed array — see D-S2-3
 *  for its cached-identity rule and D-S2-21 for what it does *not* show while a transaction is open
 *  (`get`/`has`/`size`/`childrenOf`/`fieldValue` see a transaction's own uncommitted writes; `all` does not). */
export interface EntryStoreView<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly all: readonly Entry<TMeta>[];
  get(id: EntryId | string): Entry<TMeta> | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
  /** Direct children, in insertion order. An entry with no children returns `[]`. */
  childrenOf(id: EntryId | string): readonly Entry<TMeta>[];
  /** The value of `field` on this entry. Routes through the Field registry, so a meta Field and
   *  a compute Field take the same call as `start`. An unregistered key throws `UnknownFieldError`.
   *  A missing id throws `EntryNotFoundError`.
   *
   *  The return type comes from the key: `'start'` reads as an `Instant`, and a key `TFields`
   *  declares reads as the type the consumer wrote (ADR 0005). This is the far end of the
   *  `Dataset<TMeta, TFields>` generics, and where they stop. */
  fieldValue<K extends FieldKey>(id: EntryId | string, field: K): FieldValue<TFields, K> | undefined;
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
export interface EntryStore<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> extends EntryStoreView<TMeta, TFields> {
  add(input: EntryInput<TMeta>): Entry<TMeta>;
  update(id: EntryId | string, edit: EntryEdit<TMeta, TFields>): Entry<TMeta>;
  remove(id: EntryId | string): void;
  /** Removes Segments in one transaction, across several Entries when `ids` names several (ADR
   *  0010, #212). An Entry that keeps a Segment gets its envelope recomputed; an Entry whose last
   *  Segment this removes is removed with it, in the same transaction. */
  removeSegments(ids: readonly (SegmentId | string)[]): void;
}

/** What a Gantt (and any other `change` subscriber) holds: entries, zone, and the change bus.
 *  The public `Dataset` class also exposes construction options (`dateOnlyEnd`, `rollUpKinds`'s
 *  full list) and `transaction()` — those stay on the class, because a view never opens a transaction.
 *  `isRollUpKind` is the one exception (S3, D-S3-9): `view/capability.ts`'s per-kind default
 *  table needs to know whether an entry's values are the Rollup's output before it can answer whether
 *  that entry accepts `move`/`resize`, and a single predicate answers that without exposing the
 *  `rollUpKinds` set's own shape (`ReadonlySet` internally, a plain array on the public class). */
export interface Dataset<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>> {
  readonly entries: EntryStore<TMeta, TFields>;
  readonly timeZone: string;
  /** Resolved Field declarations this Dataset owns, core Fields included. */
  readonly fields: { readonly all: readonly Field[] };
  /** Resolved declaration for this key, or `undefined` when the key is not declared. */
  field(key: FieldKey): Field | undefined;
  isRollUpKind(kind: EntryKind): boolean;
  /** Bumped on every committed changeset. Layout uses it as the pack-cache key (D-S4-26).
   *  Optional so a test Dataset may omit it. */
  readonly datasetRevision?: number;
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}
