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
  EntryInput,
  Field,
  DurationMeasure,
  FieldKey,
  FieldType,
  Instant,
  SegmentId,
  Disposer,
  EditExtender,
  EditRequest,
  ProposedEdits,
  ExtenderWrapper,
} from '../model/index.js';
import { changeSetId, mintedSegmentId } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { authoredSegmentIdsOf, toEditsReading, toEntries } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { identityExtender } from './edit-extension.js';
import { PluginStores } from './plugin-store.js';
import { EventBus } from './event-bus.js';
import { applyConstructionRollUp, runTransaction } from './transaction.js';
import { replayChangeSet } from './replay.js';
import { History } from './history.js';
import type { HistoryOptions } from './history.js';
import { createFieldAccess } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';
import { ComputedFieldCache } from './computed-cache.js';

export type { HistoryOptions };

export interface DatasetStateOptions {
  entries: readonly EntryInput[];
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
   *  A plugin's `data` half installs its `EditExtender` through `DatasetOptions.plugins` (#15). The
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
  /** Per-instance for the same reason (#212) — the id a Segment nobody named gets. */
  #segmentCounter = 0;
  /** Every `SegmentId` this construction's own `entries` input already named, reserved before the
   *  first mint (#212) — the counter and an authored id share one format (`sg${n}`), so a document
   *  round trip can otherwise hand a minted id to the same number an authored one already claimed. */
  readonly #reservedSegmentIds: ReadonlySet<SegmentId>;
  /** `false` until `this.entries` is assigned — `#segmentIdTaken` cannot read the store before it
   *  exists, which is exactly the window `#reservedSegmentIds` covers on its own. */
  #entryStoreReady = false;
  readonly #history: History;
  readonly #disposePlugins: Disposer | undefined;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = options.referenceDate ?? now();
    this.#editExtender = options.editExtender ?? identityExtender;
    this.fields = new FieldRegistry({
      fields: options.fields ?? [],
      fieldTypes: options.fieldTypes ?? {},
      aggregators: options.aggregators ?? {},
    });
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
    this.#reservedSegmentIds = authoredSegmentIdsOf(options.entries);
    this.#entryContext = {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
      mintSegmentId: () => this.#nextSegmentId(),
    };
    this.entries = new EntryStore(
      toEntries(options.entries, this.#entryContext, this.fields),
      this.#entryContext,
      this.fields,
      this.fieldAccess,
      this,
    );
    this.#entryStoreReady = true;
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
      this.#editExtender(request),
      this.#entryContext,
      (id) => request.entryAfterEdits(id),
      this.fields,
    ).stored;
  }

  /** The commit path's own door onto the extension hook (#232) — calls the occupant exactly once,
   *  the same as `extraEditsFor` above, but also reports which of `start`/`end`/`segments` the
   *  occupant's own loose edit named on each Entry. `buildCommitChangeSet` needs that fact to tell
   *  the hook's authored envelope keys from the ones `reconcileEnvelope` derives on the hook's
   *  behalf — `ProposedEdit.proposedKeys` alone conflates the two (#232). Not part of the public
   *  surface: an app author never reads an envelope key list, only the reconciled `ProposedEdits`
   *  `extraEditsFor` already gives them. */
  extraEditsReadingFor(request: EditRequest): EditsReading {
    return toEditsReading(
      this.#editExtender(request),
      this.#entryContext,
      (id) => request.entryAfterEdits(id),
      this.fields,
    );
  }

  /** Call: `ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)))`.
   *  Installing composes onto the current occupant rather than evicting it, so a second plugin needs
   *  no priority machinery and `EditExtenderConflictError` never gets written (D-S5-23). */
  setExtender(wrap: ExtenderWrapper): void {
    this.#editExtender = wrap(this.#editExtender);
  }

  /** Releases every installed plugin, in reverse setup order. */
  destroy(): void {
    this.#disposePlugins?.();
  }

  #nextSegmentId(): SegmentId {
    let candidate: SegmentId;
    do {
      this.#segmentCounter += 1;
      candidate = mintedSegmentId(this.#segmentCounter);
    } while (this.#segmentIdTaken(candidate));
    return candidate;
  }

  /** `id` already names a Segment — reserved by this construction's own input, or already on an
   *  Entry the store holds (#212). A minted id and an authored one share one counter format
   *  (`sg${n}`), so skipping a taken candidate is what keeps a document round trip from handing the
   *  two the same number. */
  #segmentIdTaken(id: SegmentId): boolean {
    if (this.#reservedSegmentIds.has(id)) return true;
    if (!this.#entryStoreReady) return false;
    return this.entries.entryIdOfSegment(id) !== undefined;
  }

  nextChangeSetId(): ChangeSetId {
    this.#changeSetCounter += 1;
    return changeSetId(this.#changeSetCounter);
  }

  /** `TransactionData.mintSegmentId` (ADR 0012) — `build-commit-change-set.ts`'s real counter for a
   *  plugin cascade that turns a dateless Entry spanning for the first time. Shares `#nextSegmentId`
   *  with construction ingest (`toEntries`), so a minted id never collides with an authored one. */
  mintSegmentId(): SegmentId {
    return this.#nextSegmentId();
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

  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void {
    this.bus.on(name, handler);
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
