// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array (D-S2-2). `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry, EntryEdit, EntryInput, EntryKind } from './entry.js';
import type { Field, FieldKey } from './field.js';
import type { EntryId } from './ids.js';
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
export interface EntryStoreView<TMeta = unknown> {
  readonly all: readonly Entry<TMeta>[];
  get(id: EntryId | string): Entry<TMeta> | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
  /** Direct children, in insertion order. An entry with no children returns `[]`. */
  childrenOf(id: EntryId | string): readonly Entry<TMeta>[];
  /** The value of `field` on this entry. Routes through the Field registry, so a meta Field and
   *  a compute Field take the same call as `start`. An unregistered key throws `UnknownFieldError`.
   *  A missing id throws `EntryNotFoundError`. */
  fieldValue<T>(id: EntryId | string, field: FieldKey): T | undefined;
}

/** The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8). */
export interface EntryStore<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> extends EntryStoreView<TMeta> {
  add(input: EntryInput<TMeta>): Entry<TMeta>;
  update(id: EntryId | string, edit: EntryEdit<TMeta, TFields>): Entry<TMeta>;
  remove(id: EntryId | string): void;
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
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}
