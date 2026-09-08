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
import type { StoredEdit, StoredEdits } from './edit-extension.js';
import type { ChangeSet, FieldUpdated, UpdatedRow } from '../model/index.js';
import { authoredEnvelopeKeysOf, readEditDetailed, readEntry } from './entry-reader.js';
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
  /** Which of `start`/`end`/`segments` the body itself named on each entry in `edits`, before
   *  `reconcileEnvelope` paired or back-derived the rest (#232) — `pendingAuthoredEnvelopeKeys()`
   *  hands this to `buildCommitChangeSet`, which needs it to tell the body's own envelope write from
   *  one an `EditExtender` cascade adds later. Keyed the same as `edits`, and only entries with a
   *  pending edit ever get an entry here. */
  authoredEnvelopeKeys: Map<EntryId, ReadonlySet<string>>;
  /** `SegmentId → EntryId`, `null` when this transaction dropped the id (finding S1, #212). Kept
   *  current by `stageAdd`/`stageUpdate`/`stageRemove`, in call order, so `entryIdOfSegment` inside
   *  an open transaction is one map lookup — never a rebuild of an overlay Entry per Segment id, and
   *  never a scan of the write set. An id absent from this map was never touched this transaction,
   *  so `#segmentOwnerInWriteSet` falls through to the committed index for it. */
  segmentOwner: Map<SegmentId, EntryId | null>;
}

/** Records a Segment ownership change into `writeSet.segmentOwner` (finding S1, #212) — called by
 *  `stageAdd`/`stageUpdate`/`stageRemove` right after each stages, so the map always reflects real
 *  call order (last write wins, the same order a committed transaction body actually ran in). `before`
 *  is `ownerId`'s Segments as staging saw them before this call; `after` is what they become —
 *  `undefined` for a removed entity. A dropped id is recorded as `null`; a kept or newly authored one
 *  points at `ownerId`. */
function recordSegmentOwnership(
  writeSet: WriteSet,
  ownerId: EntryId,
  before: readonly Segment[] | undefined,
  after: readonly Segment[] | undefined,
): void {
  const keptIds = new Set((after ?? []).map((segment) => segment.id));
  for (const segment of before ?? []) {
    if (!keptIds.has(segment.id)) writeSet.segmentOwner.set(segment.id, null);
  }
  for (const segment of after ?? []) {
    writeSet.segmentOwner.set(segment.id, ownerId);
  }
}

export class EntryStore implements EntryStoreContract {
  #byId: Map<EntryId, Entry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #all: () => readonly Entry[];
  #byParent: () => ReadonlyMap<EntryId | undefined, readonly Entry[]>;
  /** `SegmentId → EntryId` (finding 6, #212): the answer `entryIdOfSegment`/`entryIdsOfSegments`
   *  publish, and the one place that answer is computed. Maintained alongside `#byId` on every
   *  commit — `#reindexSegments`, `#rememberSegmentsOf`, `#forgetSegmentsOf` are the only writers —
   *  so a reader never rebuilds it and never scans `all` for it. */
  #entryIdBySegmentId = new Map<SegmentId, EntryId>();
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
    for (const entry of entries) this.#rememberSegmentsOf(entry);
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
    if (!this.#registry.has(key)) throw new UnknownFieldError(key, 'entries.fieldValue');
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

  /** Call: `dataset.entries.entryIdOfSegment(segmentId)`. The Entry that draws `id`, or `undefined`
   *  when no Entry does (ADR 0010, #212, finding 6) — one map lookup against `#entryIdBySegmentId`,
   *  never a walk of `all`. Read through the write set inside an open transaction, the same
   *  read-your-own-writes posture `get`/`has`/`childrenOf` already take. */
  entryIdOfSegment(id: SegmentId | string): EntryId | undefined {
    const key = segmentId(id);
    if (!this.#writeSet) return this.#entryIdBySegmentId.get(key);
    return this.#segmentOwnerInWriteSet(key);
  }

  /** Call: `dataset.entries.entryIdsOfSegments(selection)`. Every Entry named by at least one of
   *  `ids`, deduped, in the order first named (ADR 0010, #212, finding 6) — what `selectedEntryIds`
   *  and a Selection prune both need, one call each instead of a scan of `all`. An id no Entry
   *  currently draws contributes nothing, the same "skip a Segment the store dropped" rule a reader
   *  already takes. */
  entryIdsOfSegments(ids: readonly (SegmentId | string)[]): readonly EntryId[] {
    const seen = new Set<EntryId>();
    const result: EntryId[] = [];
    for (const id of ids) {
      const ownerId = this.entryIdOfSegment(id);
      if (ownerId !== undefined && !seen.has(ownerId)) {
        seen.add(ownerId);
        result.push(ownerId);
      }
    }
    return result;
  }

  /** Call: `dataset.entries.segmentIdsOfEntries(ids)`. Every Segment id these Entries draw, deduped,
   *  each Entry named once in the order first named, and each Entry's own Segments in Entry order
   *  (ADR 0010, #212, finding 10; deduped per the #212 R2 fix-plan review, finding E) — the pair to
   *  `entryIdsOfSegments`, which dedupes the same way, and what a row click, a shift-range, a keyboard
   *  select, and the published way to select an Entry all read. An id no Entry currently draws, or an
   *  Entry already named, contributes nothing. */
  segmentIdsOfEntries(ids: readonly (EntryId | string)[]): readonly SegmentId[] {
    const seen = new Set<EntryId>();
    const result: SegmentId[] = [];
    for (const id of ids) {
      const entry = this.get(id);
      if (entry === undefined || seen.has(entry.id)) continue;
      seen.add(entry.id);
      for (const segment of entry.segments) result.push(segment.id);
    }
    return result;
  }

  /** `entryIdOfSegment` inside an open transaction: one lookup at the write set's own
   *  `segmentOwner` map (finding S1, #212), the pair to `#childrenOfWriteSet`'s overlay for
   *  `childrenOf` — never a rebuild of an overlay Entry per Segment id, and never a pass over the
   *  write set. `stageAdd`/`stageUpdate`/`stageRemove` keep the map current as each stages, so a
   *  Segment id this transaction touched already carries the right answer, `null` included for one
   *  it dropped. An id this transaction never touched is absent from the map, so the committed
   *  index still answers for it. */
  #segmentOwnerInWriteSet(id: SegmentId): EntryId | undefined {
    const writeSet = this.#writeSet;
    if (!writeSet) return this.#entryIdBySegmentId.get(id);
    if (writeSet.segmentOwner.has(id)) return writeSet.segmentOwner.get(id) ?? undefined;
    return this.#entryIdBySegmentId.get(id);
  }

  /** Adds every Segment `entity` draws to `#entryIdBySegmentId`, pointing each at `entity.id`.
   *  Construction's initial seeding and a committed add both call this — the one place a Segment
   *  starts being findable through the index. */
  #rememberSegmentsOf(entity: Entry): void {
    for (const segment of entity.segments) this.#entryIdBySegmentId.set(segment.id, entity.id);
  }

  /** Removes every Segment `entity` draws from `#entryIdBySegmentId` — the mirror of
   *  `#rememberSegmentsOf`, called on a committed remove so a dropped Entry's Segments stop
   *  answering `entryIdOfSegment` with an id nothing owns any more. Guarded on current ownership
   *  (finding B3, #212): a Segment id `entity` once drew but the index now credits to a different
   *  Entry — handed off in the same commit — is that Entry's, not `entity`'s, to delete. Without the
   *  guard, processing `entity`'s row after the new owner's row deletes the new owner's live entry. */
  #forgetSegmentsOf(entity: Entry): void {
    for (const segment of entity.segments) {
      if (this.#entryIdBySegmentId.get(segment.id) === entity.id) this.#entryIdBySegmentId.delete(segment.id);
    }
  }

  /** A committed `segments` field write, `before` → `after`, on `ownerId` (finding 6, #212): drops
   *  the index entries for Segments `before` drew that `after` no longer does, then points every
   *  Segment `after` draws at `ownerId` — a moved Segment keeps its id, so this also covers the
   *  common case where nothing actually changed which ids are in play. The drop is guarded on
   *  current ownership (finding B3, #212): `#applyUpdatedRows` walks a changeset's rows in the
   *  edits map's insertion order, which is not necessarily the order the transaction body wrote
   *  them in, so a Segment id handed from one Entry to another in one commit can already carry its
   *  new owner by the time the old owner's row runs here. The guard makes this order-independent —
   *  a property row order alone cannot guarantee. */
  #reindexSegments(before: readonly Segment[], after: readonly Segment[], ownerId: EntryId): void {
    const keptIds = new Set(after.map((segment) => segment.id));
    for (const segment of before) {
      if (!keptIds.has(segment.id) && this.#entryIdBySegmentId.get(segment.id) === ownerId) {
        this.#entryIdBySegmentId.delete(segment.id);
      }
    }
    for (const segment of after) this.#entryIdBySegmentId.set(segment.id, ownerId);
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
      const entry = readEntry(input, this.#context, 'entries.add');
      this.#assertSegmentIdsUnique(entry.segments, id, 'entries.add');
      this.stageAdd(token, entry);
      return this.get(id)!;
    });
  }

  update(id: EntryId | string, edit: EntryEdit): Entry {
    return this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, 'entries.update');
      for (const field of Object.keys(edit)) {
        if (!this.#registry.has(field)) throw new UnknownFieldError(field, 'entries.update');
      }
      if (edit.parentId !== undefined) {
        this.#assertParentValid(key, entryId(edit.parentId), 'entries.update');
      }
      const current = this.get(key)!;
      const reading = readEditDetailed(edit, this.#context, current, this.#registry, 'entries.update');
      const stored = reading.stored;
      if (stored.segments !== undefined) {
        this.#assertSegmentIdsUnique(stored.segments, key, 'entries.update');
      }
      this.stageUpdate(token, key, stored, reading.authoredEnvelopeKeys);
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

  /** Finds which Entry draws each requested Segment, and groups the ids by that Entry, from
   *  `entryIdOfSegment` (finding 6, #212) — one lookup per requested id, never a scan of `all`. An
   *  id no Entry draws throws `SegmentNotFoundError` before any Entry is touched — the same posture
   *  `remove` takes on an unknown `EntryId` (S2.3 §1.3): fail before staging anything. */
  #groupSegmentsByOwner(requested: ReadonlySet<SegmentId>): ReadonlyMap<EntryId, ReadonlySet<SegmentId>> {
    const grouped = new Map<EntryId, Set<SegmentId>>();
    for (const id of requested) {
      const ownerId = this.entryIdOfSegment(id);
      if (ownerId === undefined) throw new SegmentNotFoundError(id, 'entries.removeSegments');
      const group = grouped.get(ownerId) ?? new Set<SegmentId>();
      group.add(id);
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
      this.#reparentChildrenOf(token, id, entry.parentId);
      this.stageRemove(token, id);
      return;
    }
    this.update(id, { segments: remaining });
  }

  /** Moves `id`'s direct children up to `parentId` — `id`'s own parent, or the root when it had none
   *  — before `id` is staged for removal (#212, fix plan R3). A grandchild's `parentId` already
   *  names its own (surviving) parent, so re-parenting the direct children carries the rest of the
   *  subtree with them; nothing below the direct children needs to move. */
  #reparentChildrenOf(token: TxToken, id: EntryId, parentId: EntryId | undefined): void {
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
   *  already staged, from `#segmentOwnerInWriteSet` (finding 6, S1) rather than a second walk of every Entry.
   *  Checked before `stageAdd`/`stageUpdate`, so a duplicate stages nothing. */
  #assertSegmentIdsUnique(segments: readonly Segment[], ownerId: EntryId, operation: string): void {
    const ownIds = new Set<SegmentId>();
    for (const segment of segments) {
      if (ownIds.has(segment.id)) throw new DuplicateSegmentIdError(segment.id, operation);
      ownIds.add(segment.id);
    }
    for (const id of ownIds) {
      const existingOwner = this.#segmentOwnerInWriteSet(id);
      if (existingOwner !== undefined && existingOwner !== ownerId) {
        throw new DuplicateSegmentIdError(id, operation);
      }
    }
  }

  // ---- TxToken-gated: only data/transaction.ts holds a token (docs/02 §3.6) ----

  beginTransaction(_token: TxToken): void {
    this.#writeSet = {
      added: new Map(),
      removed: new Set(),
      edits: new Map(),
      authoredEnvelopeKeys: new Map(),
      segmentOwner: new Map(),
    };
  }

  /** A re-add of an id this same transaction already staged for removal replaces it outright — the
   *  reverse of `stageRemove`'s own clearing below — so the net effect is one clean entity, not a
   *  cancelled add/remove pair the fold treats as neither happening. Reads `entry.id`'s Segments as
   *  staging saw them a moment ago (read-your-own-writes, `get`) before overwriting the maps, so a
   *  Segment the replaced object drew and `entry` does not is released, not left pointing stale
   *  (finding B4, #212) — `recordSegmentOwnership` does that release-then-claim in one call. */
  stageAdd(_token: TxToken, entry: Entry): void {
    const writeSet = this.#openWriteSet();
    const replaced = this.get(entry.id);
    writeSet.added.set(entry.id, entry);
    writeSet.removed.delete(entry.id);
    writeSet.edits.delete(entry.id);
    recordSegmentOwnership(writeSet, entry.id, replaced?.segments, entry.segments);
  }

  /** `authoredEnvelopeKeys` names which of `start`/`end`/`segments` the caller itself wrote into
   *  `edit`, before any envelope reconciliation ran (#232) — `update()` below passes the fact
   *  `readEditDetailed` already computed. A caller that stages a raw `StoredEdit` directly (a
   *  same-transaction reparent, a test fixture) has done no such reconciliation, so the default —
   *  the triad-intersection of `edit`'s own keys — is exactly that edit's authored keys too. */
  stageUpdate(
    _token: TxToken,
    id: EntryId,
    edit: StoredEdit,
    authoredEnvelopeKeys: ReadonlySet<string> = authoredEnvelopeKeysOf(edit),
  ): void {
    const writeSet = this.#openWriteSet();
    const before = edit.segments !== undefined ? this.get(id)?.segments : undefined;
    const staged = writeSet.added.get(id);
    if (staged) {
      const merged = overlayStoredEdit(staged, edit);
      writeSet.added.set(id, merged);
      if (edit.segments !== undefined) recordSegmentOwnership(writeSet, id, before, merged.segments);
      return;
    }
    writeSet.edits.set(id, mergeStoredEdits(writeSet.edits.get(id), edit));
    if (authoredEnvelopeKeys.size > 0) {
      const existing = writeSet.authoredEnvelopeKeys.get(id);
      writeSet.authoredEnvelopeKeys.set(
        id,
        existing === undefined ? authoredEnvelopeKeys : new Set([...existing, ...authoredEnvelopeKeys]),
      );
    }
    if (edit.segments !== undefined) recordSegmentOwnership(writeSet, id, before, edit.segments);
  }

  stageRemove(_token: TxToken, id: EntryId): void {
    const writeSet = this.#openWriteSet();
    const before = this.get(id)?.segments;
    writeSet.removed.add(id);
    writeSet.added.delete(id);
    writeSet.edits.delete(id);
    recordSegmentOwnership(writeSet, id, before, undefined);
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

  pendingEdits(): StoredEdits {
    return this.#writeSet?.edits ?? new Map();
  }

  /** The body's own authored envelope keys, by entry (#232) — `buildCommitChangeSet`'s I4 guard and
   *  its merge with the extender's cascade both need this, and neither can recover it from
   *  `pendingEdits()` alone: `reconcileEnvelope` folds its own added keys into the very same
   *  `proposedKeys` the body's own keys sit in. */
  pendingAuthoredEnvelopeKeys(): ReadonlyMap<EntryId, ReadonlySet<string>> {
    return this.#writeSet?.authoredEnvelopeKeys ?? new Map();
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
      for (const { entity } of changeSet.removed) {
        this.#byId.delete(entity.id);
        this.#forgetSegmentsOf(entity);
      }
      this.#restoreAdded(changeSet);
      this.#applyUpdatedRows(changeSet.updated);
      this.#revision.set(this.#revision.get() + 1);
    }
    this.#writeSet = null;
  }

  /** Entry rows only. A changeset also carries plugin-store rows (D-S5-24); `data/plugin-store.ts`
   *  applies those against its own maps, from the same `endTransaction` call. A `segments` row
   *  reindexes `#entryIdBySegmentId` (finding 6, #212) from the Entry's Segments before and after,
   *  the only place a committed edit can move a Segment between ids or off the Entry entirely. */
  #applyUpdatedRows(updated: readonly UpdatedRow[]): void {
    for (const row of updated) {
      if (row.store !== 'entries') continue;
      const current = this.#byId.get(row.id);
      if (!current) continue;
      const next = applyFieldRow(current, row.field, row.to, this.#registry);
      this.#byId.set(row.id, next);
      if (row.field === 'segments') this.#reindexSegments(current.segments, next.segments, row.id);
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

  /** Adding `entity` back — a `'user'` re-add of an id the same transaction also removed, or an
   *  undo/redo restoring a removed one — replaces whatever object currently sits at `entity.id` in
   *  `#byId`, if any. That replaced object's own Segments must be forgotten first (finding B2,
   *  #212): `endTransaction`'s removed-row loop already forgot the object this changeset's
   *  `removed` row named, but a net-zero remove-then-add of one id never produces a `removed` row —
   *  `stageAdd` clears it — so without this the old object's Segments stay indexed forever, findable
   *  under an id nothing draws any more. `#forgetSegmentsOf`'s own ownership guard makes the order
   *  against other rows in this same commit safe. */
  #forgetReplacedEntity(entity: Entry): void {
    const replaced = this.#byId.get(entity.id);
    if (replaced !== undefined && replaced !== entity) this.#forgetSegmentsOf(replaced);
  }

  #restoreAdded(changeSet: ChangeSet): void {
    if (changeSet.added.length === 0) return;
    if (changeSet.origin === 'user') {
      for (const { entity } of changeSet.added) {
        this.#forgetReplacedEntity(entity);
        this.#byId.set(entity.id, entity);
        this.#rememberSegmentsOf(entity);
      }
      return;
    }
    const entries = Array.from(this.#byId.values());
    const restored = [...changeSet.added].sort((a, b) => {
      const aIndex = this.#removedAtIndex.get(a.entity) ?? Number.POSITIVE_INFINITY;
      const bIndex = this.#removedAtIndex.get(b.entity) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
    for (const { entity } of restored) {
      this.#forgetReplacedEntity(entity);
      const index = this.#removedAtIndex.get(entity);
      if (index === undefined) entries.push(entity);
      else {
        entries.splice(Math.min(Math.max(index, 0), entries.length), 0, entity);
        this.#removedAtIndex.delete(entity);
      }
      this.#rememberSegmentsOf(entity);
    }
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
  }

  #openWriteSet(): WriteSet {
    if (!this.#writeSet)
      throw new Error('EntryStore: no open transaction — data/transaction.ts always opens one first');
    return this.#writeSet;
  }
}
