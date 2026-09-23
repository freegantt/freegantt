// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array (D-S2-2). `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry } from './entry.js';
import type { EntryEdit, FlatEntryInput, StoredEntry } from './stored-entry.js';
import type { Field, FieldKey } from './field.js';
import type { EntryId } from './ids.js';
import type { DatasetEventMap } from './change-set.js';

/** The Dataset's own read view onto its entries (D-S2-2). Every row it hands back is a live `Entry`
 *  and answers for now (ADR 0017).
 *
 *  **Two questions hide in one word.** *Which* rows exist is this collection's question, and `all`
 *  answers it as of the last commit — see D-S2-3 for its cached-identity rule and D-S2-21 for what
 *  it does *not* show while a transaction is open. *What a row is worth* is the row's own question,
 *  and every `Entry` in that array answers it now. `get`/`has`/`size` are the live membership
 *  doors. */
export interface EntryStoreView<TProps = Record<string, unknown>> {
  readonly all: readonly Entry<TProps>[];
  get(id: EntryId | string): Entry<TProps> | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
  /** The committed rows as **stored values**, keyed by id — what the edit pipeline carries (ADR
   *  0017, P4). A drag preview hands this straight to the extension hook as `EditRequest.entries`,
   *  which is committed-only by contract (D-S5-45). One map identity per commit, so a frame that
   *  reads it allocates nothing (I5).
   *
   *  A reader asking what a row is worth **now** wants `get(id)` and the live `Entry`. This door
   *  exists for the one caller that must not read now: a cascade computing a delta. */
  readonly storedValues: ReadonlyMap<EntryId, StoredEntry<TProps>>;
}

/** The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8). */
export interface EntryStore<TProps = Record<string, unknown>> extends EntryStoreView<TProps> {
  /** Declared Field keys sit flat at the top, the same shape `update()` takes (ADR 0011, Q15):
   *  `entries.add({ id, name, owner: 'Ali' })`. Nested `props` stays legal for a bag already held or
   *  a passenger key — naming one both there and at the top throws.
   *
   *  Typed as `FlatEntryInput<TProps>` (#281), not `EntryInput<TProps>` and not the `&
   *  Partial<TProps>` intersection Q15's wording first suggested — that intersection is
   *  uninhabitable by a named `EntryInput<TProps>[]` value once `TProps` defaults to an open record
   *  (`Partial<Record<string, unknown>>` demands an index signature `EntryInput` does not carry),
   *  which broke every fixture that pre-types its own array. `FlatEntryInput` closes the gap: see its
   *  own comment (`stored-entry.ts`) for why re-deriving every piece as a mapped type, instead of
   *  intersecting the named `EntryInput` interface, makes the flat key check compile. */
  add(input: FlatEntryInput<TProps>): Entry<TProps>;
  update(id: EntryId | string, edit: EntryEdit<TProps>): Entry<TProps>;
  remove(id: EntryId | string): void;
}

/** What a Gantt (and any other `change` subscriber) holds: entries, zone, and the change bus.
 *  The public `Dataset` class also exposes construction options and `transaction()` — those stay on
 *  the class, because a view never opens a transaction. There is no `isRollUpKind` any more (ADR
 *  0013): derivation is structure, so `view/capability.ts` asks `entry.hasChildren`
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
