// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// `dataset.entries.update(...)` is the published call site, so `dataset.entries` is the collection,
// not a snapshot array. `Dataset` here is the bindable surface a Gantt holds; the public
// class adds `transaction()` and the construction-time options a view never reads.

import type { Entry } from './entry.js';
import type { EntryDelta, EntryEdit, FlatEntryInput, StoredEntry } from './stored-entry.js';
import type { Field, FieldEditable, FieldKey } from './field.js';
import type { EntryId } from './ids.js';
import type { DatasetEventMap } from './change-set.js';
import type { Disposer } from './plugin.js';

/** The Dataset's own read view onto its entries. Every row it hands back is a live `Entry`
 *  and answers for now (ADR 0017).
 *
 *  **Two questions hide in one word.** *Which* rows exist is this collection's question, and `all`
 *  answers it as of the last commit — see the cached-identity rule and what
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
   *  which is committed-only by contract. One map identity per commit, so a frame that
   *  reads it allocates nothing (I5).
   *
   *  A reader asking what a row is worth **now** wants `get(id)` and the live `Entry`. This door
   *  exists for the one caller that must not read now: a cascade computing a delta. */
  readonly storedValues: ReadonlyMap<EntryId, StoredEntry<TProps>>;
}

/** The Dataset's entries, read and write — `dataset.entries.add/update/remove`. Each
 *  mutator returns the entry as the store holds it after the call (branded id, resolved instants),
 *  never the input, and each auto-wraps itself in a transaction when none is already open.
 *  `load`, `syncAll` and `syncChanges` are the three exceptions to both: each returns `void`, and
 *  each refuses an open transaction (`TransactionAlreadyOpenError`) rather than join one — see their
 *  own comments below. */
export interface EntryStore<TProps = Record<string, unknown>> extends EntryStoreView<TProps> {
  /** Declared Field keys sit flat at the top, the same shape `update()` takes (ADR 0011):
   *  `entries.add({ id, name, owner: 'Ali' })`. Nested `props` stays legal for a bag already held or
   *  a passenger key — naming one both there and at the top throws.
   *
   *  Typed as `FlatEntryInput<TProps>` (#281), not `EntryInput<TProps>` and not the `&
   *  Partial<TProps>` intersection an earlier draft first suggested — that intersection is
   *  uninhabitable by a named `EntryInput<TProps>[]` value once `TProps` defaults to an open record
   *  (`Partial<Record<string, unknown>>` demands an index signature `EntryInput` does not carry),
   *  which broke every fixture that pre-types its own array. `FlatEntryInput` closes the gap: see its
   *  own comment (`stored-entry.ts`) for why re-deriving every piece as a mapped type, instead of
   *  intersecting the named `EntryInput` interface, makes the flat key check compile. */
  add(input: FlatEntryInput<TProps>): Entry<TProps>;
  update(id: EntryId | string, edit: EntryEdit<TProps>): Entry<TProps>;
  remove(id: EntryId | string): void;
  /** A full fresh start (#496): replaces every Entry with `inputs`, in the list's own order — a
   *  child may list before its parent, since the whole batch is checked before any of it stages
   *  (`DuplicateEntryIdError`, `EntryNotFoundError`, or `ParentCycleError` for a bad one, and
   *  nothing stages when one throws). For valid input, `entries.all` after `load(inputs)` reads the
   *  same rows, in the same order, that `new Dataset({ entries: inputs })` with this Dataset's own
   *  Fields and plugins would build — but `load` writes onto the live Dataset a mounted Gantt already
   *  holds, and it keeps no per-entry state (selection, collapse, a plugin's store row) for an id
   *  both the old data and `inputs` name.
   *
   *  Commits one `ChangeSet` with `origin: 'load'`, even when nothing changed — an empty `load()`
   *  into an empty Dataset still moves the baseline. History **clears** on it: `canUndo`/`canRedo`
   *  both read `false` right after, the same posture a desktop app takes opening a file. `beforeChange`
   *  can still veto it (`MutationCancelledError`), leaving the store and History exactly as they were.
   *
   *  Ignores a `'never'` Field lock and re-rolls a derived parent cell, the same as construction, and
   *  runs no `EditExtender` cascade — construction runs none either. Refuses with
   *  `TransactionAlreadyOpenError` when called inside `dataset.transaction()`: `load` is always its
   *  own transaction.
   *
   *  The undoable, diffing counterpart that keeps per-entry state for a kept id is `entries.syncAll()`
   *  (#517). */
  load(inputs: readonly FlatEntryInput<TProps>[]): void;
  /** Matches a live Dataset to `inputs` by diffing instead of replacing (#517): an id the list omits
   *  is removed, a key a kept entry's input omits is cleared, and a Field whose value did not change
   *  writes no row. After `syncAll(inputs)`, the entry ids, every declared Field value (`siblingIndex`
   *  included) and the tree are the same as `load(inputs)` would leave — only History and per-entry
   *  state differ. A kept id keeps its selection, its collapse state and its plugin store rows; a
   *  removed id loses them, and an undo brings a removed id's store rows back with it. An undeclared
   *  `props` key on a kept id is not written: declare the Field to sync it.
   *
   *  Writes through the same door `load` uses: it ignores a `'never'` Field lock, a derived parent
   *  cell re-rolls instead of taking an authored value, and no `EditExtender` cascade runs.
   *  `beforeChange` can veto the whole call. Refuses with `TransactionAlreadyOpenError` inside
   *  `dataset.transaction()`, `MutationDuringExtensionHookError` from the extension hook, and
   *  `MutationDuringNotificationError` from inside a `beforeChange` or `change` handler.
   *
   *  Commits one `ChangeSet` with `origin: 'sync'`. Unlike a user edit, it records **no** undo step
   *  and erases no Redo — the user's own earlier steps stay undoable across a poll. A sync that
   *  changes nothing commits nothing: no `beforeChange`, no `change`, and no undo step — the common
   *  case for a server poll that finds nothing new. A local edit the server has not seen is
   *  overwritten, last write wins. An undo of that edit later keeps the server's value (see
   *  `docs/11-server-data.md`). */
  syncAll(inputs: readonly FlatEntryInput<TProps>[]): void;
  /** Applies only the rows a server changed, where `syncAll` takes the whole list. An `upsert` row
   *  with a new id adds an entry. A row with a known id edits that entry: an omitted key keeps its
   *  value, and `undefined` clears it. `remove` drops each id with its subtree and ignores an
   *  unknown id. An id in both lists throws `DuplicateEntryIdError`, and nothing applies. Writes and
   *  commits the way `syncAll` does, so a delta that changes nothing commits nothing (see
   *  `docs/11-server-data.md`). */
  syncChanges(delta: EntryDelta<TProps>): void;
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
  /** The effective lock on this Entry's cell (#473): a plugin's per-entry lock rule's own answer, or
   *  the Field's own `editable` when the rule has no opinion. The same answer `entries.update()`, an
   *  `EditExtender` cascade, and the grid already read (I14) — this is the query door onto it. An
   *  undeclared key answers `'never'`: nothing is written to a key nothing declares. A `compute`
   *  Field answers `'never'` too — it owns no stored home to write. */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable;
  /** Bumped on every committed changeset. Layout uses it as the pack-cache key. */
  readonly datasetRevision: number;
  on<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): Disposer;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}
