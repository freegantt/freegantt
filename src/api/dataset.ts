// api/ is the only layer a consumer imports (plans/01 §1). This class is the author-facing Dataset:
// construction, `entries.add/update/remove`, `transaction()`, and `on`/`off`. The live store lives
// in `data/` (`DatasetState`). `model/`'s `Dataset` is the smaller bindable surface a Gantt holds.

import type {
  Dataset as DatasetContract,
  DatasetEventMap,
  DateOnlyEndRule,
  EntryInput,
  EntryKind,
  EntryStore as EntryStoreContract,
} from '../model/index.js';
import type { HistoryOptions } from '../data/index.js';
import { DatasetState } from '../data/index.js';

export interface DatasetOptions {
  /** What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
   * a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here. */
  entries: readonly EntryInput[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * It is also the zone a Plain (zoneless) date in `entries` resolves through. */
  timeZone: string;
  /** How a date-only `end` such as `'2026-09-08'` is read. Defaults to `'inclusive'`: the entry
   * covers through the 8th. `'exclusive'` reads it literally as the start of the 8th, matching
   * half-open storage exactly. Only date-only strings are affected — see `DateOnlyEndRule`. */
  dateOnlyEnd?: DateOnlyEndRule;
  /** Kinds whose span the rollup derives from their children's spans — min start, max end — every
   * commit (`01` §2.5/§2.6). Defaults to `['group']`. `derivedSpanKinds: []` opts every kind out of
   * derivation, which is the supported way to ask for hand-set spans everywhere. */
  derivedSpanKinds?: readonly EntryKind[];
  /** Undo/redo history. `{ capacity: 200 }` keeps 200 undoable transactions; defaults to 100
   * (`plans/s2-data-core/s2.5-undo-redo.md` §1). */
  history?: HistoryOptions;
}

export class Dataset implements DatasetContract {
  #state: DatasetState;

  constructor(options: DatasetOptions) {
    this.#state = new DatasetState(options);
  }

  get entries(): EntryStoreContract {
    return this.#state.entries;
  }

  get timeZone(): string {
    return this.#state.timeZone;
  }

  get dateOnlyEnd(): DateOnlyEndRule {
    return this.#state.dateOnlyEnd;
  }

  get derivedSpanKinds(): readonly EntryKind[] {
    return [...this.#state.derivedSpanKinds];
  }

  /** Batches `body`'s mutations into one changeset (D-S2-8). Nested calls join the open transaction.
   *  `'user'` is the only origin a public caller can produce in S2. */
  transaction<T>(body: () => T): T {
    return this.#state.transaction(body);
  }

  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void {
    this.#state.on(name, handler);
  }

  off<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): void {
    this.#state.off(name, handler);
  }

  /** `true` while there is a committed changeset `undo()` can reverse. */
  get canUndo(): boolean {
    return this.#state.canUndo;
  }

  /** `true` while there is an undone changeset `redo()` can re-apply. */
  get canRedo(): boolean {
    return this.#state.canRedo;
  }

  /** Reverts the most recent undoable changeset (`plans/s2-data-core/s2.5-undo-redo.md` §1). A no-op
   *  when `canUndo` is `false`. What it did arrives on `on('change')`, like every other commit — a
   *  refused undo throws `MutationCancelledError` and leaves the history exactly where it was. */
  undo(): void {
    this.#state.undo();
  }

  /** Re-applies the most recently undone changeset. A no-op when `canRedo` is `false`. */
  redo(): void {
    this.#state.redo();
  }
}
