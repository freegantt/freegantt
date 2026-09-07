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
  DatasetHierarchy,
  EntryInput,
  EntryKind,
  Field,
  FieldContext,
  FieldKey,
  FieldType,
  Instant,
  PluginDocument,
  RollUpKinds,
  SegmentId,
  Disposer,
  EditExtender,
  EditRequest,
  StoredEdits,
  ExtenderWrapper,
} from '../model/index.js';
import { changeSetId, mintedSegmentId } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { authoredSegmentIdsOf, readEdits, readEditsDetailed, readEntries } from './entry-reader.js';
import type { EditsReading } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { identityExtender } from './edit-extension.js';
import { PluginStores } from './plugin-store.js';
import { EventBus } from './event-bus.js';
import { applyConstructionRollUp, runTransaction } from './transaction.js';
import { replayChangeSet } from './replay.js';
import { History } from './history.js';
import type { HistoryOptions } from './history.js';
import { createFieldContext } from './fields/field-access.js';
import { FieldRegistry } from './fields/field-registry.js';
import { ComputedFieldCache } from './computed-cache.js';

export type { HistoryOptions };

/** `'none'` and `[]` both disable derivation; omitted defaults to `['group']`. */
export function resolveRollUpKinds(input: RollUpKinds | undefined): ReadonlySet<EntryKind> {
  if (input === 'none') return new Set();
  const list = input ?? ['group'];
  if (list.length === 0) return new Set();
  return new Set(list);
}

function resolveHierarchy(input: DatasetHierarchy | undefined): DatasetHierarchy {
  return { autoGroup: input?.autoGroup !== false };
}

export interface DatasetStateOptions {
  entries: readonly EntryInput[];
  timeZone: string;
  dateOnlyEnd?: DateOnlyEndRule;
  /** Undo/redo capacity (`plans/s2-data-core/s2.5-undo-redo.md` §1). Defaults to a 100-entry history —
   *  `history: { capacity: 0 }` is not a supported way to disable it; construct without `data/history.ts`
   *  for that (D-S2-23), which S2 has no consumer-facing option for yet. */
  history?: HistoryOptions;
  /** Kinds whose rolling-up Fields the Rollup derives from their children, every commit
   *  (`01` §2.5/§2.6). Defaults to `['group']`. `rollUpKinds: 'none'` or `[]` opts every kind out —
   *  the supported way to ask for hand-set values everywhere (S4.2). */
  rollUpKinds?: RollUpKinds;
  fields?: readonly Field[];
  fieldTypes?: Readonly<Record<string, FieldType>>;
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** First-child promotion (D-S4-17). Defaults to `{ autoGroup: true }`. Pass
   *  `{ autoGroup: false }` to keep `'span'` parents as authored. */
  hierarchy?: DatasetHierarchy;
  /** Frozen `referenceDate` for tests (issue #112) — mirrors `ResolveDateLinesInput.now`
   *  (`layout/date-line.ts`). Defaults to `now()`, the real clock. */
  referenceDate?: Instant;
  /** The extension hook a transaction calls once per commit (D-S2-6). Internal only — `data/` is
   *  unreachable through the package's `exports` map, so a plugin-facing install API lands in **S5**
   *  with the plugin runtime (#15), not on this option; the first-party scheduler occupies the slot in
   *  S7. Until then this is how a test installs one (D-S2-6, "How it is tested without a public
   *  claim") — S3's drag preview and undo tests use exactly this route. Defaults to
   *  `identityExtender`: an unoccupied hook is the identity function (D4).
   *
   *  Said "S3's own job" until 2026-08-29: written the day before `87af449` moved the scheduling
   *  slice from S3 to S7, so that "S3" named the scheduling slice, not today's S3 (direct
   *  manipulation, `plans/s3-direct-manipulation/README.md` §0 P1). */
  editExtender?: EditExtender;
  /** Plugin rows a Document carried in (D-S5-24). Rows whose plugin this Dataset does not install are
   *  kept and written back untouched — passenger data, the posture an undeclared `meta` key has. */
  pluginRows?: PluginDocument;
  /** Installs this Dataset's `DatasetPlugin` list and returns the disposer for the whole set. Called
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
   *  Dataset's lifetime — not re-derived on every layout pass. Used to initialize a roll-up-kind
   *  entry's zero-length span before the Rollup gives it a real one. */
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
  /** Kinds whose rolling-up Fields the Rollup derives from their children (`01` §2.5). Live-reconfigurable
   *  (D-S4-6). Read by `data/transaction.ts`'s commit step — this class hands over the *kinds*, never
   *  the function (`rollup-is-removable`, D-S4-7). */
  #rollUpKinds: ReadonlySet<EntryKind>;
  readonly #entryContext: EntryReadContext;
  /** First-child promotion (D-S4-17). Live — later commits read this; existing Kind stays. */
  #hierarchy: DatasetHierarchy;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
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
    this.#rollUpKinds = resolveRollUpKinds(options.rollUpKinds);
    this.#hierarchy = resolveHierarchy(options.hierarchy);
    this.fields = new FieldRegistry({
      fields: options.fields ?? [],
      fieldTypes: options.fieldTypes ?? {},
      aggregators: options.aggregators ?? {},
    });
    this.fieldContext = createFieldContext(this.fields, this.timeZone, () => ({
      cache: this.computedCache,
      datasetRevision: this.#datasetRevision,
    }));
    this.#reservedSegmentIds = authoredSegmentIdsOf(options.entries);
    this.#entryContext = {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
      referenceDate: this.referenceDate,
      rollUpKinds: this.#rollUpKinds,
      mintSegmentId: () => this.#nextSegmentId(),
    };
    this.entries = new EntryStore(
      readEntries(options.entries, this.#entryContext),
      this.#entryContext,
      this.fields,
      this.fieldContext,
      this,
    );
    this.#entryStoreReady = true;
    this.pluginStores = new PluginStores(options.pluginRows, this);
    // Plugins set up here and nowhere else: the entry store exists, so a `setup`-time store write
    // wraps itself in a transaction, and the construction Rollup below has not run, so a Field a
    // plugin declares is in the registry before the Rollup first walks (D-S5-4). History subscribes
    // after, so installing a plugin is not itself an undoable step.
    this.#disposePlugins = options.installPlugins?.(this);
    // `01` §2.6 / README.md D-S2-22: a roll-up-kind entry given children only through the initial
    // array gets real rolled-up values before anyone reads it, not just after the first later
    // transaction touches one of those children. `fromJSON` gets this for free, being construction
    // like any other.
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
   *  what it returns. `api/Dataset.extraEditsFor` (the public method this mirrors) and
   *  `api/gantt.ts`'s drag-preview wiring both call this — one seam, not two — so `api/Dataset` never
   *  had to expose the raw occupant to get either job done (#209 Q5, replacing the public
   *  `editExtender` getter this file used to mirror). The commit path calls `readExtenderEdits`
   *  below instead (#232) — it needs one more fact than this method's public return shape can carry.
   *
   *  It is also where the hook's loose writes become storage-shaped (#209 C3): the occupant returns
   *  `EntryEdits`, the same object `entries.update()` takes, and `readEdits` reads it through the
   *  dataset's own zone and end rule. */
  extraEditsFor(request: EditRequest): StoredEdits {
    return readEdits(
      this.#editExtender(request),
      this.#entryContext,
      (id) => request.entryAfterEdits(id),
      this.fields,
    );
  }

  /** The commit path's own door onto the extension hook (#232) — calls the occupant exactly once,
   *  the same as `extraEditsFor` above, but also reports which of `start`/`end`/`segments` the
   *  occupant's own loose edit named on each Entry. `buildCommitChangeSet` needs that fact to tell
   *  the hook's authored envelope keys from the ones `reconcileEnvelope` derives on the hook's
   *  behalf — `StoredEdit.proposedKeys` alone conflates the two (#232). Not part of the public
   *  surface: an app author never reads an envelope key list, only the reconciled `StoredEdits`
   *  `extraEditsFor` already gives them. */
  readExtenderEdits(request: EditRequest): EditsReading {
    return readEditsDetailed(
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

  get rollUpKinds(): ReadonlySet<EntryKind> {
    return this.#rollUpKinds;
  }

  /** Live assignment of `'none'` or `[]` opts every kind out (D-S4-6). */
  setRollUpKinds(value: RollUpKinds): void {
    const next = resolveRollUpKinds(value);
    this.#rollUpKinds = next;
    this.#entryContext.rollUpKinds = next;
  }

  get hierarchy(): DatasetHierarchy {
    return this.#hierarchy;
  }

  /** Call: `state.setHierarchy({ autoGroup: false })`. Later first-child commits obey this. */
  setHierarchy(value: DatasetHierarchy): void {
    this.#hierarchy = resolveHierarchy(value);
  }

  /** `model/`'s `Dataset` interface (S3, D-S3-9) — a predicate rather than exposing `rollUpKinds`
   *  itself, so `view/capability.ts` can ask the one question it needs without naming the Set's shape. */
  isRollUpKind(kind: EntryKind): boolean {
    return this.rollUpKinds.has(kind);
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
