// api/ is the only layer a consumer imports (plans/01 §1). This class is the author-facing Dataset:
// construction, `entries.add/update/remove`, `transaction()`, and `on`/`off`. The live store lives
// in `data/` (`DatasetState`). `model/`'s `Dataset` is the smaller bindable surface a Gantt holds.

import type {
  Aggregator,
  ChangeSet,
  DatasetDocument,
  DatasetEventMap,
  DateOnlyEndRule,
  EntryInput,
  EntryKind,
  EntryStore as EntryStoreContract,
  Field,
  FieldType,
} from '../model/index.js';
import { DatasetState } from '../data/index.js';
import {
  toJSON as writeDocument,
  readDocument,
  warnIfDerivedSpansWereCorrected,
} from '../data/serialization/index.js';

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
  /** Consumer Field declarations. Core Fields are already in the registry (D-S4-4). */
  fields?: readonly Field[];
  /** Named Field type bundles. A Field's own keys win over the bundle (D-S4-3). */
  fieldTypes?: Readonly<Record<string, FieldType>>;
  /** Consumer Aggregators by name. Shipped names (`min`, `sum`, …) are already registered. */
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** Undo/redo History. `{ capacity: 200 }` keeps 200 undoable transactions; defaults to 100
   * (`plans/s2-data-core/s2.5-undo-redo.md` §1). */
  history?: { capacity?: number };
}

// Structurally satisfies model/'s `Dataset` (entries/timeZone/on/off) without an `implements` clause —
// that clause would pull the model type into the public API report as an unexported `Dataset_2`, since
// api-extractor inlines whatever an exported class's `implements`/`extends` names. Assignability where
// it actually matters (`GanttOptions.dataset`, `GanttShell`) is still checked structurally.
export class Dataset {
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

  /** Resolved Field declarations this Dataset owns, core Fields included (D-S4-1). */
  get fields(): { readonly all: readonly Field[]; get(key: string): Field | undefined } {
    return this.#state.fields;
  }

  /** `model/`'s `Dataset` interface (S3, D-S3-9) — `GanttShell` asks this, never `derivedSpanKinds`
   *  itself, to resolve the per-kind capability default table. */
  isDerivedSpanKind(kind: EntryKind): boolean {
    return this.#state.isDerivedSpanKind(kind);
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

  /** Applies an already-complete `ChangeSet` exactly as given — no extension hook, no rollup
   *  (`plans/s2-data-core/s2b-undo-replay-seam.md`). `changeSet.origin` must be `'undo'` or `'redo'`;
   *  `'user'` throws `InvalidReplayOriginError` — that door is `apply`, later (D-S2-11). An empty
   *  changeset is a no-op: no event, no throw. `beforeChange` then `change` still fire, and a veto
   *  throws `MutationCancelledError` and writes nothing. This is the write path `undo()`/`redo()` use;
   *  a consumer History can now be written against this method alone, plus `invertChangeSet` and
   *  `on('change')`. */
  replay(changeSet: ChangeSet): void {
    this.#state.replay(changeSet);
  }

  /** Whole-document write (D-S2-12). Byte-stable: declared key order, optional keys omitted, entries
   *  in insertion order, instants as `Z`-suffixed ISO. */
  toJSON(): DatasetDocument {
    return writeDocument(this);
  }

  /** Whole-document read. Constructs a fresh Dataset through the public constructor, so the span
   *  rollup runs on read. Unknown top-level keys are dropped; `meta` is carried as-is. */
  static fromJSON(doc: DatasetDocument): Dataset {
    const dataset = new Dataset(readDocument(doc));
    warnIfDerivedSpansWereCorrected(doc, dataset);
    return dataset;
  }
}
