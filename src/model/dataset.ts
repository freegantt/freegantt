// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array (D-S2-2). `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry, EntryEdit, EntryInput } from './entry.js';
import type { EntryId } from './ids.js';
import type { DatasetEventMap } from './change-set.js';

/** The Dataset's own read view onto its entries (D-S2-2). `all` is the committed array — see D-S2-3
 *  for its cached-identity rule and D-S2-21 for what it does *not* show while a transaction is open
 *  (`get`/`has`/`size`/`childrenOf` see a transaction's own uncommitted writes; `all` does not). */
export interface EntryStoreView {
  readonly all: readonly Entry[];
  get(id: EntryId | string): Entry | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
  /** Direct children, in insertion order. An entry with no children returns `[]`. */
  childrenOf(id: EntryId | string): readonly Entry[];
}

/** The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8). */
export interface EntryStore extends EntryStoreView {
  add(input: EntryInput): Entry;
  update(id: EntryId | string, edit: EntryEdit): Entry;
  remove(id: EntryId | string): void;
}

/** What a Gantt (and any other `change` subscriber) holds: entries, zone, and the change bus.
 *  The public `Dataset` class also exposes construction options (`dateOnlyEnd`, `derivedSpanKinds`)
 *  and `transaction()` — those stay on the class, because a view never opens a transaction. */
export interface Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}
