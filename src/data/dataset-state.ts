// data/ — DatasetState: the live state one Dataset instance owns privately (D-S2-2, OQ5). `api/Dataset`
// is a thin façade that constructs one of these and delegates `entries`/`timeZone`/`dateOnlyEnd` to it —
// the same structural/façade relationship `GanttShell` already has with `Gantt`.

import type {
  ChangeSet,
  ChangeSetId,
  DateOnlyEndRule,
  Dataset,
  DatasetEventMap,
  EntryInput,
  EntryKind,
  Instant,
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

export type { HistoryOptions };

export interface DatasetStateOptions {
  entries: readonly EntryInput[];
  timeZone: string;
  dateOnlyEnd?: DateOnlyEndRule;
  /** Undo/redo capacity (`plans/s2-data-core/s2.5-undo-redo.md` §1). Defaults to a 100-entry history —
   *  `history: { capacity: 0 }` is not a supported way to disable it; construct without `data/history.ts`
   *  for that (D-S2-23), which S2 has no consumer-facing option for yet. */
  history?: HistoryOptions;
  /** Kinds whose span the rollup derives from their children's spans, min start/max end, every
   *  commit (`01` §2.5/§2.6). Defaults to `['group']`. `derivedSpanKinds: []` opts every kind out —
   *  the supported way to ask for hand-set spans everywhere (S2.3 §1.5). */
  derivedSpanKinds?: readonly EntryKind[];
  /** The extension hook a transaction calls once per commit (D-S2-6). Internal only — `data/` is
   *  unreachable through the package's `exports` map, so a plugin-facing install API is S3's own job
   *  (#15), not this option. Defaults to `identityExtender`: an unoccupied hook is the identity
   *  function (D4). */
  editExtender?: EditExtender;
}

export class DatasetState implements Dataset {
  readonly entries: EntryStore;
  readonly timeZone: string;
  readonly dateOnlyEnd: DateOnlyEndRule;
  /** The one `Date.now()` read this Dataset performs, via time/'s `now()` (CONTEXT.md, Reference
   *  date). Fixed for the Dataset's lifetime — not re-derived on every layout pass. Used to
   *  initialize a derived-span-kind entry's zero-length span before the S2.2 rollup gives it a
   *  real one. */
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
  /** Kinds whose span the rollup derives from their children (`01` §2.5). Set once, at construction —
   *  live-reconfiguring which kinds derive is not part of S2. Read by `data/transaction.ts`'s commit
   *  step, the only file allowed to import the rollup itself (`span-rollup-is-removable`, D-S2-23) —
   *  this class hands over the *kinds*, never the function. */
  readonly derivedSpanKinds: ReadonlySet<EntryKind>;
  /** Per-instance — never a module-level counter (I2). */
  #changeSetCounter = 0;
  readonly #history: History;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = now();
    this.editExtender = options.editExtender ?? identityExtender;
    this.derivedSpanKinds = new Set(options.derivedSpanKinds ?? ['group']);
    const context: EntryReadContext = {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
      referenceDate: this.referenceDate,
      derivedSpanKinds: this.derivedSpanKinds,
    };
    this.entries = new EntryStore(readEntries(options.entries, context), context);
    this.entries.setTransactionRunner(this);
    // `01` §2.6 / README.md D-S2-22: a deriving-kind entry given children only through the initial
    // array gets a real span before anyone reads it, not just after the first later transaction
    // touches one of those children. `fromJSON` gets this for free, being construction like any other.
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

  /** Batches `body`'s mutations into one `ChangeSet` (D-S2-8). `'user'` is the only origin a public
   *  caller can produce in S2 — `interaction/` gets an option once it has a gesture to tag (S4). */
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
