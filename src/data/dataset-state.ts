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
  RollUpKinds,
} from '../model/index.js';
import { changeSetId } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { readEntries } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import type { EditExtender } from './edit-extension.js';
import { identityExtender } from './edit-extension.js';
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
}

export class DatasetState implements Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  /** The one `Date.now()` read this Dataset performs, via time/'s `now()` (CONTEXT.md, Reference
   *  date). Fixed for the Dataset's lifetime — not re-derived on every layout pass. Used to
   *  initialize a roll-up-kind entry's zero-length span before the Rollup gives it a real one. */
  readonly referenceDate: Instant;
  readonly editExtender: EditExtender;
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
  /** Resolved once at construction. Promotion reads this; it does not live-reconfigure. */
  readonly hierarchy: DatasetHierarchy;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  readonly computedCache = new ComputedFieldCache();
  /** Bumped on every committed changeset — the computed-field cache key (D-S4-10). */
  #datasetRevision = 0;
  /** Per-instance — never a module-level counter (I2). */
  #changeSetCounter = 0;
  readonly #history: History;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = now();
    this.editExtender = options.editExtender ?? identityExtender;
    this.#rollUpKinds = resolveRollUpKinds(options.rollUpKinds);
    this.hierarchy = resolveHierarchy(options.hierarchy);
    this.fields = new FieldRegistry({
      fields: options.fields ?? [],
      fieldTypes: options.fieldTypes ?? {},
      aggregators: options.aggregators ?? {},
    });
    this.fieldContext = createFieldContext(this.fields, this.timeZone, () => ({
      cache: this.computedCache,
      datasetRevision: this.#datasetRevision,
    }));
    this.#entryContext = {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
      referenceDate: this.referenceDate,
      rollUpKinds: this.#rollUpKinds,
    };
    this.entries = new EntryStore(
      readEntries(options.entries, this.#entryContext),
      this.#entryContext,
      this.fields,
      this.fieldContext,
    );
    this.entries.setTransactionRunner(this);
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
