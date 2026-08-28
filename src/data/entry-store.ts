// data/ — EntryStore, the view half plus the S2.2 transaction overlay (D-S2-2, D-S2-21). `all` stays
// committed-only by design (D-S2-3's cached-identity rule); `get`/`has`/`size`/`childrenOf` read through
// an open write set first, so a read-then-write helper inside a transaction body sees its own edits.
// The staging/apply methods below are gated by a `TxToken` only `data/transaction.ts` can mint — a
// mutation outside a transaction does not typecheck (docs/02 §3.6).

import type { ChangeSet, Entry, EntryId, EntryStoreView } from '../model/index.js';
import { entryId } from '../model/index.js';
import { computed, signal } from './reactivity.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';
import type { TxToken } from './transaction.js';

interface WriteSet {
  added: Map<EntryId, Entry>;
  removed: Set<EntryId>;
  edits: Map<EntryId, StoredEdit>;
}

export class EntryStore implements EntryStoreView {
  #byId: Map<EntryId, Entry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #all: () => readonly Entry[];
  #byParent: () => ReadonlyMap<EntryId | undefined, readonly Entry[]>;
  #writeSet: WriteSet | null = null;

  constructor(entries: readonly Entry[]) {
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
    return this.get(id) !== undefined;
  }

  get size(): number {
    if (!this.#writeSet) return this.#byId.size;
    let size = this.#byId.size;
    for (const id of this.#writeSet.added.keys()) if (!this.#byId.has(id)) size += 1;
    for (const id of this.#writeSet.removed) if (this.#byId.has(id)) size -= 1;
    return size;
  }

  /** Children of an entry, in insertion order. An entry with no children returns an empty array. */
  childrenOf(id: EntryId): readonly Entry[] {
    if (!this.#writeSet) return this.#byParent().get(id) ?? [];
    const result: Entry[] = [];
    for (const committed of this.#byId.values()) {
      if (this.#writeSet.removed.has(committed.id)) continue;
      const effective = this.get(committed.id);
      if (effective?.parentId === id) result.push(effective);
    }
    for (const added of this.#writeSet.added.values()) {
      if (added.parentId === id) result.push(added);
    }
    return result;
  }

  /** The committed snapshot a transaction diffs against — never the write set (D-S2-6, D-S2-7). */
  snapshot(): ReadonlyMap<EntryId, Entry> {
    return this.#byId;
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
      for (const { entity } of changeSet.added) this.#byId.set(entity.id, entity);
      for (const { entity } of changeSet.removed) this.#byId.delete(entity.id);
      for (const row of changeSet.updated) {
        const current = this.#byId.get(row.id);
        if (current) this.#byId.set(row.id, { ...current, [row.field]: row.to });
      }
      this.#revision.set(this.#revision.get() + 1);
    }
    this.#writeSet = null;
  }

  #openWriteSet(): WriteSet {
    if (!this.#writeSet)
      throw new Error('EntryStore: no open transaction — data/transaction.ts always opens one first');
    return this.#writeSet;
  }
}
