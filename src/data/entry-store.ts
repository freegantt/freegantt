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
  FlatEntryInput,
  EntryEdit,
  FieldEditable,
  FieldKey,
  FieldLockRule,
  FieldLockRuleWrapper,
  HierarchySource,
  RaiseError,
} from '../model/index.js';
import {
  entryId,
  DerivedFieldNotWritableError,
  DuplicateEntryIdError,
  EntryNotFoundError,
  ParentCycleError,
  SiblingIndexOutOfRangeError,
} from '../model/index.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';
import type { EntryStore as EntryStoreContract } from '../model/index.js';
import { computed, signal } from './reactivity.js';
import type { ProposedEdit, ProposedEdits } from './edit-extension.js';
import type { ChangeSet, FieldUpdated, UpdatedRow } from '../model/index.js';
import { toEditReading, toEntry } from './entry-reader.js';
import type { EditReading } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import type { UnplacedEntry } from './hierarchy-source.js';
import { commitChangeSet, rollUpFreshBatch, runTransaction } from './transaction.js';
import type { TransactionData, TxToken } from './transaction.js';
import { assertNoOpenTransaction, assertNoRunningExtensionHook, readEntryBatch } from './entry-batch.js';
import {
  buildDerivedValuesDroppedReport,
  buildSiblingIndexDroppedReport,
  raiseErrorOn,
} from './error-reporting.js';
import {
  createFieldAccess,
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
import type { ResolvedField } from './fields/field-registry.js';
import {
  assertFieldTakesWrite,
  editableAnswerFor,
  fieldLockQueryFor,
  identityFieldLockRule,
  IGNORED_FIELD_LOCK_QUERY,
  resolveWriteTarget,
} from './write-rule.js';
import type { FieldLockQuery } from '../model/index.js';

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

/** One field an edit names, and the Field `#assertFieldTakesThisWrite` resolved it to — carried
 *  forward so `#assertNoDerivedWrite` reads the same declaration instead of resolving it again. */
interface DeclaredFieldWrite {
  readonly field: string;
  readonly declared: ResolvedField;
}

interface WriteSet {
  added: Map<EntryId, StoredEntry>;
  removed: Set<EntryId>;
  edits: Map<EntryId, ProposedEdit>;
  /** Every id the hierarchy source named as a parent of a staged add or update, in this transaction.
   *  A filter, not an index: it over-answers (an id whose child was later reparented away stays in
   *  it), and a miss is the only answer it is trusted for. `#hasChildren` runs on every consumer
   *  write, and without this it would walk the staged edits each time — the O(n²) shape finding S1
   *  (#212) already killed once. Kept current by `stageAdd`/`stageUpdate`.
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
  /** This write set's own sibling-order log, in call order (ADR 0034) — `pendingSiblingChanges` hands
   *  this straight to the renumber pass at commit. Every entry below keeps this transaction's own
   *  view of "how many siblings does this group have right now" current one write at a time, so two
   *  `add()` calls into the same group in one transaction see each other rather than both reading the
   *  same committed count. */
  siblingChanges: SiblingChange[];
  /** Each touched group's live member count, seeded lazily from the committed count the first time a
   *  write asks about that group. */
  siblingGroupCounts: Map<SiblingGroupKey, number>;
  /** Every id this transaction has logged a departure for and not yet re-placed — the same guard
   *  `renumberSiblingGroups` keeps, so a second departure for one id (a remove replayed, or a move
   *  logged twice) does not double-decrement a group's live count. */
  departedSiblingIds: Set<EntryId>;
}

export class EntryStore implements EntryStoreContract {
  #byId: Map<EntryId, StoredEntry>;
  /** One write per commit; every derived value below invalidates from it (D-S2-4). */
  #revision = signal(0);
  #all: () => readonly StoredEntry[];
  /** The same array identity rule as `#all`, one revision at a time — the elements are the live
   *  rows `layout/` receives (`gantt-shell.ts` hands this straight on). */
  #allLive: () => readonly Entry[];
  /** Which Entry the hierarchy source says is the parent of this one (ADR 0020). A plain readonly
   *  field: the constructor receives the final, already-composed source, and nothing sets it later
   *  (ADR 0031 — a plugin declares its source; it does not claim a seam after setup). */
  readonly #hierarchySource: HierarchySource;
  /** The per-entry lock rule's current occupant (#473). A plain field, not a `signal`: unlike
   *  `#hierarchySource`, nothing here is a `computed` derived from it — it is read imperatively, once
   *  per write, the same way `#registry` is. Silence (`identityFieldLockRule`) until a plugin composes
   *  onto it through `setLockRule`. */
  #lockRule: FieldLockRule = identityFieldLockRule;
  /** The source's answers for the committed rows, after core checked them (ADR 0020). One pass per
   *  revision, and a **pure** one: it refuses an answer but raises nothing, so what a reader sees
   *  never depends on who read first (`F5`). `reportRefusedHierarchyAnswers` raises. */
  #hierarchy: () => CheckedHierarchy;
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
  #writeSet: WriteSet | null = null;
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
    hierarchySource: HierarchySource = storedParentSource,
  ) {
    this.#raiseError = raiseError;
    this.#context = context;
    this.#registry = registry;
    this.#hierarchySource = hierarchySource;
    // The store is the tree a Field read walks: a `compute` Field asking `ctx.children(row)` outside
    // a Rollup pass means the row the store holds now (#214).
    this.#access = readingParentFrom(
      readingChildrenFrom(
        access,
        (id) => this.storedChildrenOf(id),
        (id) => this.#hasChildren(id),
      ),
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
      durationOf: (entry) => measureEntryDuration(entry, this.#access),
    });
    this.#runner = runner;
    this.#byId = new Map(entries.map((entry) => [entry.id, entry]));
    this.#hierarchy = computed(() => {
      this.#revision.get();
      return checkHierarchyAnswers(this.#byId, this.#hierarchySource);
    });
    this.#byParent = computed(() => {
      // Core inverts the source's answer (ADR 0020). One parent per Entry goes in, so nothing can
      // produce two parents for one row. Each group sorts by the Field (ADR 0034) — list position at
      // ingest, an explicit write's own place after that — so this is sibling order, not insertion
      // order.
      const parentById = this.committedParents();
      const byParent = new Map<EntryId | undefined, StoredEntry[]>();
      for (const entry of this.#byId.values()) {
        const parentId = parentById.get(entry.id);
        const siblings = byParent.get(parentId);
        if (siblings) siblings.push(entry);
        else byParent.set(parentId, [entry]);
      }
      for (const siblings of byParent.values()) siblings.sort((a, b) => a.siblingIndex - b.siblingIndex);
      return byParent;
    });
    // D-S2-3: rebuilt on commit, not on every read — one array identity per revision, so
    // `ScaleBinding`'s reference comparison and `BoundValue`'s equality half (D-S1.5-4) hold.
    // Depth-first over `#byParent` (ADR 0034): a parent sits right before its own children, each
    // sibling group already in Field order, the shape the grid's tree mode draws unchanged.
    this.#all = computed(() => {
      const byParent = this.#byParent();
      const ordered: StoredEntry[] = [];
      const walk = (parentId: EntryId | undefined): void => {
        for (const child of byParent.get(parentId) ?? []) {
          ordered.push(child);
          walk(child.id);
        }
      };
      walk(undefined);
      return ordered;
    });
    this.#allLive = computed(() => this.#all().map((entry) => this.#live.for(entry.id)));
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

  /** Raises every answer core refused (ADR 0020, `F5`).
   *
   *  Called where the answers can change and nowhere else — once after the construction Rollup, and
   *  on every later commit, each exactly once per revision, so this plain loop over `#hierarchy()`
   *  never raises the same answer twice for one revision without needing its own de-dupe.
   *  `DatasetState` is the construction-time caller: a hierarchy source may read a Field the Rollup
   *  rolls up, so an answer can still change between the authored rows and the Rollup's own write,
   *  and only a call placed after both sees every refusal construction can produce. Not from the read
   *  path: a Fault that waits for somebody to look is a Fault a headless Dataset never sees, and a
   *  plugin's own tests run headless. A construction-time refusal reaches the `console` fallback and
   *  no `error` handler, because no consumer can subscribe before the constructor returns — the same
   *  posture the construction Rollup's own `derived-values-dropped` report already takes (ADR 0013,
   *  decision 5).
   *
   *  The raise lands after the write set closes and before `change` fans out, so a handler that
   *  writes in response is outside the notification window `data/` forbids a mutation in. */
  reportRefusedHierarchyAnswers(): void {
    for (const report of this.#hierarchy().refused) {
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
  #askSource(entry: UnplacedEntry): EntryId | undefined {
    return parentIdFrom(this.#hierarchySource, entry);
  }

  /** `#askSource`'s answer, downgraded to a root the same way `checkHierarchyAnswers` would: an id no
   *  Entry holds, or a chain that loops back to `id` itself, both read as `undefined`. The sibling
   *  order log reads a group through this, never through `#askSource` alone — `committedSiblingIds`
   *  is keyed by the checked answer (ADR 0020), so a write against an already-refused entry must
   *  count against the same group that index already holds it under, not an empty one of its own. A
   *  live re-check of one entry, not the committed index's own once-per-revision pass: an open
   *  transaction cannot re-run that pass on every write and stay O(chain) (`#askSource`'s own note). */
  #checkedGroupFor(id: EntryId, entry: UnplacedEntry): EntryId | undefined {
    const raw = this.#askSource(entry);
    if (raw === undefined || !this.has(raw)) return undefined;
    let current: EntryId | undefined = raw;
    const seen = new Set<EntryId>();
    while (current !== undefined && !seen.has(current)) {
      if (current === id) return undefined;
      seen.add(current);
      current = this.#parentIdInWriteSet(current);
    }
    return raw;
  }

  /** Which Entry is the parent of this row, as the rest of the library must read it (ADR 0020).
   *  Committed, it is the checked answer the index holds. Inside an open transaction, it is what the
   *  source says about the row this transaction leaves. Takes the source's own shape, never a placed
   *  row's, so a caller with either satisfies it (ADR 0034). */
  parentIdOf(entry: UnplacedEntry): EntryId | undefined {
    if (!this.#writeSet) return this.committedParents().get(entry.id);
    return this.#askSource(entry);
  }

  /** The source every tree read in this store goes through. `data/`'s commit path and the Rollup
   *  read the same one, so the tree and the Rollup can never disagree (ADR 0020). */
  get hierarchySource(): HierarchySource {
    return this.#hierarchySource;
  }

  /** The per-entry lock rule every write door reads (#473, I14): `entries.update()` and an
   *  `EditExtender` cascade both resolve a write against this same occupant. */
  get lockRule(): FieldLockRule {
    return this.#lockRule;
  }

  /** The per-entry lock rule's own answer for one cell (#473) — `entries.update()` and an
   *  `EditExtender` cascade reach it through `#assertFieldTakesThisWrite`/`toEditsReading`; a plain
   *  read reaches it here. `api/dataset.ts`'s `Dataset.editableOf` is the published door onto this.
   *  `editableAnswerFor` answers `'never'` for the same undeclared-or-`compute` Field
   *  `entries.update()` refuses (#473's ocr finding, I14).
   *
   *  `view/capability.ts`'s `canWrite` sits behind hover affordance resolution, so this stays
   *  allocation-free with no plugin installed (I5, #473's ocr finding): `identityFieldLockRule`
   *  never reads the query it is asked, so a Dataset with no lock rule installed answers through the
   *  one shared `editableAnswerFor` order without building a fresh `FieldLockQuery` per cell. */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable {
    const declared = this.#registry.get(field);
    if (this.#lockRule === identityFieldLockRule) {
      return editableAnswerFor(field, declared, IGNORED_FIELD_LOCK_QUERY, this.#lockRule);
    }
    return editableAnswerFor(field, declared, this.#lockQueryFor(entryId(id)), this.#lockRule);
  }

  /** One cell's address for the lock rule (#473) — the same construction `editableOf` and
   *  `#assertFieldTakesThisWrite` both need, kept in one place so they cannot drift apart. */
  #lockQueryFor(id: EntryId): FieldLockQuery {
    return fieldLockQueryFor(
      id,
      (i) => this.storedEntry(i),
      (e) => this.parentIdOf(e),
    );
  }

  /** Call: `ctx.edits.setLockRule((next) => (entry, field) => field === 'cost' ? 'anywhere' : next(entry, field))`.
   *  Installing composes onto the current occupant rather than evicting it, the same way
   *  `setExtender` does (D-S5-23). Not on `EntryStoreView`: this is a plugin-author door, and it
   *  reaches a plugin through `ctx.edits` alone. */
  setLockRule(wrap: FieldLockRuleWrapper): void {
    this.#lockRule = wrap(this.#lockRule);
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

  /** The committed by-id map a transaction diffs against — never the write set (D-S2-6, D-S2-7).
   *  Distinct from Snapshot (`entries.all`), which is the cached array. */
  committedById(): ReadonlyMap<EntryId, StoredEntry> {
    return this.#byId;
  }

  // ---- Public mutators (S2.3 §1.1): validate against the write set, then stage; each auto-wraps in
  // a transaction via `runTransaction`, which joins one already open (D-S2-8) ----

  add(input: FlatEntryInput): Entry {
    return this.#mutate((token) => {
      const id = entryId(input.id);
      if (this.has(id)) throw new DuplicateEntryIdError(id, 'entries.add', 'collision');
      if (input.parentId !== undefined) {
        this.#assertParentValid(id, entryId(input.parentId), 'entries.add');
      }
      const unplaced = toEntry(input, this.#context, this.#registry, 'entries.add');
      // Placed at `input.siblingIndex`, or at the end of its group with no index named (ADR 0034). The
      // group's own live count — this transaction's own writes included, not only the committed count
      // — so a second `add()` into the same group in the same transaction lands after the first.
      const group = this.#checkedGroupFor(id, unplaced);
      const othersCount = this.#liveSiblingGroupSize(group);
      const siblingIndex = input.siblingIndex ?? othersCount;
      if (input.siblingIndex !== undefined) {
        this.#assertSiblingIndexInRange(id, siblingIndex, othersCount, 'entries.add');
      }
      const entry: StoredEntry = { ...unplaced, siblingIndex };
      this.stageAdd(token, entry);
      this.#logSiblingPlacement({ id, group, at: siblingIndex });
      return this.get(id)!;
    });
  }

  update(id: EntryId | string, edit: EntryEdit): Entry {
    return this.#updateFrom('entries.update', id, edit);
  }

  /** The body every door that edits one Entry shares. `operation` is the call the consumer actually
   *  wrote, so a refusal names a door they can act on — a caller who never wrote `update` must not be
   *  told about it. */
  #updateFrom(operation: string, id: EntryId | string, edit: EntryEdit): Entry {
    return this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, operation);
      const declaredWrites = Object.keys(edit).map((field) =>
        this.#assertFieldTakesThisWrite(key, field, operation),
      );
      this.#assertNoDerivedWrite(key, declaredWrites, operation);
      if (edit.parentId !== undefined) {
        this.#assertParentValid(key, entryId(edit.parentId), operation);
      }
      const current = this.storedEntry(key)!;
      const reading = toEditReading(edit, this.#context, current, this.#registry, operation);
      const move = this.#siblingMoveFor(key, current, reading, edit, operation);
      this.stageUpdate(token, key, reading.stored);
      if (move) this.#logSiblingPlacement(move);
      return this.get(key)!;
    });
  }

  /** Does the Field this key names take a write from this door, on this Entry, at all? Reads
   *  `write-rule.ts`'s `assertFieldTakesWrite` — the one check an `EditExtender` cascade
   *  (`entry-reader.ts`'s `toEditsReading`) runs too (ADR 0015, #473's ocr finding: a second copy here
   *  once let a cascade write a `compute` Field through in silence).
   *
   *  It asks about the Field on this Entry, never about the Entry's structure. Whether *this* Entry's
   *  cell is the Rollup's own is `#assertNoDerivedWrite`, below. It returns the Field it resolved, so
   *  that check reads the same declaration instead of looking the key up again. */
  #assertFieldTakesThisWrite(id: EntryId, field: string, operation: string): DeclaredFieldWrite {
    const declared = this.#registry.get(field);
    const resolved = assertFieldTakesWrite(
      field,
      declared,
      this.#lockQueryFor(id),
      this.#lockRule,
      operation,
    );
    return { field, declared: resolved };
  }

  /** Refuses a write aimed at a rolling-up parent's cell (ADR 0013). Every Field in the patch
   *  resolves before anything stages: a mixed patch such as `{ name, cost }` with a refused `cost`
   *  throws before `name` lands, because a partial apply would leave a transaction in a state no
   *  `before*` event described.
   *
   *  The answer reads the Field declaration and one structural fact, through the one resolver
   *  `view/capability.ts` also reads. It asks nothing about the call — whether it opened this
   *  transaction or joined one a consumer already had open makes no difference to what is allowed. */
  #assertNoDerivedWrite(id: EntryId, declaredWrites: readonly DeclaredFieldWrite[], operation: string): void {
    if (!this.#hasChildren(id)) return;
    for (const { field, declared } of declaredWrites) {
      if (resolveWriteTarget(true, declared) === 'refused') {
        throw new DerivedFieldNotWritableError(field, id, operation);
      }
    }
  }

  remove(id: EntryId | string): void {
    this.#mutate((token) => {
      const key = entryId(id);
      if (!this.has(key)) throw new EntryNotFoundError(key, 'entries.remove');
      // Only the top id leaves its group (ADR 0034) — its subtree goes with it, so a descendant logs
      // no departure of its own: it was never a member of a group `renumberSiblingGroups` renumbers.
      this.#logSiblingDeparture(key);
      for (const descendantId of this.#subtreeOf(key)) this.stageRemove(token, descendantId);
      this.stageRemove(token, key);
    });
  }

  /**
   * A full fresh start (#496): removes every entry this store holds and adds every input, in the
   * list's own order — no diff, no merge (L1). A child may list before its parent; the whole batch
   * is checked first (`assertEntryBatchIsSound`), so order never throws — only a duplicate id, an
   * unknown parent, or a loop does, and nothing stages when one does.
   *
   * This does not go through `#mutate`/`runTransaction`'s own diff-and-fold pipeline. Step 1 pinned
   * why: staging a remove and a re-add of the same id through the ordinary `stageAdd`/`stageRemove`
   * pair folds to an in-place value replace, keeping the id's old position in `entries.all` — exactly
   * the per-entry state L1 says a kept id must not keep. `load` instead reads and checks the whole
   * batch, runs the Rollup once the same way construction does (`applyConstructionRollUp`, no
   * `EditExtender` cascade — step 1 pinned construction runs none either), and hands `commitChangeSet`
   * an already-complete `ChangeSet`: every old entry in `removed`, every input in `added`, in list
   * order. `commitChangeSet` applies exactly what it is given — unlike `runTransaction`, it never
   * folds an empty net effect away, which is how an empty `load` into an empty Dataset still commits
   * and still clears History (Q9).
   *
   * Refuses a call from inside the extension hook the same way `runTransaction` and `PluginStores`
   * do (#323): `openTransactions` alone would not catch it, since it is already back to 0 by the
   * time the hook runs.
   */
  load(inputs: readonly FlatEntryInput[]): void {
    const runner = this.#runner;
    if (!runner) {
      throw new Error(
        'EntryStore: not bound to a transaction runner — data/dataset-state.ts always binds one',
      );
    }
    assertNoOpenTransaction(runner.openTransactions, 'entries.load');
    assertNoRunningExtensionHook(runner.runningExtensionHook, 'entries.load');

    const source = this.#hierarchySource;
    const {
      entries: read,
      parents,
      siblingIndexDropped,
    } = readEntryBatch(inputs, this.#context, this.#registry, source, 'entries.load');
    if (siblingIndexDropped.length > 0) {
      const report = buildSiblingIndexDroppedReport(siblingIndexDropped);
      raiseErrorOn(runner.bus, report, () => console.warn(`FreeGantt: ${report.message}`));
    }

    const byId = new Map(read.map((entry) => [entry.id, entry]));
    // Construction's own Rollup shape (`applyConstructionRollUp`, in `transaction.ts` — `rollUpFields`
    // itself stays a leaf only that file and the commit path may import, `rollup-is-removable`):
    // no `pending`, so the pass walks `byId` as the whole tree. Refusals over this batch's hierarchy
    // answers are not raised here: `endTransaction` below re-derives and raises them once the swap
    // lands, the same door every other commit already raises through.
    const rollupUpdated = rollUpFreshBatch(runner, byId, parents, source);
    // A batch that authors a rolling-up Field on a row that also has children in the same batch gets
    // it dropped here — one aggregate `derived-values-dropped` report for the whole load, the same
    // rule and the same report construction raises (ADR 0013, decision 5; #496 Q3).
    const dropped = rollupUpdated.filter((row) => row.to === undefined);
    if (dropped.length > 0) {
      raiseErrorOn(runner.bus, buildDerivedValuesDroppedReport(dropped));
    }

    const added = read.map((entry) => ({ store: 'entries' as const, entity: byId.get(entry.id)! }));
    const removed = this.allStored.map((entity) => ({ store: 'entries' as const, entity }));
    // Every plugin-store row an entry this call removes owned — D-S5-24's rule reaches `load` the
    // same way it reaches `entries.remove()` (Q8): the row goes because the entry that owned it did.
    const pluginRows = runner.pluginStores.pendingRows(removed.map((row) => row.entity.id));

    const changeSet: ChangeSet = {
      id: runner.nextChangeSetId(),
      origin: 'load',
      added,
      removed,
      updated: [...rollupUpdated, ...pluginRows],
    };
    commitChangeSet(runner, changeSet);
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
   *  `seen` is the same guard `#depthOf` carries. `new Dataset({ entries })` and `entries.load` both
   *  check the raw batch and throw on a loop (ADR 0031), but `replay()` applies an already-built
   *  `ChangeSet` unchecked (`data/replay.ts`), so a raw loop can still land on a live store that way;
   *  without the guard the next edit that names a row inside that loop walks it forever. A loop the
   *  edit is not part of stops the walk and passes — the committed check reports it as one
   *  `hierarchy-cycle` Fault (ADR 0020). */
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

  // ---- TxToken-gated: only data/transaction.ts holds a token (docs/02 §3.6) ----

  beginTransaction(_token: TxToken): void {
    this.#writeSet = {
      added: new Map(),
      removed: new Set(),
      edits: new Map(),
      stagedParents: new Set(),
      siblingChanges: [],
      siblingGroupCounts: new Map(),
      departedSiblingIds: new Set(),
    };
  }

  /** Files the parent the source names for a row this transaction just staged — one source call per
   *  stage, which is what keeps `#hasChildren` honest under a source that reads anything but
   *  `parentId` (ADR 0020). */
  #recordStagedParent(writeSet: WriteSet, entry: StoredEntry): void {
    const parentId = this.#askSource(entry);
    if (parentId !== undefined) writeSet.stagedParents.add(parentId);
  }

  /** A re-add of an id this same transaction already staged for removal replaces it outright — the
   *  reverse of `stageRemove`'s own clearing below — so the net effect is one clean entity, not a
   *  cancelled add/remove pair the fold treats as neither happening. */
  stageAdd(_token: TxToken, entry: StoredEntry): void {
    const writeSet = this.#openWriteSet();
    writeSet.added.set(entry.id, entry);
    writeSet.removed.delete(entry.id);
    writeSet.edits.delete(entry.id);
    this.#recordStagedParent(writeSet, entry);
  }

  stageUpdate(_token: TxToken, id: EntryId, edit: ProposedEdit): void {
    const writeSet = this.#openWriteSet();
    const staged = writeSet.added.get(id);
    if (staged) {
      const merged = entryAfterEdit(staged, edit);
      writeSet.added.set(id, merged);
      this.#recordStagedParent(writeSet, merged);
      return;
    }
    writeSet.edits.set(id, mergeProposedEdits(writeSet.edits.get(id), edit));
    const edited = this.storedEntry(id);
    if (edited !== undefined) this.#recordStagedParent(writeSet, edited);
  }

  stageRemove(_token: TxToken, id: EntryId): void {
    const writeSet = this.#openWriteSet();
    writeSet.removed.add(id);
    writeSet.added.delete(id);
    writeSet.edits.delete(id);
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

  /** This write set's own sibling-order log, in call order — the renumber pass in
   *  `buildCommitChangeSet` is this log's one reader. */
  pendingSiblingChanges(): readonly SiblingChange[] {
    return this.#writeSet?.siblingChanges ?? [];
  }

  /** `group`'s committed member ids, in sibling order — what the renumber pass seeds a touched
   *  group's replay from. `group` is `#checkedGroupFor`'s answer, `EntryId | undefined`, never
   *  `#askSource`'s raw one: a refused entry's raw answer names no Entry this index groups by. The
   *  wider `SiblingGroupKey` the interface names is a plugin-source door the committed index, keyed by
   *  the checked hierarchy answer, already narrows to that same shape. */
  committedSiblingIds(group: SiblingGroupKey): readonly EntryId[] {
    return (this.#byParent().get(group as EntryId | undefined) ?? []).map((entry) => entry.id);
  }

  /** `group`'s live member count — `committedSiblingIds(group).length` with this transaction's own
   *  writes folded in, the same count `add()` and `update()` range-check an explicit `siblingIndex`
   *  against. The commit path reads this for the extender cascade's own moves too
   *  (`build-commit-change-set.ts`), so an extender edit range-checks against the same live picture a
   *  body write already left, rather than the committed count alone. */
  liveSiblingGroupSize(group: SiblingGroupKey): number {
    return this.#liveSiblingGroupSize(group);
  }

  /** The construction Rollup's own write, and the only caller (`data/transaction.ts`). It raises no
   *  refusal of its own: `DatasetState` calls `reportRefusedHierarchyAnswers` once, right after this
   *  write lands, so every answer construction can produce is covered there instead. */
  writeCommittedFieldRows(updated: readonly FieldUpdated[]): void {
    if (updated.length === 0) return;
    this.#applyUpdatedRows(updated);
    this.#revision.set(this.#revision.get() + 1);
  }

  /** Applies the committed `ChangeSet` (`undefined` for an empty net effect or a vetoed commit — the
   *  write set is simply discarded) and closes the write set.
   *
   *  Did the call apply a change? `runTransaction` also calls this once with `undefined` to discard
   *  the body's own write-set overlay, ahead of a second, real call through `commitChangeSet`
   *  (`data/transaction.ts`). A discard applies nothing, so it reports no refusal — only the call
   *  that lands a revision does. The report itself waits for the write set to close: an `error`
   *  handler that reads the tree during the raise must see the checked answer, not the open write
   *  set's raw one. */
  endTransaction(_token: TxToken, changeSet: ChangeSet | undefined): void {
    if (changeSet) {
      for (const { entity } of changeSet.removed) {
        this.#byId.delete(entity.id);
      }
      this.#restoreAdded(changeSet);
      this.#applyUpdatedRows(changeSet.updated);
      this.#revision.set(this.#revision.get() + 1);
    }
    this.#writeSet = null;
    if (changeSet) this.reportRefusedHierarchyAnswers();
  }

  /** Entry rows only. A changeset also carries plugin-store rows (D-S5-24); `data/plugin-store.ts`
   *  applies those against its own maps, from the same `endTransaction` call. */
  #applyUpdatedRows(updated: readonly UpdatedRow[]): void {
    for (const row of updated) {
      if (row.store !== 'entries') continue;
      const current = this.#byId.get(row.id);
      if (!current) continue;
      const next = applyFieldRow(current, row.field, row.to, this.#registry);
      this.#byId.set(row.id, next);
    }
  }

  /** Adding `entity` back — a `'user'` re-add of an id the same transaction also removed, or an
   *  undo/redo restoring a removed one — replaces whatever object currently sits at `entity.id` in
   *  `#byId`, if any. `#byId`'s own key order no longer decides `all`'s order (ADR 0034): `#byParent`
   *  groups and sorts by the sibling-order Field, so this needs no restored position, only the row
   *  itself — the renumber pass already wrote every affected Field back onto this changeset. */
  #restoreAdded(changeSet: ChangeSet): void {
    for (const { entity } of changeSet.added) {
      this.#byId.set(entity.id, entity);
    }
  }

  #openWriteSet(): WriteSet {
    if (!this.#writeSet)
      throw new Error('EntryStore: no open transaction — data/transaction.ts always opens one first');
    return this.#writeSet;
  }

  // ---- Sibling order (ADR 0034): every write's own place in its group, decided at the call site and
  // logged for the renumber pass in `buildCommitChangeSet` to replay at commit ----

  /** `group`'s live member count — this transaction's own writes folded in, not only the committed
   *  count (`committedSiblingIds`), seeded lazily the first time a write asks about this group. */
  #liveSiblingGroupSize(group: SiblingGroupKey): number {
    const writeSet = this.#openWriteSet();
    const known = writeSet.siblingGroupCounts.get(group);
    if (known !== undefined) return known;
    const seeded = this.committedSiblingIds(group).length;
    writeSet.siblingGroupCounts.set(group, seeded);
    return seeded;
  }

  #adjustLiveSiblingGroupSize(group: SiblingGroupKey, delta: number): void {
    const size = this.#liveSiblingGroupSize(group);
    this.#openWriteSet().siblingGroupCounts.set(group, size + delta);
  }

  /** 0 to the group's own live count is legal — an `add` counts the whole existing group, since the
   *  new entry is not yet a member; an `update` that stays in its group counts every other member,
   *  already excluded by the caller before this runs. */
  #assertSiblingIndexInRange(id: EntryId, at: number, othersCount: number, operation: string): void {
    if (!Number.isInteger(at) || at < 0 || at > othersCount) {
      throw new SiblingIndexOutOfRangeError(id, at, othersCount, operation);
    }
  }

  /** Logs a placement and keeps the live group counts current: the target group gains a member, and
   *  — mirroring `renumberSiblingGroups`'s own unconditional leave-then-place — an id this
   *  transaction already logged a departure for stops counting as departed. An `add`'s id was never a
   *  member of any group, so it never reaches `departedSiblingIds` in the first place; this is a
   *  no-op for it. */
  #logSiblingPlacement(
    change: SiblingChange & { readonly group: SiblingGroupKey; readonly at: number },
  ): void {
    const writeSet = this.#openWriteSet();
    writeSet.siblingChanges.push(change);
    writeSet.departedSiblingIds.delete(change.id);
    this.#adjustLiveSiblingGroupSize(change.group, 1);
  }

  /** Logs a departure — a `remove`, or the first half of a move this call site already decided —
   *  guarded by `departedSiblingIds` the same way `renumberSiblingGroups` guards its own replay: a
   *  second departure for one id decrements nothing a second time. */
  #logSiblingDeparture(id: EntryId): void {
    const writeSet = this.#openWriteSet();
    if (writeSet.departedSiblingIds.has(id)) return;
    const group = this.#checkedGroupFor(id, this.storedEntry(id)!);
    writeSet.departedSiblingIds.add(id);
    this.#adjustLiveSiblingGroupSize(group, -1);
    writeSet.siblingChanges.push({ id });
  }

  /** What `update`'s own edit does to `id`'s sibling order, or `undefined` when it does nothing (no
   *  group change, no named `siblingIndex`): computed and range-checked against a *preview* of the
   *  post-edit row (`entryAfterEdit`, not yet staged), so an out-of-range index throws before anything
   *  stages — the same "nothing stages when one write in the request fails" rule every write door
   *  already keeps. */
  #siblingMoveFor(
    id: EntryId,
    current: StoredEntry,
    reading: EditReading,
    edit: EntryEdit,
    operation: string,
  ): (SiblingChange & { readonly group: SiblingGroupKey; readonly at: number }) | undefined {
    const previousGroup = this.#checkedGroupFor(id, current);
    const prospective = entryAfterEdit(current, reading.stored);
    const group = this.#checkedGroupFor(id, prospective);
    const explicitIndex = edit.siblingIndex !== undefined;
    if (!explicitIndex && group === previousGroup) return undefined;
    // Leaving its own group first (mirroring `renumberSiblingGroups`) means an entry that stays in its
    // group is not counted among its own "others" — moving across groups needs no such adjustment,
    // since the live count there never included this id.
    const othersCount = this.#liveSiblingGroupSize(group) - (group === previousGroup ? 1 : 0);
    const at = explicitIndex ? edit.siblingIndex! : othersCount;
    if (explicitIndex) this.#assertSiblingIndexInRange(id, at, othersCount, operation);
    this.#logSiblingDeparture(id);
    return { id, group, at };
  }
}
