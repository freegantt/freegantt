// data/ — EntryStore, the view half plus the S2.2 transaction overlay (D-S2-2, D-S2-21), and (S2.3
// §1.1) the public mutators `dataset.entries.add/update/remove` delegate straight to.
//
// Two questions hide in one word, and `all` answers them differently (ADR 0017, rule 2). *Which*
// rows exist is the collection's question, and `all` answers it as of the last commit — the array is
// a `computed` bound to `#revision`, and `ScaleBinding` compares it by reference (D-S1.5-4, D-S2-3).
// *What a row is worth* is the row's question, and every `Entry` in that array answers it now.
// `get`/`has`/`size` read through an open write set, so a read-then-write helper inside a
// transaction body sees its own edits.
// The staging/apply methods below are gated by a `TxToken` only `data/transaction.ts` can mint — a
// mutation outside a transaction does not typecheck (docs/02 §3.6). `add`/`update`/`remove` never
// mint one themselves; they run their body through `runTransaction`, which auto-wraps when none is
// open and joins one already open (D-S2-8) — the same entry point `DatasetState.transaction()` uses.

import type {
  Entry,
  StoredEntry,
  EntryId,
  EntryInput,
  EntryEdit,
  EntryEdits,
  FieldKey,
  HierarchySource,
  HierarchySourceWrapper,
  RaiseError,
  Segment,
  SegmentId,
} from '../model/index.js';
import {
  entryId,
  segmentId,
  ComputedFieldCannotBeWrittenError,
  DerivedFieldNotWritableError,
  DuplicateEntryIdError,
  DuplicateSegmentIdError,
  EntryNotFoundError,
  FieldNotEditableError,
  ParentCycleError,
  SegmentNotFoundError,
  UnknownFieldError,
} from '../model/index.js';
import type { EntryStore as EntryStoreContract } from '../model/index.js';
import { computed, signal } from './reactivity.js';
import type { ProposedEdit, ProposedEdits } from './edit-extension.js';
import type { ChangeSet, FieldUpdated, UpdatedRow } from '../model/index.js';
import { authoredEnvelopeKeysOf, toEditReading, toEntry } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { runTransaction } from './transaction.js';
import type { TransactionData, TxToken } from './transaction.js';
import {
  createFieldAccess,
  createRollUpContext,
  measureEntryDuration,
  mergeProposedEdits,
  entryAfterEdit,
  readField,
  readingChildrenFrom,
  readingParentFrom,
  writeOntoEntry,
} from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import { LiveEntries, unknownFieldError } from './live-entry.js';
import { checkHierarchyAnswers, parentIdFrom, storedParentSource } from './hierarchy-source.js';
import type { CheckedHierarchy, ParentIndex } from './hierarchy-source.js';
import { FieldRegistry } from './fields/field-registry.js';
import { isApiEditable, resolveWriteTarget } from './write-rule.js';

/** Writes `field` on a copy of `current`. `value === undefined` omits the key instead of setting it —
 *  an undo of an optional field's first edit must return the Entry to not having the key at all
 *  (entry construction's "no key the input never had" rule, `exactOptionalPropertyTypes`), not to
 *  having the key with value `undefined`. Declared Fields write through `writeOntoEntry`. */
function applyFieldRow(
  current: StoredEntry,
  field: FieldKey,
  value: unknown,
  registry: FieldRegistry,
): StoredEntry {
  const declared = registry.get(field);
  if (declared) return writeOntoEntry(current, declared, value);
  const next: Record<string, unknown> = { ...current };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next as unknown as StoredEntry;
}

interface WriteSet {
  added: Map<EntryId, StoredEntry>;
  removed: Set<EntryId>;
  edits: Map<EntryId, ProposedEdit>;
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
  /** Every id the hierarchy source named as a parent of a staged add or update, in this transaction.
   *  A filter, not an index: it over-answers (an id whose child was later reparented away stays in
   *  it), and a miss is the only answer it is trusted for. `#hasChildren` runs on every consumer
   *  write, and without this it would walk the staged edits each time — the O(n²) shape finding S1
   *  (#212) already killed once for Segment ids. Kept current by `stageAdd`/`stageUpdate`, the same
   *  way `segmentOwner` is.
   *
   *  It reads the **source**, never `edit.parentId` (ADR 0020). A plugin source may answer out of a
   *  `props` key, so an edit that moves a row names no `parentId` at all — a filter built from the
   *  write shape would miss that move and `#hasChildren` would answer a stale `false`.
   *
   *  That source call is not free, and the cost is accepted (`V2`). A source reads a whole
   *  `StoredEntry`, so asking it about a staged row materialises that row: one `entryAfterEdit`
   *  copy per staged update, at `pointerup`. A parent-bar drag over a 5,000-row subtree allocates
   *  5,000 of them in one commit. It stays off the hot path — one transaction per gesture, at
   *  commit, never once per frame (I5). */
  stagedParents: Set<EntryId>;
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
  #byId: Map<EntryId, StoredEntry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #all: () => readonly StoredEntry[];
  /** The same array identity rule as `#all`, one revision at a time — the elements are the live
   *  rows `layout/` receives (`gantt-shell.ts` hands this straight on). */
  #allLive: () => readonly Entry[];
  /** Which Entry the hierarchy source says is the parent of this one (ADR 0020). A `signal`, not a
   *  plain field, because a plugin claims the seam after this store is built — every index below
   *  reads it, so composing a source invalidates them all. */
  #hierarchySource = signal<HierarchySource>(storedParentSource);
  /** The source's answers for the committed rows, after core checked them (ADR 0020). One pass per
   *  revision, and a **pure** one: it refuses an answer but raises nothing, so what a reader sees
   *  never depends on who read first (`F5`). `#reportRefusedHierarchyAnswers` raises. */
  #hierarchy: () => CheckedHierarchy;
  /** Which answers have already been raised, and for which revision. A revision is the documented
   *  unit — one report per refused answer per revision — and a plugin that composes the seam checks
   *  again inside the same revision, so the same bad answer must not be raised twice for it. */
  #reportedRefusals = { revision: -1, messages: new Set<string>() };
  #byParent: () => ReadonlyMap<EntryId | undefined, readonly StoredEntry[]>;
  /** `#byParent`, ids only and with the root key (`undefined`) dropped — the same shape
   *  `childIdsByParent` derives on demand, memoized here instead so a caller with nothing to prove
   *  wrong (a commit that touched no row) can read it rather than re-derive it (#421 C4). */
  #childIds: () => ReadonlyMap<EntryId, readonly EntryId[]>;
  /** Ancestor count per committed row, cached beside `#byParent` for the same reason `hasChildren`
   *  is: `entry.depth` is a property, and a walk inside a getter breaks ADR 0017's rule 4. */
  #depthById: () => ReadonlyMap<EntryId, number>;
  /** One `Entry` per id, for the store's lifetime (ADR 0017, rule 2). */
  #live: LiveEntries;
  #access: FieldAccess;
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
  #removedAtIndex = new Map<StoredEntry, number>();
  #context: EntryReadContext;
  readonly #runner: TransactionData | undefined;
  readonly #registry: FieldRegistry;
  /** Where a refused hierarchy answer goes (ADR 0020). The default keeps each site's own `console`
   *  line, the same posture `render/dom`'s backend options take. */
  readonly #raiseError: RaiseError;

  constructor(
    entries: readonly StoredEntry[],
    context: EntryReadContext,
    registry: FieldRegistry = new FieldRegistry(),
    access: FieldAccess = createFieldAccess({ fields: registry, timeZone: context.timeZone }),
    runner?: TransactionData,
    raiseError: RaiseError = (_report, fallback) => fallback?.(),
  ) {
    this.#raiseError = raiseError;
    this.#context = context;
    this.#registry = registry;
    // The store is the tree a Field read walks: a `compute` Field asking `ctx.children()` outside a
    // Rollup pass means the row the store holds now (#214).
    this.#access = readingParentFrom(
      readingChildrenFrom(access, (id) => this.storedChildrenOf(id)),
      (entry) => this.parentIdOf(entry),
    );
    this.#live = new LiveEntries({
      storedEntry: (id) => this.storedEntry(id),
      storedChildrenOf: (id) => this.storedChildrenOf(id),
      hasChildren: (id) => this.#hasChildren(id),
      depthOf: (id) => this.#depthOf(id),
      parentIdOf: (entry) => this.parentIdOf(entry),
      entryFor: (id) => this.#live.for(id),
      readField: (entry, key) => {
        const field = this.#registry.get(key);
        if (field === undefined) throw unknownFieldError(key);
        return readField(entry, field, this.#access);
      },
      durationOf: (entry) => measureEntryDuration(entry, this.#access.measureDuration),
    });
    this.#runner = runner;
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
    for (const entry of entries) this.#rememberSegmentsOf(entry);
    // D-S2-3: rebuilt on commit, not on every read — one array identity per revision, so
    // `ScaleBinding`'s reference comparison and `BoundValue`'s equality half (D-S1.5-4) hold.
    this.#all = computed(() => {
      this.#revision.get();
      return Array.from(this.#byId.values());
    });
    this.#allLive = computed(() => this.#all().map((entry) => this.#live.for(entry.id)));
    this.#hierarchy = computed(() => {
      this.#revision.get();
      return checkHierarchyAnswers(this.#byId, this.#hierarchySource.get());
    });
    this.#byParent = computed(() => {
      // Core inverts the source's answer (ADR 0020). One parent per Entry goes in, so nothing can
      // produce two parents for one row, and sibling order stays the order the rows are in.
      const parentById = this.committedParents();
      const byParent = new Map<EntryId | undefined, StoredEntry[]>();
      for (const entry of this.#all()) {
        const parentId = parentById.get(entry.id);
        const siblings = byParent.get(parentId);
        if (siblings) siblings.push(entry);
        else byParent.set(parentId, [entry]);
      }
      return byParent;
    });
    this.#childIds = computed(() => {
      const childIds = new Map<EntryId, readonly EntryId[]>();
      for (const [parentId, children] of this.#byParent()) {
        if (parentId === undefined) continue;
        childIds.set(
          parentId,
          children.map((child) => child.id),
        );
      }
      return childIds;
    });
    this.#depthById = computed(() => {
      const byParent = this.#byParent();
      const depthById = new Map<EntryId, number>();
      const walk = (parentId: EntryId | undefined, depth: number): void => {
        for (const child of byParent.get(parentId) ?? []) {
          if (depthById.has(child.id)) continue;
          depthById.set(child.id, depth);
          walk(child.id, depth + 1);
        }
      };
      walk(undefined, 0);
      return depthById;
    });
    // The authored rows are answers too, and nobody has read a row yet (`F5`).
    this.#reportRefusedHierarchyAnswers();
  }

  /** The checked tree for the committed rows. Memoized per revision, so the commit path, the Rollup
   *  and every live row read one index rather than three walks that happen to agree (`F6`). */
  committedParents(): ParentIndex {
    return this.#hierarchy().parents;
  }

  /** Each committed parent's children, by id, in dataset order. Memoized per revision beside
   *  `committedParents` — the Rollup reads this instead of re-deriving `childIdsByParent` when a
   *  commit moves no row (#421 C4). An id with no children of its own has no key here. */
  committedChildIds(): ReadonlyMap<EntryId, readonly EntryId[]> {
    return this.#childIds();
  }

  /** Raises every answer core refused, once (ADR 0020, `F5`).
   *
   *  Called where the answers can change and nowhere else — at construction, on every commit, and
   *  each time a plugin composes the seam. Not from the read path: a Fault that waits for somebody
   *  to look is a Fault a headless Dataset never sees, and a plugin's own tests run headless.
   *  A construction-time refusal reaches the `console` fallback and no `error` handler, because no
   *  consumer can subscribe before the constructor returns — the same posture the construction
   *  Rollup's own `derived-values-dropped` report already takes (ADR 0013, decision 5).
   *
   *  The raise lands after the write set closes and before `change` fans out, so a handler that
   *  writes in response is outside the notification window `data/` forbids a mutation in. */
  #reportRefusedHierarchyAnswers(): void {
    const revision = this.#revision.get();
    if (this.#reportedRefusals.revision !== revision) {
      this.#reportedRefusals = { revision, messages: new Set<string>() };
    }
    const raised = this.#reportedRefusals.messages;
    for (const report of this.#hierarchy().refused) {
      if (raised.has(report.message)) continue;
      raised.add(report.message);
      this.#raiseError(report, () => console.warn(`FreeGantt: ${report.message}`));
    }
  }

  /** How many ancestors `id` has. The committed index answers it for free; an open transaction
   *  walks the live parent chain, which no frame ever does. */
  #depthOf(id: EntryId): number {
    if (!this.#writeSet) return this.#depthById().get(id) ?? 0;
    let depth = 0;
    let parentId = this.#parentIdInWriteSet(id);
    const seen = new Set<EntryId>([id]);
    while (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      depth += 1;
      parentId = this.#parentIdInWriteSet(parentId);
    }
    return depth;
  }

  /** The parent of `id` as this transaction leaves it — the raw source, guarded by the caller's own
   *  `seen` set. The committed index runs the full check once per revision (ADR 0020); a walk inside
   *  an open transaction must stay O(chain), so it guards against a loop rather than finding one. */
  #parentIdInWriteSet(id: EntryId): EntryId | undefined {
    const entry = this.storedEntry(id);
    return entry === undefined ? undefined : this.#askSource(entry);
  }

  /** One call to whichever source is current, branded. Every tree read inside an open transaction
   *  goes through this — the committed index goes through `checkHierarchyAnswers` instead. */
  #askSource(entry: StoredEntry): EntryId | undefined {
    return parentIdFrom(this.#hierarchySource.get(), entry);
  }

  /** Which Entry is the parent of this row, as the rest of the library must read it (ADR 0020).
   *  Committed, it is the checked answer the index holds. Inside an open transaction, it is what the
   *  source says about the row this transaction leaves. */
  parentIdOf(entry: StoredEntry): EntryId | undefined {
    if (!this.#writeSet) return this.committedParents().get(entry.id);
    return this.#askSource(entry);
  }

  /** The source every tree read in this store goes through. `data/`'s commit path and the Rollup
   *  read the same one, so the tree and the Rollup can never disagree (ADR 0020). */
  get hierarchySource(): HierarchySource {
    return this.#hierarchySource.get();
  }

  /** Call: `ctx.hierarchy.setSource((next) => (entry) => entry.props.phaseId ?? next(entry))`.
   *  Installing composes onto the current occupant rather than evicting it, the same way
   *  `setExtender` does (D-S5-23) — core's own `(entry) => entry.parentId` is the first occupant and
   *  has no special claim on the seam. Not on `EntryStoreView`: this is a plugin-author door, and it
   *  reaches a plugin through `ctx.hierarchy` alone. */
  setHierarchySource(wrap: HierarchySourceWrapper): void {
    this.#hierarchySource.set(wrap(this.#hierarchySource.get()));
    // A new occupant answers about the rows already here, so its refused answers are news now
    // (`F5`) — not when the next commit or the next read happens to ask.
    this.#reportRefusedHierarchyAnswers();
  }

  /** Live rows; *which* rows is committed-only, so this array does not grow inside an open
   *  transaction (D-S2-21, ADR 0017 rule 2). Each row in it reads the write set. */
  get all(): readonly Entry[] {
    return this.#allLive();
  }

  /** The committed rows as the store holds them — what the commit path and the Rollup read. */
  get allStored(): readonly StoredEntry[] {
    return this.#all();
  }

  /** The committed rows as stored values, keyed by id (ADR 0017, P4). The store's own index, handed
   *  out read-only — never a copy, so a drag preview reading it every frame allocates nothing. */
  get storedValues(): ReadonlyMap<EntryId, StoredEntry> {
    return this.#byId;
  }

  /** The live row for `id`, or `undefined` once nothing by that id exists. */
  get(id: EntryId | string): Entry | undefined {
    const key = entryId(id);
    return this.storedEntry(key) === undefined ? undefined : this.#live.for(key);
  }

  /** The row as this transaction leaves it — what the edit pipeline carries (ADR 0017). `get`
   *  below hands back the live `Entry` a reader asks its questions of. */
  storedEntry(id: EntryId | string): StoredEntry | undefined {
    const key = entryId(id);
    if (!this.#writeSet) return this.#byId.get(key);
    if (this.#writeSet.removed.has(key)) return undefined;
    const staged = this.#writeSet.added.get(key);
    if (staged) return staged;
    const committed = this.#byId.get(key);
    if (!committed) return undefined;
    const edit = this.#writeSet.edits.get(key);
    return edit ? entryAfterEdit(committed, edit) : committed;
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
  storedChildrenOf(id: EntryId | string): readonly StoredEntry[] {
    const parent = entryId(id);
    if (!this.#writeSet) return this.#byParent().get(parent) ?? [];
    return this.#childrenOfWriteSet(parent);
  }

  /** Overlay the write set onto the committed `byParent` index — O(children + edits + adds),
   *  not O(dataset). `remove` walks this while a transaction is already open (S2.3 §1.4). */
  #childrenOfWriteSet(parent: EntryId): readonly StoredEntry[] {
    const writeSet = this.#writeSet;
    if (!writeSet) return [];
    const seen = new Set<EntryId>();
    const result: StoredEntry[] = [];
    const pushIfChild = (entry: StoredEntry | undefined): void => {
      if (!entry || this.#askSource(entry) !== parent || seen.has(entry.id)) return;
      seen.add(entry.id);
      result.push(entry);
    };
    for (const committed of this.#byParent().get(parent) ?? []) {
      pushIfChild(this.storedEntry(committed.id));
    }
    for (const editedId of writeSet.edits.keys()) {
      pushIfChild(this.storedEntry(editedId));
    }
    for (const added of writeSet.added.values()) {
      pushIfChild(added);
    }
    return result;
  }

  /** Does this Entry derive — has it at least one child, as this transaction leaves it (ADR 0013)?
   *  The consumer door asks this on every write, so it answers without building one overlay Entry per
   *  staged edit, which is what `storedChildrenOf` above does: it reads the committed index first, and
   *  reaches the staged edits only when `stagedParents` says some edit named this id as a parent. */
  #hasChildren(parent: EntryId): boolean {
    const writeSet = this.#writeSet;
    for (const committed of this.#byParent().get(parent) ?? []) {
      if (!writeSet) return true;
      if (writeSet.removed.has(committed.id)) continue;
      // One row as this transaction leaves it, and one source call on it. `storedEntry` allocates
      // only for a row this transaction actually edited, so this stays O(children).
      const now = this.storedEntry(committed.id);
      if (now !== undefined && this.#askSource(now) === parent) return true;
    }
    if (!writeSet || !writeSet.stagedParents.has(parent)) return false;
    for (const added of writeSet.added.values()) {
      if (this.#askSource(added) === parent) return true;
    }
    for (const id of writeSet.edits.keys()) {
      if (writeSet.removed.has(id)) continue;
      const edited = this.storedEntry(id);
      if (edited !== undefined && this.#askSource(edited) === parent) return true;
    }
    return false;
  }

  /** Call: `dataset.entries.entryIdOfSegment(segmentId)`. The Entry that draws `id`, or `undefined`
   *  when no Entry does (ADR 0010, #212, finding 6) — one map lookup against `#entryIdBySegmentId`,
   *  never a walk of `all`. Read through the write set inside an open transaction, the same
   *  read-your-own-writes posture `get`/`has` and every live row already take. */
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
      const entry = this.storedEntry(id);
      if (entry === undefined || seen.has(entry.id)) continue;
      seen.add(entry.id);
      for (const segment of entry.segments) result.push(segment.id);
    }
    return result;
  }

  /** `entryIdOfSegment` inside an open transaction: one lookup at the write set's own
   *  `segmentOwner` map (finding S1, #212), the pair to `#childrenOfWriteSet`'s overlay for
   *  `storedChildrenOf` — never a rebuild of an overlay Entry per Segment id, and never a pass over the
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
  #rememberSegmentsOf(entity: StoredEntry): void {
    for (const segment of entity.segments) this.#entryIdBySegmentId.set(segment.id, entity.id);
  }

  /** Removes every Segment `entity` draws from `#entryIdBySegmentId` — the mirror of
   *  `#rememberSegmentsOf`, called on a committed remove so a dropped Entry's Segments stop
   *  answering `entryIdOfSegment` with an id nothing owns any more. Guarded on current ownership
   *  (finding B3, #212): a Segment id `entity` once drew but the index now credits to a different
   *  Entry — handed off in the same commit — is that Entry's, not `entity`'s, to delete. Without the
   *  guard, processing `entity`'s row after the new owner's row deletes the new owner's live entry. */
  #forgetSegmentsOf(entity: StoredEntry): void {
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
  committedById(): ReadonlyMap<EntryId, StoredEntry> {
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
      const entry = toEntry(input, this.#context, this.#registry, 'entries.add');
      this.#assertSegmentIdsUnique(entry.segments, id, 'entries.add');
      this.stageAdd(token, entry);
      return this.get(id)!;
    });
  }

  update(id: EntryId | string, edit: EntryEdit): Entry {
    return this.#updateFrom('entries.update', id, edit);
  }

  /** The body every door that edits one Entry shares. `operation` is the call the consumer actually
   *  wrote, so a refusal names a door they can act on: `entries.removeSegments` removes a Segment
   *  through this same body, and a caller who never wrote `update` must not be told about it. */
  #updateFrom(operation: string, id: EntryId | string, edit: EntryEdit): Entry {
    return this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, operation);
      for (const field of Object.keys(edit)) this.#assertFieldTakesThisWrite(field, operation);
      const { own, toChildren } = this.#splitDerivedWrites(key, edit, operation);
      if (edit.parentId !== undefined) {
        this.#assertParentValid(key, entryId(edit.parentId), operation);
      }
      const current = this.storedEntry(key)!;
      if (Object.keys(own).length > 0) {
        const reading = toEditReading(own, this.#context, current, this.#registry, operation);
        const stored = reading.stored;
        if (stored.segments !== undefined) {
          this.#assertSegmentIdsUnique(stored.segments, key, operation);
        }
        this.stageUpdate(token, key, stored, reading.authoredEnvelopeKeys);
      }
      // Each distributed edit lands through the door it would have come in by, so a child that is
      // itself a rolling-up parent distributes again, or refuses. The walk ends at the leaves.
      for (const edits of toChildren) {
        for (const [childId, childEdit] of edits) this.#updateFrom(operation, childId, childEdit);
      }
      return this.get(key)!;
    });
  }

  /** Does the Field this key names take a write from this door at all? Three questions, in the one
   *  order that leaves the caller somewhere to go (ADR 0015).
   *
   *  Existence first — an undeclared key names no Field to ask anything about. Then `compute`:
   *  a compute Field owns no stored home, and it may not carry `editable` either, so asking
   *  `editable` first would answer "declare an editable" about a key the register door refuses. Then
   *  the API threshold, which refuses the lock and nothing else.
   *
   *  It asks about the Field, never about the Entry. Whether *this* Entry's cell is the Rollup's own
   *  is `#splitDerivedWrites`, below. */
  #assertFieldTakesThisWrite(field: string, operation: string): void {
    const declared = this.#registry.get(field);
    if (declared === undefined) throw new UnknownFieldError(field, operation);
    if ('compute' in declared) throw new ComputedFieldCannotBeWrittenError(field, operation);
    if (!isApiEditable(declared)) throw new FieldNotEditableError(field, operation);
  }

  /** Splits one patch into what lands on `id` itself and what its Fields distribute to the children
   *  (ADR 0013, amendment 2026-09-11). Every Field resolves, and every `distribute` runs, **before**
   *  anything stages: a mixed patch such as `{ name, cost }` with a refused `cost` writes neither
   *  half, because a partial apply would leave a transaction in a state no `before*` event described.
   *
   *  The answer reads the Field declaration and one structural fact, through the one resolver
   *  `view/capability.ts` also reads. It asks nothing about the call — whether it opened this
   *  transaction or joined one a consumer already had open makes no difference to what is allowed. */
  #splitDerivedWrites(
    id: EntryId,
    edit: EntryEdit,
    operation: string,
  ): { own: EntryEdit; toChildren: readonly EntryEdits[] } {
    if (!this.#hasChildren(id)) return { own: edit, toChildren: [] };
    const own: Record<string, unknown> = { ...edit };
    const toChildren: EntryEdits[] = [];
    let children: readonly StoredEntry[] | undefined;
    for (const [field, value] of Object.entries(edit)) {
      const declared = this.#registry.get(field)!;
      if (resolveWriteTarget(true, declared) === 'entry') continue;
      if (!declared.distribute) throw new DerivedFieldNotWritableError(field, id, operation);
      children ??= this.storedChildrenOf(id);
      // Called on its own declaration, never detached from it — the same way `equals` and
      // `formatValue` are called, so a `distribute` written as a method still reads its own Field.
      const parent = this.storedEntry(id)!;
      const edits = declared.distribute(
        value,
        parent,
        createRollUpContext(this.#access, parent, children, field),
      );
      // An edit aimed back at the Entry being written is refused: that cell is the Rollup's, and a
      // `distribute` that returned one would distribute again forever. A decline — `undefined`, or
      // nothing to write — is refused with the same error an absent `distribute` gives.
      if (edits === undefined || edits.size === 0 || edits.has(id)) {
        throw new DerivedFieldNotWritableError(field, id, operation);
      }
      toChildren.push(edits);
      delete own[field];
    }
    return { own, toChildren };
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
    this.#mutate(() => {
      const requested = new Set(ids.map((id) => segmentId(id)));
      if (requested.size === 0) return;
      for (const [ownerId, removedIds] of this.#groupSegmentsByOwner(requested)) {
        this.#removeSegmentsFrom(ownerId, removedIds);
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

  /** Removes `removedIds` from one Entry's Segments. Removing the last one clears both dates instead
   *  of removing the Entry (ADR 0012: a dateless Entry is legal, so a bar's own last Segment going away
   *  no longer has to take the row with it). The Entry, its id, and its descendants all stay untouched
   *  — only `entries.remove(id)` deletes a row. Otherwise the remaining Segments go through `update`,
   *  the normal edit path, which recomputes the envelope around them itself (#212, finding 4:
   *  `toEditReading` is the one owner) — this call names no `start` or `end` of its own, so there is
   *  nothing here that could disagree with them. */
  #removeSegmentsFrom(id: EntryId, removedIds: ReadonlySet<SegmentId>): void {
    const entry = this.storedEntry(id)!;
    const remaining = entry.segments.filter((segment) => !removedIds.has(segment.id));
    if (remaining.length === 0) {
      // Only an Entry that owns its own dates has dates to clear. On one with children the dates are
      // the Rollup's (ADR 0013), and clearing them did real damage: the clear is a proposal in the
      // transaction body, so the Rollup yielded to it (decision 5) and a parent with a dated child
      // committed with no dates at all (N8, BUILD-LOG). The library obeys the rule it publishes.
      if (this.#hasChildren(id)) return;
      this.#updateFrom('entries.removeSegments', id, { start: undefined, end: undefined });
      return;
    }
    this.#updateFrom('entries.removeSegments', id, { segments: remaining });
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
   *  so a self-referential write set never confuses the walk (S2.3 §1.4).
   *
   *  A worklist with the `seen` guard `#depthOf` carries: inside an open transaction the tree is the
   *  raw source's answer, and a source that loops would otherwise walk forever. Each row is staged
   *  once, and how deep the tree goes never reaches the stack. */
  #subtreeOf(id: EntryId): readonly EntryId[] {
    const found: EntryId[] = [];
    const seen = new Set<EntryId>([id]);
    const pending: EntryId[] = [id];
    while (pending.length > 0) {
      for (const child of this.storedChildrenOf(pending.pop()!)) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        found.push(child.id);
        pending.push(child.id);
      }
    }
    return found;
  }

  /** `parentId` must name a known entry and must not make `id` its own ancestor, self-parenting
   *  included (S2.3 §1.3). Read through the write set, so a reparent earlier in the same transaction
   *  is seen.
   *
   *  `seen` is the same guard `#depthOf` carries. Ingest checks no authored `parentId`, so a
   *  consumer can construct a loop with no plugin at all; without the guard the next edit that names
   *  a row inside that loop walks it forever. A loop the edit is not part of stops the walk and
   *  passes — the committed check reports it as one `hierarchy-cycle` Fault (ADR 0020). */
  #assertParentValid(id: EntryId, parentId: EntryId, operation: string): void {
    if (!this.has(parentId)) throw new EntryNotFoundError(parentId, operation);
    let current: EntryId | undefined = parentId;
    const seen = new Set<EntryId>();
    while (current !== undefined && !seen.has(current)) {
      if (current === id) throw new ParentCycleError(id);
      seen.add(current);
      current = this.storedEntry(current)?.parentId;
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
      stagedParents: new Set(),
    };
  }

  /** A re-add of an id this same transaction already staged for removal replaces it outright — the
   *  reverse of `stageRemove`'s own clearing below — so the net effect is one clean entity, not a
   *  cancelled add/remove pair the fold treats as neither happening. Reads `entry.id`'s Segments as
   *  staging saw them a moment ago (read-your-own-writes, `get`) before overwriting the maps, so a
   *  Segment the replaced object drew and `entry` does not is released, not left pointing stale
   *  (finding B4, #212) — `recordSegmentOwnership` does that release-then-claim in one call. */
  /** Files the parent the source names for a row this transaction just staged — one source call per
   *  stage, which is what keeps `#hasChildren` honest under a source that reads anything but
   *  `parentId` (ADR 0020). */
  #recordStagedParent(writeSet: WriteSet, entry: StoredEntry): void {
    const parentId = this.#askSource(entry);
    if (parentId !== undefined) writeSet.stagedParents.add(parentId);
  }

  stageAdd(_token: TxToken, entry: StoredEntry): void {
    const writeSet = this.#openWriteSet();
    const replaced = this.storedEntry(entry.id);
    writeSet.added.set(entry.id, entry);
    writeSet.removed.delete(entry.id);
    writeSet.edits.delete(entry.id);
    this.#recordStagedParent(writeSet, entry);
    recordSegmentOwnership(writeSet, entry.id, replaced?.segments, entry.segments);
  }

  /** `authoredEnvelopeKeys` names which of `start`/`end`/`segments` the caller itself wrote into
   *  `edit`, before any envelope reconciliation ran (#232) — `update()` below passes the fact
   *  `toEditReading` already computed. A caller that stages a raw `ProposedEdit` directly (a
   *  same-transaction reparent, a test fixture) has done no such reconciliation, so the default —
   *  the triad-intersection of `edit`'s own keys — is exactly that edit's authored keys too. */
  stageUpdate(
    _token: TxToken,
    id: EntryId,
    edit: ProposedEdit,
    authoredEnvelopeKeys: ReadonlySet<string> = authoredEnvelopeKeysOf(edit),
  ): void {
    const writeSet = this.#openWriteSet();
    const before = edit.segments !== undefined ? this.storedEntry(id)?.segments : undefined;
    const staged = writeSet.added.get(id);
    if (staged) {
      const merged = entryAfterEdit(staged, edit);
      writeSet.added.set(id, merged);
      this.#recordStagedParent(writeSet, merged);
      if (edit.segments !== undefined) recordSegmentOwnership(writeSet, id, before, merged.segments);
      return;
    }
    writeSet.edits.set(id, mergeProposedEdits(writeSet.edits.get(id), edit));
    const edited = this.storedEntry(id);
    if (edited !== undefined) this.#recordStagedParent(writeSet, edited);
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
    const before = this.storedEntry(id)?.segments;
    writeSet.removed.add(id);
    writeSet.added.delete(id);
    writeSet.edits.delete(id);
    recordSegmentOwnership(writeSet, id, before, undefined);
  }

  pendingAdded(): readonly { store: 'entries'; entity: StoredEntry }[] {
    if (!this.#writeSet) return [];
    return Array.from(this.#writeSet.added.values(), (entity) => ({ store: 'entries' as const, entity }));
  }

  pendingRemoved(): readonly { store: 'entries'; entity: StoredEntry }[] {
    if (!this.#writeSet) return [];
    const result: { store: 'entries'; entity: StoredEntry }[] = [];
    for (const id of this.#writeSet.removed) {
      const entity = this.#byId.get(id);
      if (entity) result.push({ store: 'entries', entity });
    }
    return result;
  }

  pendingEdits(): ProposedEdits {
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
    // A rolled-up Field write can move the tree: a source may read any `props` key, and this is a
    // revision like any other.
    this.#reportRefusedHierarchyAnswers();
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
    this.#reportRefusedHierarchyAnswers();
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
  #forgetReplacedEntity(entity: StoredEntry): void {
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
