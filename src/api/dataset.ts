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
  FieldKey,
  FieldType,
} from '../model/index.js';
import { DatasetState } from '../data/index.js';
import {
  toJSON as writeDocument,
  readDocument,
  warnIfRollUpsWereCorrected,
} from '../data/serialization/index.js';
import type { RollUpKinds } from '../model/index.js';

export interface DatasetOptions<TMeta = unknown> {
  /** What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
   * a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here. */
  entries: readonly EntryInput<TMeta>[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * It is also the zone a Plain (zoneless) date in `entries` resolves through. */
  timeZone: string;
  /** How a date-only `end` such as `'2026-09-08'` is read. Defaults to `'inclusive'`: the entry
   * covers through the 8th. `'exclusive'` reads it literally as the start of the 8th, matching
   * half-open storage exactly. Only date-only strings are affected — see `DateOnlyEndRule`. */
  dateOnlyEnd?: DateOnlyEndRule;
  /** Kinds whose rolling-up Fields the Rollup derives from their children every commit (`01` §2.5/§2.6).
   *  Defaults to `['group']`. `rollUpKinds: 'none'` or `[]` opts every kind out of derivation, which is
   *  the supported way to ask for hand-set values everywhere. */
  rollUpKinds?: RollUpKinds;
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
//
// TMeta is the documented generic (`plans/02` §1.6). TFields is the declared-key map
// (`Dataset<{ team: string }, { cost: number }>`). TypeScript does not infer a later type
// parameter once an earlier one is written, so Field keys cannot come from the `fields` array
// at `new Dataset<{ team: string }>(...)` (#123).
export class Dataset<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>> {
  #state: DatasetState;

  constructor(options: DatasetOptions<TMeta>) {
    this.#state = new DatasetState(options);
  }

  get entries(): EntryStoreContract<TMeta, TFields> {
    return this.#state.entries as EntryStoreContract<TMeta, TFields>;
  }

  get timeZone(): string {
    return this.#state.timeZone;
  }

  get dateOnlyEnd(): DateOnlyEndRule {
    return this.#state.dateOnlyEnd;
  }

  get rollUpKinds(): readonly EntryKind[] {
    return [...this.#state.rollUpKinds];
  }

  /** The resolved Field for this key, or `undefined` when the key is not declared.
   *  Resolution merges the named Field type and fills `source` (an omitted source becomes
   *  `{ from: 'meta', key }` — D-S4-35). This is the declaration, not an Entry value;
   *  `entries.fieldValue` reads the value. */
  field(key: FieldKey): Field | undefined {
    return this.#state.fields.get(key);
  }

  /** Resolved Field declarations this Dataset owns, core Fields included (D-S4-1).
   *  Each item is post type-merge, with `source` filled. */
  get fields(): { readonly all: readonly Field[] } {
    return { all: this.#state.fields.all };
  }

  /** `model/`'s `Dataset` interface (S3, D-S3-9) — `GanttShell` asks this, never `rollUpKinds`
   *  itself, to resolve the per-kind capability default table. */
  isRollUpKind(kind: EntryKind): boolean {
    return this.#state.isRollUpKind(kind);
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
  toJSON(): DatasetDocument<TMeta> {
    return writeDocument(this) as DatasetDocument<TMeta>;
  }

  /** Whole-document read. Constructs a fresh Dataset through the public constructor, so the Rollup
   *  runs on read. The Document carries Field data keys; `options` supplies functions (D-S4-15).
   *  Unknown top-level keys are dropped; `meta` is carried as-is. */
  static fromJSON<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>>(
    doc: DatasetDocument<TMeta>,
    options?: Pick<DatasetOptions, 'fields' | 'fieldTypes' | 'aggregators'>,
  ): Dataset<TMeta, TFields> {
    const dataset = new Dataset<TMeta, TFields>(readDocument(doc, options) as DatasetOptions<TMeta>);
    warnIfRollUpsWereCorrected(doc, dataset);
    return dataset;
  }
}
