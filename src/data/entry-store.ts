// data/ — EntryStore, the view half plus the S2.2 transaction overlay (D-S2-2, D-S2-21), and (S2.3
// §1.1) the public mutators `dataset.entries.add/update/remove` delegate straight to. `all` stays
// committed-only by design (D-S2-3's cached-identity rule); `get`/`has`/`size`/`childrenOf` read through
// an open write set first, so a read-then-write helper inside a transaction body sees its own edits.
// The staging/apply methods below are gated by a `TxToken` only `data/transaction.ts` can mint — a
// mutation outside a transaction does not typecheck (docs/02 §3.6). `add`/`update`/`remove` never
// mint one themselves; they run their body through `runTransaction`, which auto-wraps when none is
// open and joins one already open (D-S2-8) — the same entry point `DatasetState.transaction()` uses.

import type { Entry, EntryId, EntryInput, EntryEdit } from '../model/index.js';
import {
  entryId,
  DuplicateEntryIdError,
  EntryNotFoundError,
  ParentCycleError,
  UnknownFieldError,
} from '../model/index.js';
import type { EntryStore as EntryStoreContract } from '../model/index.js';
import { computed, signal } from './reactivity.js';
import { CORE_FIELD_KEYS } from './change-set.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';
import type { ChangeSet, FieldKey } from '../model/index.js';
import { readEdit, readEntry } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { runTransaction } from './transaction.js';
import type { TransactionData, TxToken } from './transaction.js';

/** Writes `field` on a copy of `current`. `value === undefined` omits the key instead of setting it —
 *  an undo of an optional field's first edit must return the Entry to not having the key at all
 *  (entry construction's "no key the input never had" rule, `exactOptionalPropertyTypes`), not to
 *  having the key with value `undefined`. */
function withField(current: Entry, field: FieldKey, value: unknown): Entry {
  const next: Record<string, unknown> = { ...current };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next as unknown as Entry;
}

interface WriteSet {
  added: Map<EntryId, Entry>;
  removed: Set<EntryId>;
  edits: Map<EntryId, StoredEdit>;
}

export class EntryStore implements EntryStoreContract {
  #byId: Map<EntryId, Entry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #all: () => readonly Entry[];
  #byParent: () => ReadonlyMap<EntryId | undefined, readonly Entry[]>;
  #writeSet: WriteSet | null = null;
  /** Insertion index of an Entry object at the moment it was removed, so an undo/redo that adds it
   *  back can put it in the same place in `all` (D-S2-3). Keyed by object identity, not `EntryId`:
   *  `history.ts#invert` reuses the exact `Entry` reference between a removal and its paired
   *  restoration, so this survives an unrelated `'user'` re-add of the same id in between — an
   *  id-keyed map would let that second object's index clobber the first's (undo-all then restores
   *  the wrong insertion order). A `'user'` add is always a fresh object, so it never collides here. */
  #removedAtIndex = new Map<Entry, number>();
  #context: EntryReadContext;
  /** Bound once, right after construction, by whoever owns this store's transactions
   *  (`DatasetState`, `data/dataset-state.ts`) — `EntryStore` and its runner construct in a fixed
   *  order, so the reference cannot pass through the constructor without a cycle. `add`/`update`/
   *  `remove` are the only callers. */
  #runner: TransactionData | undefined;

  constructor(entries: readonly Entry[], context: EntryReadContext) {
    this.#context = context;
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
    // D-S2-3: rebuilt on commit, not on every read — one array identity per revision, so
    // `ScaleBinding`'s reference comparison and `BoundValue`'s equality half (D-S1.5-4) hold.
    this.#all = computed(() => {
      this.#revision.get();
      return Array.from(this.#byId.values());
    });
    this.#byParent = computed(() => {
      const byParent = new Map<EntryId | undefined, Entry[]>();
      for (const entry of this.#all()) {
        const siblings = byParent.get(entry.parentId);
        if (siblings) siblings.push(entry);
        else byParent.set(entry.parentId, [entry]);
      }
      return byParent;
    });
  }

  /** Committed only — a write set open on a transaction in progress is not reflected here (D-S2-21). */
  get all(): readonly Entry[] {
    return this.#all();
  }

  get(id: EntryId | string): Entry | undefined {
    const key = entryId(id);
    if (!this.#writeSet) return this.#byId.get(key);
    if (this.#writeSet.removed.has(key)) return undefined;
    const staged = this.#writeSet.added.get(key);
    if (staged) return staged;
    const committed = this.#byId.get(key);
    if (!committed) return undefined;
    const edit = this.#writeSet.edits.get(key);
    return edit ? { ...committed, ...edit } : committed;
  }

  has(id: EntryId | string): boolean {
    const key = entryId(id);
    if (!this.#writeSet) return this.#byId.has(key);
    if (this.#writeSet.removed.has(key)) return false;
    if (this.#writeSet.added.has(key)) return true;
    return this.#byId.has(key);
  }

  get size(): number {
    if (!this.#writeSet) return this.#byId.size;
    let size = this.#byId.size;
    for (const id of this.#writeSet.added.keys()) if (!this.#byId.has(id)) size += 1;
    for (const id of this.#writeSet.removed) if (this.#byId.has(id)) size -= 1;
    return size;
  }

  /** Children of an entry, in insertion order. An entry with no children returns an empty array. */
  childrenOf(id: EntryId | string): readonly Entry[] {
    const parent = entryId(id);
    if (!this.#writeSet) return this.#byParent().get(parent) ?? [];
    return this.#childrenOfWriteSet(parent);
  }

  /** Overlay the write set onto the committed `byParent` index — O(children + edits + adds),
   *  not O(dataset). `remove` walks this while a transaction is already open (S2.3 §1.4). */
  #childrenOfWriteSet(parent: EntryId): readonly Entry[] {
    const writeSet = this.#writeSet;
    if (!writeSet) return [];
    const seen = new Set<EntryId>();
    const result: Entry[] = [];
    const pushIfChild = (entry: Entry | undefined): void => {
      if (!entry || entry.parentId !== parent || seen.has(entry.id)) return;
      seen.add(entry.id);
      result.push(entry);
    };
    for (const committed of this.#byParent().get(parent) ?? []) {
      pushIfChild(this.get(committed.id));
    }
    for (const editedId of writeSet.edits.keys()) {
      pushIfChild(this.get(editedId));
    }
    for (const added of writeSet.added.values()) {
      pushIfChild(added);
    }
    return result;
  }

  /** The committed snapshot a transaction diffs against — never the write set (D-S2-6, D-S2-7). */
  snapshot(): ReadonlyMap<EntryId, Entry> {
    return this.#byId;
  }

  /** Wires this store to the transaction runner `add`/`update`/`remove` auto-wrap into (S2.3 §1.2).
   *  Called once, by `data/dataset-state.ts`, right after both it and this store exist. */
  bindTransactions(runner: TransactionData): void {
    this.#runner = runner;
  }

  // ---- Public mutators (S2.3 §1.1): validate against the write set, then stage; each auto-wraps in
  // a transaction via `runTransaction`, which joins one already open (D-S2-8) ----

  add(input: EntryInput): Entry {
    return this.#mutate((token) => {
      const id = entryId(input.id);
      if (this.has(id)) throw new DuplicateEntryIdError(id);
      if (input.parentId !== undefined) {
        this.#assertParentValid(id, entryId(input.parentId), 'entries.add');
      }
      const entry = readEntry(input, this.#context);
      this.stageAdd(token, entry);
      return this.get(id)!;
    });
  }

  update(id: EntryId | string, edit: EntryEdit): Entry {
    return this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, 'entries.update');
      for (const field of Object.keys(edit)) {
        if (!CORE_FIELD_KEYS.has(field)) throw new UnknownFieldError(field);
      }
      if (edit.parentId !== undefined) {
        this.#assertParentValid(key, entryId(edit.parentId), 'entries.update');
      }
      this.stageUpdate(token, key, readEdit(edit, this.#context));
      return this.get(key)!;
    });
  }

  remove(id: EntryId | string): void {
    this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, 'entries.remove');
      for (const descendantId of this.#subtreeOf(key)) this.stageRemove(token, descendantId);
      this.stageRemove(token, key);
    });
  }

  #mutate<T>(body: (token: TxToken) => T): T {
    if (!this.#runner) {
      throw new Error(
        'EntryStore: not bound to a transaction runner — data/dataset-state.ts always binds one',
      );
    }
    return runTransaction(this.#runner, body, 'user');
  }

  /** `id`'s current descendants, deepest included — read before any removal in this call is staged,
   *  so a self-referential write set never confuses the walk (S2.3 §1.4). */
  #subtreeOf(id: EntryId): readonly EntryId[] {
    const result: EntryId[] = [];
    for (const child of this.childrenOf(id)) {
      result.push(child.id);
      result.push(...this.#subtreeOf(child.id));
    }
    return result;
  }

  /** `parentId` must name a known entry and must not make `id` its own ancestor, self-parenting
   *  included (S2.3 §1.3). Read through the write set, so a reparent earlier in the same transaction
   *  is seen. */
  #assertParentValid(id: EntryId, parentId: EntryId, operation: string): void {
    if (!this.has(parentId)) throw new EntryNotFoundError(parentId, operation);
    let current: EntryId | undefined = parentId;
    while (current !== undefined) {
      if (current === id) throw new ParentCycleError(id);
      current = this.get(current)?.parentId;
    }
  }

  // ---- TxToken-gated: only data/transaction.ts holds a token (docs/02 §3.6) ----

  beginTransaction(_token: TxToken): void {
    this.#writeSet = { added: new Map(), removed: new Set(), edits: new Map() };
  }

  /** A re-add of an id this same transaction already staged for removal replaces it outright — the
   *  reverse of `stageRemove`'s own clearing below — so the net effect is one clean entity, not a
   *  cancelled add/remove pair the fold treats as neither happening. */
  stageAdd(_token: TxToken, entry: Entry): void {
    const writeSet = this.#openWriteSet();
    writeSet.added.set(entry.id, entry);
    writeSet.removed.delete(entry.id);
    writeSet.edits.delete(entry.id);
  }

  stageUpdate(_token: TxToken, id: EntryId, edit: StoredEdit): void {
    const writeSet = this.#openWriteSet();
    const staged = writeSet.added.get(id);
    if (staged) {
      writeSet.added.set(id, { ...staged, ...edit });
      return;
    }
    writeSet.edits.set(id, { ...writeSet.edits.get(id), ...edit });
  }

  stageRemove(_token: TxToken, id: EntryId): void {
    const writeSet = this.#openWriteSet();
    writeSet.removed.add(id);
    writeSet.added.delete(id);
    writeSet.edits.delete(id);
  }

  pendingAdded(): readonly { store: 'entries'; entity: Entry }[] {
    if (!this.#writeSet) return [];
    return Array.from(this.#writeSet.added.values(), (entity) => ({ store: 'entries' as const, entity }));
  }

  pendingRemoved(): readonly { store: 'entries'; entity: Entry }[] {
    if (!this.#writeSet) return [];
    const result: { store: 'entries'; entity: Entry }[] = [];
    for (const id of this.#writeSet.removed) {
      const entity = this.#byId.get(id);
      if (entity) result.push({ store: 'entries', entity });
    }
    return result;
  }

  pendingEdits(): EntryEdits {
    return this.#writeSet?.edits ?? new Map();
  }

  /** Applies the committed `ChangeSet` (`undefined` for an empty net effect or a vetoed commit — the
   *  write set is simply discarded) and closes the write set. */
  endTransaction(_token: TxToken, changeSet: ChangeSet | undefined): void {
    if (changeSet) {
      this.#rememberRemovedIndexes(changeSet);
      for (const { entity } of changeSet.removed) this.#byId.delete(entity.id);
      this.#restoreAdded(changeSet);

      for (const row of changeSet.updated) {
        const current = this.#byId.get(row.id);
        if (current) this.#byId.set(row.id, withField(current, row.field, row.to));
      }
      this.#revision.set(this.#revision.get() + 1);
    }
    this.#writeSet = null;
  }

  /** Records where each removed object sat, keyed by that exact object (D-S2-3). A `'user'` add of
   *  the same id later is a new object and never reads this back — it just appends. */
  #rememberRemovedIndexes(changeSet: ChangeSet): void {
    if (changeSet.removed.length === 0) return;
    const order = Array.from(this.#byId.keys());
    for (const { entity } of changeSet.removed) {
      const index = order.indexOf(entity.id);
      if (index !== -1) this.#removedAtIndex.set(entity, index);
    }
  }

  #restoreAdded(changeSet: ChangeSet): void {
    if (changeSet.added.length === 0) return;
    if (changeSet.origin === 'user') {
      for (const { entity } of changeSet.added) this.#byId.set(entity.id, entity);
      return;
    }
    const entries = Array.from(this.#byId.values());
    const restored = [...changeSet.added].sort((a, b) => {
      const aIndex = this.#removedAtIndex.get(a.entity) ?? Number.POSITIVE_INFINITY;
      const bIndex = this.#removedAtIndex.get(b.entity) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
    for (const { entity } of restored) {
      const index = this.#removedAtIndex.get(entity);
      if (index === undefined) entries.push(entity);
      else {
        entries.splice(Math.min(Math.max(index, 0), entries.length), 0, entity);
        this.#removedAtIndex.delete(entity);
      }
    }
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
  }

  #openWriteSet(): WriteSet {
    if (!this.#writeSet)
      throw new Error('EntryStore: no open transaction — data/transaction.ts always opens one first');
    return this.#writeSet;
  }
}
