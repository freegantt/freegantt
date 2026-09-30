// data/ — DatasetState: the live state one Dataset instance owns privately. `api/Dataset`
// is a thin façade that constructs one of these and delegates `entries`/`timeZone` to it —
// the same structural/façade relationship `GanttShell` already has with `Gantt`.

import type {
  Aggregator,
  ChangeSet,
  ChangeSetId,
  Dataset,
  DatasetEventMap,
  EntryId,
  FlatEntryInput,
  Field,
  FieldEditable,
  FieldKey,
  FieldLockRule,
  FieldLockRuleWrapper,
  FieldType,
  BarMoveRuleWrapper,
  PlaceRuleWrapper,
  RemoveRuleWrapper,
  Instant,
  Disposer,
  EditExtender,
  EditRequest,
  EntryEdits,
  ProposedEdits,
  ExtenderWrapper,
  RemovalExtender,
  RemovalExtenderWrapper,
  HierarchySource,
  HierarchySourceWrapper,
  ReplayOptions,
} from '../model/index.js';
import { changeSetId, DuplicateFieldKeyError } from '../model/index.js';
import { now } from '../time/index.js';
import { rolledUpEditsFor as rolledUpEditsForCommit } from './build-commit-change-set.js';
import { EntryStore } from './entry-store.js';
import { readEntryBatch } from './entry-batch.js';
import { storedParentSource } from './hierarchy-source.js';
import { toEditsReading } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { EMPTY_ENTRY_IDS, identityExtender, identityRemovalExtender } from './edit-extension.js';
import { PluginStores } from './plugin-store.js';
import { EventBus } from './event-bus.js';
import { buildSiblingIndexDroppedReport, createErrorRaiser, raiseErrorOn } from './error-reporting.js';
import { applyConstructionRollUp, runTransaction } from './transaction.js';
import { replayChangeSet } from './replay.js';
import { History } from './history.js';
import type { HistoryOptions } from './history.js';
import { createFieldAccess, proposedEditsEqual } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';
import type { FieldRegistryOptions } from './fields/field-registry.js';
import { ComputedFieldCache } from './computed-cache.js';

export type { HistoryOptions };

export interface DatasetStateOptions {
  entries: readonly FlatEntryInput[];
  timeZone: string;
  /** Undo/redo capacity (`plans/s2-data-core/s2.5-undo-redo.md` §1). Defaults to a 100-entry history.
   *  `false` builds no History at all (#549): the app owns undo, through `replay()`. */
  history?: HistoryOptions | false;
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** Frozen `referenceDate` for tests (issue #112) — mirrors `ResolveDateLinesInput.now`
   *  (`layout/date-line.ts`). Defaults to `now()`, the real clock. */
  referenceDate?: Instant;
  /** The extension hook a transaction calls once per commit. Internal only — `data/` is
   *  unreachable through the package's `exports` map. S5 shipped the plugin-facing route instead: a
   *  plugin's `data` half installs its `EditExtender` through `DatasetOptions.plugins` (#15). The
   *  first-party scheduler occupies the slot in S7. This option stays the route a test uses (see
   *  "How it is tested without a public claim") — S3's drag preview and undo tests take it. Defaults
   *  to `identityExtender`: an unoccupied hook is the identity function (D4).
   *
   *  Said "S3's own job" until 2026-08-29: written the day before `87af449` moved the scheduling
   *  slice from S3 to S7, so that "S3" named the scheduling slice, not today's S3 (direct
   *  manipulation, `plans/s3-direct-manipulation/README.md` §0 P1). */
  editExtender?: EditExtender;
  /** Every installed plugin's own `fields`/`fieldTypes`/`aggregators` (#496 grill round 3) — one
   *  entry per plugin, in `DatasetOptions.plugins` order. `api/dataset.ts` builds this from
   *  `Dataset<TProps>`'s own plugin list; `data/` never imports `api/`, so it takes the plain shape
   *  rather than the plugin objects themselves. Merged with this Dataset's own `fields`/`fieldTypes`/
   *  `aggregators` and registered before `entries` is read (`mergedFieldRegistryOptions` below) — the
   *  one moment early enough that a flat value an entry carries for a plugin's Field is not yet an
   *  undeclared key. `api/dataset.ts` runs every plugin's `data()` only after this whole Dataset —
   *  the construction Rollup included — is built (ADR 0031). */
  pluginFieldDeclarations?: readonly FieldDeclarationSource[];
  /** Every installed plugin's declared `hierarchySource`, in setup order (ADR 0031) —
   *  `api/dataset.ts` builds this with `resolveSetupOrder`. Folded onto `storedParentSource` right
   *  here, before `entries` is built: the first wrapper wraps core's own source, a later one wraps the
   *  one before it, and the last one answers first — the order `data()` runs its own registrations
   *  in. */
  hierarchySourceWrappers?: readonly HierarchySourceWrapper[];
}

/** One plugin's own `fields`/`fieldTypes`/`aggregators`, or the Dataset's own (#496 grill round 3,
 *  recommendation 1) — the same shape `FieldRegistryOptions` takes, `undefined` allowed on every key so a caller
 *  that reads an absent option off a plugin object need not omit the key to satisfy
 *  `exactOptionalPropertyTypes`. `mergedFieldRegistryOptions` below folds a list of these into one
 *  `FieldRegistryOptions`, which never carries an explicit `undefined`. */
export interface FieldDeclarationSource {
  fields?: readonly Field[] | undefined;
  fieldTypes?: Readonly<Record<string, FieldType>> | undefined;
  aggregators?: Readonly<Record<string, Aggregator>> | undefined;
}

/** Merges the Dataset's own Field declarations with every plugin's own, in that order (#496 grill
 *  round 3): every fieldType across every source, then every Aggregator, then every Field — so a
 *  Field naming either resolves against the whole merged set, never just its own source's. A name
 *  two sources both declare throws `DuplicateFieldKeyError`, the same error two ordinary Field
 *  declarations sharing a key already throw; a Field key collision is still caught by `FieldRegistry`
 *  itself, which is built from the merged, concatenated list this returns. */
function mergedFieldRegistryOptions(sources: readonly FieldDeclarationSource[]): FieldRegistryOptions {
  const fieldTypes: Record<string, FieldType> = {};
  for (const source of sources) {
    for (const [name, type] of Object.entries(source.fieldTypes ?? {})) {
      if (fieldTypes[name] !== undefined) throw new DuplicateFieldKeyError(name);
      fieldTypes[name] = type;
    }
  }
  const aggregators: Record<string, Aggregator> = {};
  for (const source of sources) {
    for (const [name, fn] of Object.entries(source.aggregators ?? {})) {
      if (aggregators[name] !== undefined) throw new DuplicateFieldKeyError(name);
      aggregators[name] = fn;
    }
  }
  const fields: Field[] = [];
  for (const source of sources) fields.push(...(source.fields ?? []));
  return { fields, fieldTypes, aggregators };
}

export class DatasetState implements Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
  /** The one `Date.now()` read this Dataset performs, via time/'s `now()` (CONTEXT.md, Reference
   *  date) — unless `DatasetStateOptions.referenceDate` freezes it for a test. Fixed for the
   *  Dataset's lifetime — not re-derived on every layout pass. */
  readonly referenceDate: Instant;
  /** Every plugin's own per-entry rows. One per Dataset, never shared (I2). */
  readonly pluginStores: PluginStores;
  /** The extension hook's one occupant (D4). Composed, never replaced wholesale: installing a
   *  plugin wraps whatever is already there, so `data/` still holds one field and calls it
   *  at one site. */
  #editExtender: EditExtender;
  /** The removal hook's current occupant. It returns no id until a plugin composes onto it. */
  #removalExtender: RemovalExtender = identityRemovalExtender;
  /** `runTransaction`'s notification channel. Internal only, same reasoning as
   *  `editExtender` above — `data/` is unreachable through the package's `exports` map; `on`/`off`
   *  below are the public surface. */
  readonly bus = new EventBus<DatasetEventMap>();
  /** ADR 0038: who `rulesChanged()` below wakes. Not the `bus` above — a rule answer moving is not
   *  public event vocabulary (plans/02 §3), it is `GanttShell`'s own cue to re-resolve, through the
   *  friend-map wiring `api/dataset.ts`'s `onRulesChanged` builds (the `hierarchyFollowsParentId`
   *  pattern). */
  readonly #ruleChangeListeners = new Set<() => void>();
  /** 0 = no transaction open. Read and written only by `runTransaction` (the nesting rule). */
  openTransactions = 0;
  /** Set while `beforeChange`/`change` handlers are fanning out. Read and written
   *  only by `runTransaction` and `commitChangeSet`. */
  notifying = false;
  /** Set while the extension hook's current occupant is running (#323). Read by `runTransaction`;
   *  written only by `extraEditsFor`/`extraEditsReadingFor` below, around their one call to the
   *  occupant. */
  runningExtensionHook = false;
  readonly #entryContext: EntryReadContext;
  readonly fields: FieldRegistry;
  /** `data/`'s own ambient read scope (ADR 0017) — the zone, the registry and the tree. A
   *  consumer receives `ambientFieldContext(access)`, which is the zone. */
  readonly fieldAccess: FieldAccess;
  readonly computedCache = new ComputedFieldCache();
  /** Bumped on every committed changeset — the computed-field cache key. */
  #datasetRevision = 0;
  /** Per-instance — never a module-level counter (I2). */
  #changeSetCounter = 0;
  /** `undefined` when the app owns undo (`history: false`). */
  readonly #history: History | undefined;
  /** The last frame's `rolledUpEditsFor` answer, so a frame that repeats the same drop reuses it
   *  instead of paying the Rollup's own walk again (#425, I5). `revision` is `#datasetRevision`, not
   *  `committedById()`'s own Map identity: `EntryStore` mutates that map in place on commit, so the
   *  reference alone cannot say a commit has landed since the last frame. */
  #rolledUpPreview: { revision: number; draft: ProposedEdits; result: ProposedEdits } | undefined;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.referenceDate = options.referenceDate ?? now();
    this.#editExtender = options.editExtender ?? identityExtender;
    // Registered before `entries` below is read (#496 grill round 3): the Dataset's own
    // declarations, then every plugin's, so a flat value an entry carries for a plugin's Field is
    // never an undeclared key at ingest, the same as `entries.load()` already reads it.
    this.fields = new FieldRegistry(
      mergedFieldRegistryOptions([
        { fields: options.fields, fieldTypes: options.fieldTypes, aggregators: options.aggregators },
        ...(options.pluginFieldDeclarations ?? []),
      ]),
    );
    this.fieldAccess = createFieldAccess({
      fields: this.fields,
      timeZone: this.timeZone,
      // A row inside an open transaction is hypothetical, and `#datasetRevision` does not move
      // until the commit lands. A memo there answers a `compute` Field with the committed
      // value for a staged row, so the memo stands down until the transaction closes (ADR 0017).
      memo: () =>
        this.openTransactions > 0
          ? undefined
          : { cache: this.computedCache, datasetRevision: this.#datasetRevision },
    });
    this.#entryContext = {
      timeZone: this.timeZone,
    };
    // Folded onto core's own source, in setup order (ADR 0031): the first wrapper wraps
    // `storedParentSource`, a later one wraps the one before it, and the last one answers first.
    // Built before the entries below are read: a sibling group is the source's own checked tree
    // (ADR 0034), so the source must exist before `readEntryBatch` can ask it.
    const hierarchySource = (options.hierarchySourceWrappers ?? []).reduce<HierarchySource>(
      (source, wrap) => wrap(source),
      storedParentSource,
    );
    const { entries: read, siblingIndexDropped } = readEntryBatch(
      options.entries,
      this.#entryContext,
      this.fields,
      hierarchySource,
      'new Dataset',
    );
    if (siblingIndexDropped.length > 0) {
      const report = buildSiblingIndexDroppedReport(siblingIndexDropped);
      raiseErrorOn(this.bus, report, () => console.warn(`FreeGantt: ${report.message}`));
    }
    this.entries = new EntryStore(
      read,
      this.#entryContext,
      this.fields,
      this.fieldAccess,
      this,
      createErrorRaiser(this.bus),
      hierarchySource,
    );
    this.pluginStores = new PluginStores(this);
    // `01` §2.6 / README.md: a parent given children only through the initial array gets
    // real rolled-up values before anyone reads it, not just after the first later transaction
    // touches one of those children. No plugin has run yet (ADR 0031): a Dataset builds completely
    // — Field, hierarchy source and this Rollup all settle — before the first `data()` call.
    applyConstructionRollUp(this);
    // The authored rows are answers too, and so is whatever the Rollup above just wrote — a
    // hierarchy source may read a Field the Rollup rolls up, so this is the first point where every
    // answer construction can produce is settled and ready to report (ADR 0020).
    this.entries.reportRefusedHierarchyAnswers();
    // Subscribes to `change` right here, so it is the first subscriber ahead of every plugin's own
    // `data()` handler (ADR 0031) — a plugin's setup write records like any other commit, and
    // `Dataset`'s constructor clears the stack after the last `data()` returns (`clearHistory`
    // below), so `canUndo` still reads `false` once `new Dataset()` returns.
    this.#history = options.history === false ? undefined : new History(this, options.history);
  }

  /** Read by `data/transaction.test.ts`/`edit-extension.test.ts` to assert on the occupant itself —
   *  identity, and composition order — without calling it. `extraEditsFor` below is
   *  the seam every real caller goes through instead. */
  get editExtender(): EditExtender {
    return this.#editExtender;
  }

  /** Calls the extension hook's current occupant, with `runningExtensionHook` set for the call's
   *  own duration (#323) — `runTransaction` refuses a mutation that starts while this is `true`, so
   *  a plugin that writes through the store instead of returning its edit gets
   *  `MutationDuringExtensionHookError` rather than a second, unjoined transaction. `extraEditsFor`
   *  and `extraEditsReadingFor` below are its only two callers. */
  #callExtender(request: EditRequest): EntryEdits {
    this.runningExtensionHook = true;
    try {
      return this.#editExtender(request);
    } finally {
      this.runningExtensionHook = false;
    }
  }

  /** The commit path's door onto the removal hook: calls the occupant once, with
   *  `runningExtensionHook` set, so a store write from inside it throws
   *  `MutationDuringExtensionHookError` — the same guard the edit extender has. It builds the
   *  request only when a plugin installed a removal extender. */
  removalsFor(buildRequest: () => EditRequest): ReadonlySet<EntryId> {
    if (this.#removalExtender === identityRemovalExtender) return EMPTY_ENTRY_IDS;
    const request = buildRequest();
    this.runningExtensionHook = true;
    try {
      return this.#removalExtender(request);
    } finally {
      this.runningExtensionHook = false;
    }
  }

  /** The one door onto the extension hook (D4): calls the current occupant and hands back
   *  what it returns. `api/dataset.ts`'s `extraEditsFor(dataset, request)` (the friend function this
   *  mirrors, ADR 0007) and `api/gantt.ts`'s drag-preview wiring both call this — one seam, not two —
   *  so `api/Dataset` never had to expose the raw occupant to get either job done (#209, replacing
   *  the public
   *  `editExtender` getter this file used to mirror). The commit path calls `extraEditsReadingFor`
   *  below instead (#232) — it needs one more fact than this method's public return shape can carry.
   *
   *  It is also where the hook's loose writes become storage-shaped (#209 C3): the occupant returns
   *  `EntryEdits`, the same object `entries.update()` takes, and `toEditsReading` reads it through the
   *  dataset's own zone and end rule. */
  extraEditsFor(request: EditRequest): ProposedEdits {
    return toEditsReading(
      this.#callExtender(request),
      this.#entryContext,
      (id) => request.entryAfterEdits(id),
      this.fields,
      this.entries.lockRule,
      this.entries.hierarchySource,
    ).stored;
  }

  /** The commit path's own door onto the extension hook (#232) — calls the occupant exactly once,
   *  the same as `extraEditsFor` above, and hands `buildCommitChangeSet` the occupant's stored edits
   *  to merge against the body's own (ADR 0026 — `start`/`end` are ordinary Fields now, so there is
   *  no envelope reconciliation left to report here). Not part of the public surface: an app author
   *  never reads this reading, only the reconciled `ProposedEdits` `extraEditsFor` already gives
   *  them. */
  extraEditsReadingFor(request: EditRequest): EditsReading {
    return toEditsReading(
      this.#callExtender(request),
      this.#entryContext,
      (id) => request.entryAfterEdits(id),
      this.fields,
      this.entries.lockRule,
      this.entries.hierarchySource,
    );
  }

  /** The tree every read and every Rollup goes through (ADR 0020). Core's own source is
   *  `(entry) => entry.parentId`; the store holds whichever occupant plugins composed onto it. */
  get hierarchySource(): HierarchySource {
    return this.entries.hierarchySource;
  }

  /** #425: what a vertical drag's own preview ghosts on top of `draft` — the new parent's dates
   *  rolling up to cover the entry it just gained (ruling 5). Runs the Rollup alone, on the
   *  committed rows plus `draft`, with no extension hook to call and nothing to commit
   *  (`build-commit-change-set.ts`'s `rolledUpEditsFor`, mirroring `extraEditsFor`'s own shape,
   *  ADR 0007). `view/gesture-pipeline.ts#computePreview` is the only caller, and only for a
   *  `place` drop — a time-only drag ghosts nothing here on purpose (#425 ruling, a follow-up
   *  covers it).
   *
   *  A row-axis drag holds its own dates still and revisits the same drop target for many frames in
   *  a row (`entry-gestures.ts` pins `dxPx` to 0 there), so `#rolledUpPreview` answers straight from
   *  the last frame whenever this one names the same revision and the same written values —
   *  `proposedEditsEqual` costs the size of `draft`, never the size of the dataset, so a cache miss
   *  is no more expensive than not caching at all. */
  rolledUpEditsFor(draft: ProposedEdits): ProposedEdits {
    const cached = this.#rolledUpPreview;
    if (cached && cached.revision === this.#datasetRevision && proposedEditsEqual(cached.draft, draft)) {
      return cached.result;
    }
    const result = rolledUpEditsForCommit({
      committed: this.entries.committedById(),
      draft,
      fields: this.fields,
      fieldAccess: this.fieldAccess,
      tree: {
        committedParents: this.entries.committedParents(),
        committedChildIds: this.entries.committedChildIds(),
        source: this.hierarchySource,
      },
    });
    this.#rolledUpPreview = { revision: this.#datasetRevision, draft, result };
    return result;
  }

  /** Call: `ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)))`.
   *  Installing composes onto the current occupant rather than evicting it, so a second plugin needs
   *  no priority machinery and `EditExtenderConflictError` never gets written. */
  setExtender(wrap: ExtenderWrapper): void {
    this.#editExtender = wrap(this.#editExtender);
  }

  /** Call: `ctx.edits.setRemovalExtender((next) => (request) => new Set([...next(request), ...mine(request)]))`.
   *  Installing composes onto the current occupant, the same as `setExtender` above. */
  setRemovalExtender(wrap: RemovalExtenderWrapper): void {
    this.#removalExtender = wrap(this.#removalExtender);
  }

  /** The per-entry lock rule every write door reads (#473, I14). Core's own bottom occupant answers
   *  the Field's own `editable`; the store holds whichever occupant a plugin composed onto it. */
  get lockRule(): FieldLockRule {
    return this.entries.lockRule;
  }

  /** Call: `ctx.edits.setLockRule((next) => (entry, field) => field === 'cost' && entry.isDescendantOf(unlockedId) ? 'anywhere' : next(entry, field))`.
   *  Opens `cost` on every descendant of `unlockedId`, not on `unlockedId` itself —
   *  `isDescendantOf` answers `false` for an Entry asked about itself (#473).
   *  Installing composes onto the current occupant rather than evicting it, exactly the way
   *  `setExtender` above does. */
  setLockRule(wrap: FieldLockRuleWrapper): void {
    this.entries.setLockRule(wrap);
  }

  /** Call: `ctx.edits.setPlaceRule((next) => (place) => isLocked(place.parent?.id) ? 'api' : next(place))`.
   *  Installing composes onto the current occupant rather than evicting it, exactly the way
   *  `setLockRule` above does. */
  setPlaceRule(wrap: PlaceRuleWrapper): void {
    this.entries.setPlaceRule(wrap);
  }

  /** Call: `ctx.edits.setRemoveRule((next) => (removal) => isLocked(removal.entry.id) ? 'api' : next(removal))`.
   *  Installing composes onto the current occupant rather than evicting it, exactly the way
   *  `setPlaceRule` above does (#611). */
  setRemoveRule(wrap: RemoveRuleWrapper): void {
    this.entries.setRemoveRule(wrap);
  }

  /** Call: `ctx.edits.rulesChanged()`. Wakes every listener `onRulesChanged` below registered — one
   *  per bound Gantt — so each re-resolves what it currently offers. Writes nothing (I14 unaffected). */
  rulesChanged(): void {
    for (const listener of this.#ruleChangeListeners) listener();
  }

  /** Friend-only subscription `api/dataset.ts`'s `onRulesChanged` wires a bound Gantt's refresh
   *  through, the same friend-map pattern `hierarchyFollowsParentId` uses for a query instead of a
   *  subscription. Returns the Disposer that drops exactly this listener. */
  onRulesChanged(listener: () => void): Disposer {
    this.#ruleChangeListeners.add(listener);
    return () => this.#ruleChangeListeners.delete(listener);
  }

  /** Call: `dataset.editableOf('van-1', 'cost')` — the effective lock on one cell (#473): a plugin's
   *  own per-entry answer, or the Field's own `editable` when the rule has no opinion. The same
   *  resolver `entries.update()` and an `EditExtender` cascade write against (I14). */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable {
    return this.entries.editableOf(id, field);
  }

  /** Call: `ctx.edits.setBarMoveRule((next) => (entry) => entry.id === 'phase-1' ? false : next(entry))`.
   *  Installing composes onto the current occupant, the same way `setRemoveRule` above does. */
  setBarMoveRule(wrap: BarMoveRuleWrapper): void {
    this.entries.setBarMoveRule(wrap);
  }

  /** Call: `dataset.barMovesOf('phase-1')` — the effective bar move rule answer for one Entry. */
  barMovesOf(id: EntryId | string): boolean {
    return this.entries.barMovesOf(id);
  }

  /** Call: `dataset.placeableOf('t2', 'p1')` — the effective place rule answer for one cross-parent
   *  (or same-parent) move (ADR 0038). The same resolver a bar drag, a grid row drag and
   *  `entries.update()`/`add()` all meet (I14). */
  placeableOf(id: EntryId | string, parentId: EntryId | string | undefined): FieldEditable {
    return this.entries.placeableOf(id, parentId);
  }

  /** Call: `dataset.removableOf('t2')` — the effective remove rule answer for `id`'s whole removal
   *  (#611): the top id and every member of its subtree, narrowest answer wins. The same resolver
   *  `entries.remove()` reads (I14). */
  removableOf(id: EntryId | string): FieldEditable {
    return this.entries.removableOf(id);
  }

  /** `Dataset`'s constructor calls this once, right after the last plugin's `data()` returns
   *  (ADR 0031): a plugin's setup write is an ordinary commit, so it records like one, and this is
   *  what un-does that — the stack `undo()` reads goes back to empty, so `canUndo` reads `false`
   *  once `new Dataset()` returns (#137). */
  clearHistory(): void {
    this.#history?.clear();
  }

  nextChangeSetId(): ChangeSetId {
    this.#changeSetCounter += 1;
    return changeSetId(this.#changeSetCounter);
  }

  /** Call: `dataset.field('cost')` — the resolved declaration, or `undefined`. */
  field(key: FieldKey): Field | undefined {
    return this.fields.get(key);
  }

  get datasetRevision(): number {
    return this.#datasetRevision;
  }

  bumpDatasetRevision(): void {
    this.#datasetRevision += 1;
  }

  /** Batches `body`'s mutations into one `ChangeSet`. `'user'` is the only origin a public
   *  caller can produce in S2 — `interaction/` gets an option once it has a gesture to tag (S3). */
  transaction<T>(body: () => T): T {
    return runTransaction(this, body, 'user');
  }

  on<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): Disposer {
    return this.bus.on(name, handler);
  }

  off<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): void {
    this.bus.off(name, handler);
  }

  get canUndo(): boolean {
    return this.#history?.canUndo ?? false;
  }

  get canRedo(): boolean {
    return this.#history?.canRedo ?? false;
  }

  undo(): void {
    this.#history?.undo();
  }

  redo(): void {
    this.#history?.redo();
  }

  /** The write path `data/history.ts` uses, published (`plans/s2-data-core/s2b-undo-replay-seam.md`).
   *  Only `'undo'`/`'redo'` origins are legal; `'user'` throws `InvalidReplayOriginError`. */
  replay(changeSet: ChangeSet, options?: ReplayOptions): void {
    replayChangeSet(this, changeSet, options);
  }
}
