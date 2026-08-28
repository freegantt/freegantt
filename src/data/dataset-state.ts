// data/ — DatasetState: the live state one Dataset instance owns privately (D-S2-2, OQ5). `api/Dataset`
// is a thin façade that constructs one of these and delegates `entries`/`timeZone`/`dateOnlyEnd` to it —
// the same structural/façade relationship `GanttShell` already has with `Gantt`.

import type {
  ChangeSetId,
  DateOnlyEndRule,
  Dataset,
  DatasetEventMap,
  Entry,
  EntryInput,
  Instant,
} from '../model/index.js';
import { changeSetId } from '../model/index.js';
import { now } from '../time/index.js';
import { EntryStore } from './entry-store.js';
import { readEntries } from './entry-reader.js';
import type { EditExtender } from './edit-extension.js';
import { identityExtender } from './edit-extension.js';
import { EventBus } from './event-bus.js';
import { noRollUp, runTransaction } from './transaction.js';

export interface DatasetStateOptions {
  entries: readonly EntryInput[];
  timeZone: string;
  dateOnlyEnd?: DateOnlyEndRule;
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
   *  only by `runTransaction`. */
  notifying = false;
  /** Rolls up derived spans on every commit (D-S2-22). `noRollUp` until S2.3 lands the real one. */
  rollUp = noRollUp;
  /** Per-instance — never a module-level counter (I2). */
  #changeSetCounter = 0;

  constructor(options: DatasetStateOptions) {
    this.timeZone = options.timeZone;
    this.dateOnlyEnd = options.dateOnlyEnd ?? 'inclusive';
    this.referenceDate = now();
    this.editExtender = options.editExtender ?? identityExtender;
    const entries: readonly Entry[] = readEntries(options.entries, {
      timeZone: this.timeZone,
      dateOnlyEnd: this.dateOnlyEnd,
    });
    this.entries = new EntryStore(entries);
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
}
