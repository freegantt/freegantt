// data/ — DatasetState: the live state one Dataset instance owns privately (D-S2-2, OQ5). `api/Dataset`
// is a thin façade that constructs one of these and delegates `entries`/`timeZone`/`dateOnlyEnd` to it —
// the same structural/façade relationship `GanttShell` already has with `Gantt`.

import type {
  Aggregator,
  ChangeSet,
  ChangeSetId,
  DateOnlyEndRule,
  Dataset,
  DatasetEventMap,
  EntryId,
  FlatEntryInput,
  Field,
  FieldEditable,
  DurationMeasure,
  FieldKey,
  FieldLockRule,
  FieldLockRuleWrapper,
  FieldType,
  Instant,
  Disposer,
  EditExtender,
  EditRequest,
  EntryEdits,
  ProposedEdits,
  ExtenderWrapper,
  HierarchySource,
  HierarchySourceWrapper,
} from '../model/index.js';
import { changeSetId, DuplicateFieldKeyError } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { assertEntryBatchIsSound } from './entry-batch.js';
import { storedParentSource } from './hierarchy-source.js';
import { toEditsReading, toEntries } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { identityExtender } from './edit-extension.js';
import { PluginStores } from './plugin-store.js';
import { EventBus } from './event-bus.js';
import { createErrorRaiser } from './error-reporting.js';
import { applyConstructionRollUp, runTransaction } from './transaction.js';
import { replayChangeSet } from './replay.js';
import { History } from './history.js';
import type { HistoryOptions } from './history.js';
import { createFieldAccess } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';
import type { FieldRegistryOptions } from './fields/field-registry.js';
import { ComputedFieldCache } from './computed-cache.js';

export type { HistoryOptions };

export interface DatasetStateOptions {
  entries: readonly FlatEntryInput[];
  timeZone: string;
  dateOnlyEnd?: DateOnlyEndRule;
  /** Undo/redo capacity (`plans/s2-data-core/s2.5-undo-redo.md` §1). Defaults to a 100-entry history —
   *  `history: { capacity: 0 }` is not a supported way to disable it; construct without `data/history.ts`
   *  for that (D-S2-23), which S2 has no consumer-facing option for yet. */
  history?: HistoryOptions;
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  /** How core measures a duration (ADR 0017, Q6/J12). Defaults to `'span'`. */
  measureDuration?: DurationMeasure;
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** Frozen `referenceDate` for tests (issue #112) — mirrors `ResolveDateLinesInput.now`
   *  (`layout/date-line.ts`). Defaults to `now()`, the real clock. */
  referenceDate?: Instant;
  /** The extension hook a transaction calls once per commit (D-S2-6). Internal only — `data/` is
   *  unreachable through the package's `exports` map. S5 shipped the plugin-facing route instead: a
   *  plugin's `data` half installs its `EditExtender` through `DatasetOptions.plugins` (#15). The
   *  first-party scheduler occupies the slot in S7. This option stays the route a test uses (D-S2-6,
   *  "How it is tested without a public claim") — S3's drag preview and undo tests take it. Defaults
   *  to `identityExtender`: an unoccupied hook is the identity function (D4).
   *
   *  Said "S3's own job" until 2026-08-29: written the day before `87af449` moved the scheduling
   *  slice from S3 to S7, so that "S3" named the scheduling slice, not today's S3 (direct
   *  manipulation, `plans/s3-direct-manipulation/README.md` §0 P1). */
  editExtender?: EditExtender;
  /** Installs this Dataset's plugin list and returns the disposer for the whole set. Called
   *  at the one legal moment: after the entry store exists, so a `setup`-time store write can wrap
   *  itself in a transaction, and before the construction Rollup, because a Field a plugin declares
   *  must exist before the Rollup first walks (D-S5-4).
   *
   *  A callback, not a plugin array, because `extensions/install-dataset-plugins.ts` is where installation
   *  lives and `data/` may not import `extensions/` (plans/01 §1). `api/dataset.ts` is the composition
   *  root that ties the two together, the same way it already wires view/ and interaction/. */
  installPlugins?: (state: DatasetState) => Disposer;
  /** Every installed plugin's own `fields`/`fieldTypes`/`aggregators` (#496 grill round 3, R1) — one
   *  entry per plugin, in `DatasetOptions.plugins` order. `api/dataset.ts` builds this from
   *  `Dataset<TProps>`'s own plugin list; `data/` never imports `api/`, so it takes the plain shape
   *  rather than the plugin objects themselves. Merged with this Dataset's own `fields`/`fieldTypes`/
   *  `aggregators` and registered before `entries` is read (`mergedFieldRegistryOptions` below) —
   *  the one moment early enough that a flat value an entry carries for a plugin's Field is not yet
   *  an undeclared key, and late enough that `installPlugins` (called after, once `entries` exists)
   *  still runs every plugin's `data()` before the construction Rollup, same as before. */
  pluginFieldDeclarations?: readonly FieldDeclarationSource[];
  /** Every installed plugin's declared `hierarchySource`, in setup order (ADR 0031) —
   *  `api/dataset.ts` builds this with `resolveSetupOrder`, same as `pluginFieldDeclarations`. Folded
   *  onto `storedParentSource` right here, before `entries` is built: the first wrapper wraps core's
   *  own source, a later one wraps the one before it, and the last one answers first — the same order
   *  a plugin's own `ctx.hierarchy.setSource` call would have composed in. */
  hierarchySourceWrappers?: readonly HierarchySourceWrapper[];
}

/** One plugin's own `fields`/`fieldTypes`/`aggregators`, or the Dataset's own (#496 grill round 3,
 *  R1) — the same shape `FieldRegistryOptions` takes, `undefined` allowed on every key so a caller
 *  that reads an absent option off a plugin object need not omit the key to satisfy
 *  `exactOptionalPropertyTypes`. `mergedFieldRegistryOptions` below folds a list of these into one
 *  `FieldRegistryOptions`, which never carries an explicit `undefined`. */
export interface FieldDeclarationSource {
  fields?: readonly Field[] | undefined;
  fieldTypes?: Readonly<Record<string, FieldType>> | undefined;
  aggregators?: Readonly<Record<string, Aggregator>> | undefined;
}

/** Merges the Dataset's own Field declarations with every plugin's own, in that order (#496 grill
 *  round 3, R1): every fieldType across every source, then every Aggregator, then every Field — so a
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
  readonly dateOnlyEnd: DateOnlyEndRule;
  /** The one `Date.now()` read this Dataset performs, via time/'s `now()` (CONTEXT.md, Reference
   *  date) — unless `DatasetStateOptions.referenceDate` freezes it for a test. Fixed for the
   *  Dataset's lifetime — not re-derived on every layout pass. */
  readonly referenceDate: Instant;
  /** Every plugin's own per-entry rows (D-S5-24). One per Dataset, never shared (I2). */
  readonly pluginStores: PluginStores;
  /** The extension hook's one occupant (D4, D-S2-6). Composed, never replaced wholesale: installing a
   *  plugin wraps whatever is already there (D-S5-23), so `data/` still holds one field and calls it
   *  at one site. */
  #editExtender: EditExtender;
  /** `runTransaction`'s notification channel (D-S2-5, D-S2-24). Internal only, same reasoning as
   *  `editExtender` above — `data/` is unreachable through the package's `exports` map; `on`/`off`
   *  below are the public surface. */
  readonly bus = new EventBus<DatasetEventMap>();
  /** 0 = no transaction open. Read and written only by `runTransaction` (D-S2-8's nesting rule). */
  openTransactions = 0;
  /** Set while `beforeChange`/`change` handlers are fanning out (D-S2-9, D-S2-25). Read and written
   *  only by `runTransaction` and `commitChangeSet`. */
  notifying = false;
  /** Set while the extension hook's current occupant is running (#323). Read by `runTransaction`;
   *  written only by `extraEditsFor`/`extraEditsReadingFor` below, around their one call to the
   *  occupant. */
  runningExtensionHook = false;
  readonly #entryContext: EntryReadContext;
  readonly fields: FieldRegistry;
  /** `data/`'s own ambient read scope (ADR 0017, J16) — the zone, the registry, the duration
   *  policy and the tree. A consumer receives `ambientFieldContext(access)`, which is the zone. */
  readonly fieldAccess: FieldAccess;
  readonly computedCache = new ComputedFieldCache();
  /** Bumped on every committed changeset — the computed-field cache key (D-S4-10). */
  #datasetRevision = 0;
  /** Per-instance — never a module-level counter (I2). */
  #changeSetCounter = 0;
  readonly #history: History;
  readonly #disposePlugins: Disposer | undefined;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = options.referenceDate ?? now();
    this.#editExtender = options.editExtender ?? identityExtender;
    // Registered before `entries` below is read (#496 grill round 3, R1): the Dataset's own
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
      measureDuration: options.measureDuration ?? 'span',
      // A row inside an open transaction is hypothetical, and `#datasetRevision` does not move
      // until the commit lands (D-S4-10). A memo there answers a `compute` Field with the committed
      // value for a staged row, so the memo stands down until the transaction closes (ADR 0017).
      memo: () =>
        this.openTransactions > 0
          ? undefined
          : { cache: this.computedCache, datasetRevision: this.#datasetRevision },
    });
    this.#entryContext = {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
    };
    const read = toEntries(options.entries, this.#entryContext, this.fields, 'new Dataset');
    assertEntryBatchIsSound(read, 'new Dataset');
    // Folded onto core's own source, in setup order (ADR 0031): the first wrapper wraps
    // `storedParentSource`, a later one wraps the one before it, and the last one answers first.
    const hierarchySource = (options.hierarchySourceWrappers ?? []).reduce<HierarchySource>(
      (source, wrap) => wrap(source),
      storedParentSource,
    );
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
    // Plugins set up here and nowhere else: the entry store exists, so a `setup`-time store write
    // wraps itself in a transaction, and the construction Rollup below has not run, so a Field a
    // plugin declares is in the registry before the Rollup first walks (D-S5-4). History subscribes
    // after, so installing a plugin is not itself an undoable step.
    this.#disposePlugins = options.installPlugins?.(this);
    // `01` §2.6 / README.md D-S2-22: a parent given children only through the initial array gets
    // real rolled-up values before anyone reads it, not just after the first later transaction
    // touches one of those children.
    applyConstructionRollUp(this);
    // Subscribes to `change` right here, before the constructor returns and so before any consumer
    // handler exists (`s2.5-undo-redo.md` §2.1) — `canUndo` reads true inside the very `change` a
    // later-registered handler first sees.
    this.#history = new History(this, options.history);
  }

  /** Read by `data/transaction.test.ts`/`edit-extension.test.ts` to assert on the occupant itself —
   *  identity, and composition order — without calling it (D-S2-6, D-S5-23). `extraEditsFor` below is
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

  /** The one door onto the extension hook (D4, D-S2-6): calls the current occupant and hands back
   *  what it returns. `api/dataset.ts`'s `extraEditsFor(dataset, request)` (the friend function this
   *  mirrors, ADR 0007) and `api/gantt.ts`'s drag-preview wiring both call this — one seam, not two —
   *  so `api/Dataset` never had to expose the raw occupant to get either job done (#209 Q5, replacing
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

  /** Call: `ctx.hierarchy.setSource((next) => (entry) => entry.props.phaseId ?? next(entry))`.
   *  Installing composes onto the current occupant rather than evicting it, exactly the way
   *  `setExtender` below does (D-S5-23, ADR 0020). */
  setHierarchySource(wrap: HierarchySourceWrapper): void {
    this.entries.setHierarchySource(wrap);
  }

  /** Call: `ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)))`.
   *  Installing composes onto the current occupant rather than evicting it, so a second plugin needs
   *  no priority machinery and `EditExtenderConflictError` never gets written (D-S5-23). */
  setExtender(wrap: ExtenderWrapper): void {
    this.#editExtender = wrap(this.#editExtender);
  }

  /** The per-entry lock rule every write door reads (#473, I14). Core's own occupant is silence
   *  (`identityFieldLockRule`); the store holds whichever occupant a plugin composed onto it. */
  get lockRule(): FieldLockRule {
    return this.entries.lockRule;
  }

  /** Call: `ctx.edits.setLockRule((next) => (entry, field) => field === 'cost' && entry.isDescendantOf(unlockedId) ? 'anywhere' : next(entry, field))`.
   *  Opens `cost` on every descendant of `unlockedId`, not on `unlockedId` itself —
   *  `isDescendantOf` answers `false` for an Entry asked about itself (#473).
   *  Installing composes onto the current occupant rather than evicting it, exactly the way
   *  `setExtender` above does (D-S5-23). */
  setLockRule(wrap: FieldLockRuleWrapper): void {
    this.entries.setLockRule(wrap);
  }

  /** Call: `dataset.editableOf('van-1', 'cost')` — the effective lock on one cell (#473): a plugin's
   *  own per-entry answer, or the Field's own `editable` when the rule has no opinion. The same
   *  resolver `entries.update()` and an `EditExtender` cascade write against (I14). */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable {
    return this.entries.editableOf(id, field);
  }

  /** Releases every installed plugin, in reverse setup order. */
  destroy(): void {
    this.#disposePlugins?.();
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

  /** Batches `body`'s mutations into one `ChangeSet` (D-S2-8). `'user'` is the only origin a public
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
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  undo(): void {
    this.#history.undo();
  }

  redo(): void {
    this.#history.redo();
  }

  /** The write path `data/history.ts` uses, published (`plans/s2-data-core/s2b-undo-replay-seam.md`).
   *  Only `'undo'`/`'redo'` origins are legal; `'user'` throws `InvalidReplayOriginError`. */
  replay(changeSet: ChangeSet): void {
    replayChangeSet(this, changeSet);
  }
}
