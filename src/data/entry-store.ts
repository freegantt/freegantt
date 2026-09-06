// data/ — EntryStore, the view half plus the S2.2 transaction overlay (D-S2-2, D-S2-21), and (S2.3
// §1.1) the public mutators `dataset.entries.add/update/remove` delegate straight to. `all` stays
// committed-only by design (D-S2-3's cached-identity rule); `get`/`has`/`size`/`childrenOf`/`fieldValue`
// read through an open write set first, so a read-then-write helper inside a transaction body sees its
// own edits.
// The staging/apply methods below are gated by a `TxToken` only `data/transaction.ts` can mint — a
// mutation outside a transaction does not typecheck (docs/02 §3.6). `add`/`update`/`remove` never
// mint one themselves; they run their body through `runTransaction`, which auto-wraps when none is
// open and joins one already open (D-S2-8) — the same entry point `DatasetState.transaction()` uses.

import type {
  Entry,
  EntryId,
  EntryInput,
  EntryEdit,
  FieldContext,
  FieldKey,
  FieldValue,
  Segment,
  SegmentId,
} from '../model/index.js';
import {
  entryId,
  segmentId,
  DuplicateEntryIdError,
  DuplicateSegmentIdError,
  EntryNotFoundError,
  ParentCycleError,
  SegmentNotFoundError,
  UnknownFieldError,
} from '../model/index.js';
import type { EntryStore as EntryStoreContract } from '../model/index.js';
import { computed, signal } from './reactivity.js';
import type { EntryEdits, StoredEdit } from './edit-extension.js';
import type { ChangeSet, FieldUpdated, UpdatedRow } from '../model/index.js';
import { readEdit, readEntry } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { runTransaction } from './transaction.js';
import type { TransactionData, TxToken } from './transaction.js';
import {
  createFieldContext,
  mergeStoredEdits,
  overlayStoredEdit,
  writeOntoEntry,
} from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';

/** Writes `field` on a copy of `current`. `value === undefined` omits the key instead of setting it —
 *  an undo of an optional field's first edit must return the Entry to not having the key at all
 *  (entry construction's "no key the input never had" rule, `exactOptionalPropertyTypes`), not to
 *  having the key with value `undefined`. Declared Fields write through `writeOntoEntry`. */
function applyFieldRow(current: Entry, field: FieldKey, value: unknown, registry: FieldRegistry): Entry {
  const declared = registry.get(field);
  if (declared) return writeOntoEntry(current, declared, value);
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
  readonly #runner: TransactionData | undefined;
  readonly #registry: FieldRegistry;
  readonly #fieldContext: FieldContext;

  constructor(
    entries: readonly Entry[],
    context: EntryReadContext,
    registry: FieldRegistry = new FieldRegistry(),
    fieldContext: FieldContext = createFieldContext(registry, context.timeZone),
    runner?: TransactionData,
  ) {
    this.#context = context;
    this.#registry = registry;
    this.#fieldContext = fieldContext;
    this.#runner = runner;
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
    return edit ? overlayStoredEdit(committed, edit) : committed;
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

  /** The store is monomorphic — it never learns one consumer's field map — so the open default
   *  (`Record<string, unknown>`) is what it can promise here. `api/dataset.ts` re-types the whole
   *  store to the caller's `TFields` at the façade, in the one trusted cast documented there. */
  fieldValue<K extends FieldKey>(
    id: EntryId | string,
    field: K,
  ): FieldValue<Record<string, unknown>, K> | undefined {
    const key = String(field);
    if (!this.#registry.has(key)) throw new UnknownFieldError(key);
    const entry = this.get(id);
    if (!entry) throw new EntryNotFoundError(entryId(id), 'entries.fieldValue');
    return this.#fieldContext.read(entry, field) as FieldValue<Record<string, unknown>, K> | undefined;
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

  /** The committed by-id map a transaction diffs against — never the write set (D-S2-6, D-S2-7).
   *  Distinct from Snapshot (`entries.all`), which is the cached array. */
  committedById(): ReadonlyMap<EntryId, Entry> {
    return this.#byId;
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
      this.#assertSegmentIdsUnique(entry.segments, id);
      this.stageAdd(token, entry);
      return this.get(id)!;
    });
  }

  update(id: EntryId | string, edit: EntryEdit): Entry {
    return this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, 'entries.update');
      for (const field of Object.keys(edit)) {
        if (!this.#registry.has(field)) throw new UnknownFieldError(field);
      }
      if (edit.parentId !== undefined) {
        this.#assertParentValid(key, entryId(edit.parentId), 'entries.update');
      }
      const current = this.get(key)!;
      const stored = readEdit(edit, this.#context, current, this.#registry);
      if (stored.segments !== undefined) this.#assertSegmentIdsUnique(stored.segments, key);
      this.stageUpdate(token, key, stored);
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

  /** Removes Segments in one transaction, across several Entries when `ids` names several (#212,
   *  ADR 0010). Reads through `update`/`remove` for each Entry it touches, so the changeset reports
   *  the same `{from, to}` rows either call reports on its own — no second write path. */
  removeSegments(ids: readonly (SegmentId | string)[]): void {
    this.#mutate((token) => {
      const requested = new Set(ids.map((id) => segmentId(id)));
      if (requested.size === 0) return;
      for (const [ownerId, removedIds] of this.#groupSegmentsByOwner(requested)) {
        this.#removeSegmentsFrom(token, ownerId, removedIds);
      }
    });
  }

  /** Finds which Entry draws each requested Segment, and groups the ids by that Entry. An id no
   *  Entry draws throws `SegmentNotFoundError` before any Entry is touched — the same posture
   *  `remove` takes on an unknown `EntryId` (S2.3 §1.3): fail before staging anything. */
  #groupSegmentsByOwner(requested: ReadonlySet<SegmentId>): ReadonlyMap<EntryId, ReadonlySet<SegmentId>> {
    const ownerOf = new Map<SegmentId, EntryId>();
    for (const entry of this.all) {
      for (const segment of entry.segments) {
        if (requested.has(segment.id)) ownerOf.set(segment.id, entry.id);
      }
    }
    for (const id of requested) {
      if (!ownerOf.has(id)) throw new SegmentNotFoundError(id, 'entries.removeSegments');
    }
    const grouped = new Map<EntryId, Set<SegmentId>>();
    for (const [foundId, ownerId] of ownerOf) {
      const group = grouped.get(ownerId) ?? new Set<SegmentId>();
      group.add(foundId);
      grouped.set(ownerId, group);
    }
    return grouped;
  }

  /** Removes `removedIds` from one Entry's Segments. Removing the last one removes the Entry itself,
   *  in the same transaction — an Entry never survives as an empty record (#212). That removal is
   *  narrower than `entries.remove(id)`: it takes only `id`, never `id`'s descendants (#212, fix
   *  plan R3, ADR 0010). `entries.remove` is a deliberate "delete this branch" call; losing a last
   *  bar to a `Delete` keypress is not the same request, so a child promotes to `id`'s own parent
   *  instead of disappearing with it. Otherwise the remaining Segments go through `update`, the
   *  normal edit path, which recomputes the envelope around them itself (#212, finding 4: `readEdit`
   *  is the one owner) — this call names no `start` or `end` of its own, so there is nothing here
   *  that could disagree with them. */
  #removeSegmentsFrom(token: TxToken, id: EntryId, removedIds: ReadonlySet<SegmentId>): void {
    const entry = this.get(id)!;
    const remaining = entry.segments.filter((segment) => !removedIds.has(segment.id));
    if (remaining.length === 0) {
      this.#promoteChildrenOf(token, id, entry.parentId);
      this.stageRemove(token, id);
      return;
    }
    this.update(id, { segments: remaining });
  }

  /** Moves `id`'s direct children up to `parentId` — `id`'s own parent, or the root when it had none
   *  — before `id` is staged for removal (#212, fix plan R3). A grandchild's `parentId` already
   *  names its own (surviving) parent, so re-parenting the direct children carries the rest of the
   *  subtree with them; nothing below the direct children needs to move. */
  #promoteChildrenOf(token: TxToken, id: EntryId, parentId: EntryId | undefined): void {
    for (const child of this.childrenOf(id)) {
      const edit: StoredEdit = {};
      // Deliberate exactOptionalPropertyTypes escape, same posture as `source-strategy.ts`'s meta
      // clear: an explicit `undefined` un-parents the child to the root, distinct from the key being
      // absent, which `overlayStoredEdit` would then leave the child's parentId untouched by.
      (edit as Record<string, unknown>)['parentId'] = parentId;
      this.stageUpdate(token, child.id, edit);
    }
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

  /** No two Segments in the store share one `SegmentId` (#212, ADR 0010): not within `segments`
   *  itself, and not against any other Entry's Segments — including one this same transaction has
   *  already staged, the same read-your-own-writes posture `#assertParentValid` takes. Checked
   *  before `stageAdd`/`stageUpdate`, so a duplicate stages nothing. */
  #assertSegmentIdsUnique(segments: readonly Segment[], ownerId: EntryId): void {
    const ownIds = new Set<SegmentId>();
    for (const segment of segments) {
      if (ownIds.has(segment.id)) throw new DuplicateSegmentIdError(segment.id);
      ownIds.add(segment.id);
    }
    for (const entry of this.#liveEntries()) {
      if (entry.id === ownerId) continue;
      for (const segment of entry.segments) {
        if (ownIds.has(segment.id)) throw new DuplicateSegmentIdError(segment.id);
      }
    }
  }

  /** Every Entry as this transaction currently sees it: committed Entries with a staged edit
   *  overlaid, staged removals dropped, staged adds included — the same view `get`/`has` give one id
   *  at a time. Committed-only `all` cannot answer "does any other Entry already draw this Segment"
   *  for a Segment this transaction added earlier, so validation reads this instead. */
  #liveEntries(): readonly Entry[] {
    if (!this.#writeSet) return this.all;
    const writeSet = this.#writeSet;
    const seen = new Set<EntryId>();
    const result: Entry[] = [];
    for (const id of this.#byId.keys()) {
      if (writeSet.removed.has(id)) continue;
      seen.add(id);
      result.push(this.get(id)!);
    }
    for (const id of writeSet.added.keys()) {
      if (seen.has(id)) continue;
      result.push(this.get(id)!);
    }
    return result;
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
      writeSet.added.set(id, overlayStoredEdit(staged, edit));
      return;
    }
    writeSet.edits.set(id, mergeStoredEdits(writeSet.edits.get(id), edit));
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

  writeCommittedFieldRows(updated: readonly FieldUpdated[]): void {
    if (updated.length === 0) return;
    this.#applyUpdatedRows(updated);
    this.#revision.set(this.#revision.get() + 1);
  }

  /** Applies the committed `ChangeSet` (`undefined` for an empty net effect or a vetoed commit — the
   *  write set is simply discarded) and closes the write set. */
  endTransaction(_token: TxToken, changeSet: ChangeSet | undefined): void {
    if (changeSet) {
      this.#rememberRemovedIndexes(changeSet);
      for (const { entity } of changeSet.removed) this.#byId.delete(entity.id);
      this.#restoreAdded(changeSet);
      this.#applyUpdatedRows(changeSet.updated);
      this.#revision.set(this.#revision.get() + 1);
    }
    this.#writeSet = null;
  }

  /** Entry rows only. A changeset also carries plugin-store rows (D-S5-24); `data/plugin-store.ts`
   *  applies those against its own maps, from the same `endTransaction` call. */
  #applyUpdatedRows(updated: readonly UpdatedRow[]): void {
    for (const row of updated) {
      if (row.store !== 'entries') continue;
      const current = this.#byId.get(row.id);
      if (current) this.#byId.set(row.id, applyFieldRow(current, row.field, row.to, this.#registry));
    }
  }

  /** Records where each removed object sat, keyed by that exact object (D-S2-3). A `'user'` add of
   *  the same id later is a new object and never reads this back — it just appends. */
  #rememberRemovedIndexes(changeSet: ChangeSet): void {
    if (changeSet.removed.length === 0) return;
    const indexById = new Map<EntryId, number>();
    let index = 0;
    for (const id of this.#byId.keys()) {
      indexById.set(id, index);
      index += 1;
    }
    for (const { entity } of changeSet.removed) {
      const removedAt = indexById.get(entity.id);
      if (removedAt !== undefined) this.#removedAtIndex.set(entity, removedAt);
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
