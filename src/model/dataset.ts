// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// Moved from view/gantt-shell.ts's DatasetLike (S1.7 §3.2): layout/ needs this shape for Viewport.bind
// and may not import view/ (I1). Renamed off the naming skill's checks — CONTEXT.md's term is
// Dataset, and api/dataset.ts's Dataset class already implements this exact shape.
//
// `entries` became a store view in S2.1 (plans/s2-data-core/README.md D-S2-2): `dataset.entries.update(...)`
// is the published call site, so `dataset.entries` is the collection, not a snapshot array.

import type { Entry, EntryEdit, EntryInput } from './entry.js';
import type { EntryId } from './ids.js';

/** The Dataset's own read view onto its entries (D-S2-2). `all` is the committed array — see D-S2-3
 *  for its cached-identity rule and D-S2-21 for what it does *not* show while a transaction is open
 *  (`get`/`has`/`size` see a transaction's own uncommitted writes; `all` does not). */
export interface EntryStoreView {
  readonly all: readonly Entry[];
  get(id: EntryId | string): Entry | undefined;
  has(id: EntryId | string): boolean;
  readonly size: number;
}

/** The Dataset's entries, read and write (S2.3 §1.1) — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open (D-S2-8). */
export interface EntryStore extends EntryStoreView {
  add(input: EntryInput): Entry;
  update(id: EntryId | string, edit: EntryEdit): Entry;
  remove(id: EntryId | string): void;
}

export interface Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
}
