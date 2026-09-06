// api/ is the only layer a consumer imports (plans/01 §1). This class is the author-facing Dataset:
// construction, `entries.add/update/remove`, `transaction()`, and `on`/`off`. The live store lives
// in `data/` (`DatasetState`). `model/`'s `Dataset` is the smaller bindable surface a Gantt holds.

import type {
  Aggregator,
  ChangeSet,
  DatasetDocument,
  DatasetEventMap,
  DateOnlyEndRule,
  EditRequest,
  StoredEdits,
  EntryInput,
  EntryKind,
  EntryStore as EntryStoreContract,
  Field,
  FieldKey,
  FieldType,
} from '../model/index.js';
import { DatasetState } from '../data/index.js';
import { installDatasetPlugins } from '../extensions/install-dataset-plugins.js';
import { createErrorRaiser } from '../data/error-reporting.js';
import { DisposableStore } from '../extensions/disposables.js';
import { RegistrationGate } from '../extensions/plugin-runtime.js';
import type { DatasetPluginContextOf, DatasetPluginOf } from './dataset-plugin.js';
import {
  toJSON as writeDocument,
  readDocument,
  reportCorrectedRollUps,
} from '../data/serialization/index.js';
import type { DatasetHierarchy, PluginId, RollUpKinds } from '../model/index.js';
import { createZonedTime, resolveDefaultTimeZone } from '../time/index.js';
import type { ZonedTime } from '../time/index.js';
export type { DatasetHierarchy };

// The Dataset-bound aliases behind `api/dataset-plugin.ts`'s generic shapes (the `*Of` pairing
// `api/plugin.ts` and `api/command.ts` already use). A plugin author writing against the concrete
// `Dataset` names these two; code parameterizing over its own Dataset type names the `*Of` forms.
// `TMeta`/`TFields` default here for the same reason `Dataset`'s own do: a plugin that does not care
// about the consumer's meta shape writes `DatasetPlugin` and nothing more.
export type DatasetPlugin<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = DatasetPluginOf<Dataset<TMeta, TFields>>;
export type DatasetPluginContext<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = DatasetPluginContextOf<Dataset<TMeta, TFields>>;

export interface DatasetOptions<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> {
  /** What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
   * a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here. */
  entries: readonly EntryInput<TMeta>[];
  /** IANA timeZone (D6, plans/02 §2) — all zone-aware date arithmetic (day boundaries, snapping,
   * week starts) resolves through it, so two users in different zones see identical day boundaries.
   * It is also the zone a Plain (zoneless) date in `entries` resolves through.
   *
   * Optional (#129). Omit it to author in the current viewer's own zone — resolved once, at
   * construction, from the environment (`Intl`, `'UTC'` if that reports nothing) and then fixed
   * for this Dataset's lifetime, same as an explicit value. Omitting it trades cross-viewer
   * consistency for ergonomics: a Plain date then reads differently for a viewer in a different
   * zone. Pass it explicitly whenever the dataset must render identically for every viewer, such
   * as a shared project plan. */
  timeZone?: string;
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
  /** First-child promotion (D-S4-17). Default is `{ autoGroup: true }`: a `'span'` parent
   *  becomes `'group'` in the same transaction that gives it its first child. Pass
   *  `{ autoGroup: false }` to keep Kind exactly as authored. Promotion never demotes. */
  hierarchy?: DatasetHierarchy;
  /** Undo/redo History. `{ capacity: 200 }` keeps 200 undoable transactions; defaults to 100
   * (`plans/s2-data-core/s2.5-undo-redo.md` §1). */
  history?: { capacity?: number };
  /** Dataset plugins to install (D-S5-24). An unordered set: installation resolves setup order from each
   *  plugin's `requires`, so `[scheduling(), entryDependencies()]` and the reverse install the same
   *  way (D-S5-31). Every plugin sets up during this constructor, so a Field one declares is in the
   *  registry before the first Rollup walks — which is why `Dataset.plugins` is read-only. */
  plugins?: readonly DatasetPluginOf<Dataset<TMeta, TFields>>[];
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
// TMeta/TFields trust boundary (plans/02): the internal store (`DatasetState`, `data/`'s
// `EntryStore`) is permanently monomorphic — it holds `Entry<unknown>` throughout, by design,
// because `data/` has no static dependency on any one consumer's meta shape. `TMeta`/`TFields`
// exist only at this façade; every cast below is where a caller's declared type meets that erased
// internal shape, and none of them are checked at runtime. A wrong `fromJSON<TMeta>()` mis-types
// every entry with no error anywhere — this is the documented loose-input/typed-output trade-off
// (`plans/02`), not a gap to close with a runtime validator.
export class Dataset<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>> {
  #state: DatasetState;
  /** Bound once, at construction — `timeZone` is fixed for this Dataset's lifetime either way. */
  #time: ZonedTime;
  readonly #plugins: readonly DatasetPluginOf<Dataset<TMeta, TFields>>[];

  constructor(options: DatasetOptions<TMeta, TFields>) {
    this.#plugins = options.plugins ?? [];
    this.#state = new DatasetState({
      ...options,
      timeZone: options.timeZone ?? resolveDefaultTimeZone(),
      ...(this.#plugins.length > 0
        ? { installPlugins: (state: DatasetState) => this.#installPlugins(state) }
        : {}),
    });
    this.#time = createZonedTime(this.#state.timeZone);
  }

  /** Runs inside `DatasetState`'s constructor, at the one moment a plugin may set up: the entry store
   *  exists and the construction Rollup has not run (D-S5-4). `this.#state` is not assigned yet, so
   *  every context member below reads `state` — the same instance, one line earlier. */
  #installPlugins(state: DatasetState): () => void {
    return installDatasetPlugins(this.#plugins, createErrorRaiser(state.bus), (pluginId: PluginId) => {
      const disposables = new DisposableStore();
      const gate = new RegistrationGate(pluginId);
      const context: DatasetPluginContextOf<Dataset<TMeta, TFields>> = {
        dataset: this,
        events: {
          on: (name, handler) => state.on(name, handler),
          off: (name, handler) => state.off(name, handler),
        },
        fields: {
          register: (field) => {
            gate.assertOpen();
            // D-S5-33: the registry records `pluginId` as the declarer, and that is what keeps this
            // Field out of the Document. A plugin declares its own Fields again on every install.
            state.fields.register(field, pluginId);
          },
          registerType: (name, type) => {
            gate.assertOpen();
            state.fields.registerType(name, type);
          },
          registerAggregator: (name, fn) => {
            gate.assertOpen();
            state.fields.registerAggregator(name, fn);
          },
        },
        edits: {
          setExtender: (wrap) => {
            gate.assertOpen();
            state.setExtender(wrap);
          },
        },
        store: {
          reserve: <T extends object>() => state.pluginStores.reserve<T>(pluginId),
          read: <T extends object>(otherId: PluginId) => state.pluginStores.read<T>(otherId),
        },
        disposables,
      };
      return { context, disposables, registrationGate: gate };
    });
  }

  /** The plugins this Dataset installed, in the order the caller wrote them. Read-only — see
   *  `DatasetOptions.plugins` for why a Dataset cannot take a new set after construction. */
  get plugins(): readonly DatasetPluginOf<Dataset<TMeta, TFields>>[] {
    return this.#plugins;
  }

  /** Releases every installed plugin, in reverse setup order. A Dataset with no plugins needs no
   *  `destroy()` call — nothing holds a resource. */
  destroy(): void {
    this.#state.destroy();
  }

  // Trusted, unchecked TMeta/TFields cast — see the class-level note above.
  get entries(): EntryStoreContract<TMeta, TFields> {
    return this.#state.entries as EntryStoreContract<TMeta, TFields>;
  }

  get timeZone(): string {
    return this.#state.timeZone;
  }

  /** Zone-aware date math bound to this Dataset's own zone (D-S5-16) — the one way a plugin author
   *  reaches `time/` (the `exports` map seals it against a direct import). Call:
   *  `dataset.time.eachDay(span).filter((day) => dataset.time.dayOfWeek(day) >= 6)`. */
  get time(): ZonedTime {
    return this.#time;
  }

  get dateOnlyEnd(): DateOnlyEndRule {
    return this.#state.dateOnlyEnd;
  }

  get rollUpKinds(): readonly EntryKind[] {
    return [...this.#state.rollUpKinds];
  }

  set rollUpKinds(value: RollUpKinds) {
    this.#state.setRollUpKinds(value);
  }

  /** Call: `dataset.hierarchy = { autoGroup: false }`. Later first-child commits obey this.
   *  Existing `'span'` parents do not promote until they gain a child under `autoGroup: true`. */
  get hierarchy(): DatasetHierarchy {
    return { autoGroup: this.#state.hierarchy.autoGroup };
  }

  set hierarchy(value: DatasetHierarchy) {
    this.#state.setHierarchy(value);
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

  /** Calls the extension hook's current occupant — every installed plugin's wrapper, composed
   *  (D-S5-23), or the identity function when nothing claimed it — and hands back what it wrote.
   *  Expert surface, not an app author's (`plans/02`, "two callers, two surfaces"): a Gantt calls this
   *  to ghost an extender's extra edits during a drag (D-S3-18), and never writes through it. A commit
   *  calls the same occupant again, for real, inside the transaction. A method, not a getter (#209
   *  Q5): the old `editExtender` getter handed over the occupant itself, so a caller that stored its
   *  result instead of re-reading it live would ghost a plugin composed on after (#186). */
  extraEditsFor(request: EditRequest): StoredEdits {
    return this.#state.extraEditsFor(request);
  }

  /** Call: `layout.computeFrame({ datasetRevision: dataset.datasetRevision })`. */
  get datasetRevision(): number {
    return this.#state.datasetRevision;
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
  // Trusted, unchecked TMeta cast — see the class-level note above.
  toJSON(): DatasetDocument<TMeta> {
    // `DatasetState`, not `this`: the writer reads the plugin stores, which are library internals and
    // have no place on the public façade (D-S5-24).
    return writeDocument(this.#state) as DatasetDocument<TMeta>;
  }

  /** Whole-document read. Constructs a fresh Dataset through the public constructor, so the Rollup
   *  runs on read. The Document carries Field data keys; `options` supplies functions (D-S4-15).
   *  Unknown top-level keys are dropped; `meta` is carried as-is.
   *
   *  `plugins` is supplied the same way and for the same reason: a Document stores a plugin's rows,
   *  never its behaviour, so an application that reads a document back re-installs the same plugin
   *  list it constructed with. Rows of a plugin this list omits are kept and written back untouched
   *  (D-S5-24). */
  static fromJSON<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>>(
    doc: DatasetDocument<TMeta>,
    options?: Pick<DatasetOptions<TMeta, TFields>, 'fields' | 'fieldTypes' | 'aggregators' | 'plugins'>,
  ): Dataset<TMeta, TFields> {
    // Trusted, unchecked TMeta cast — see the class-level note above. Narrowed to `entries`, the
    // one field `readDocument`'s result actually needs it for: every other DatasetOptions member
    // `readDocument` returns is already TMeta-independent.
    const read = readDocument(doc, options);
    const dataset = new Dataset<TMeta, TFields>({
      ...read,
      entries: read.entries as readonly EntryInput<TMeta>[],
      ...(options?.plugins !== undefined ? { plugins: options.plugins } : {}),
    });
    reportCorrectedRollUps(doc, dataset, createErrorRaiser(dataset.#state.bus));
    return dataset;
  }
}
