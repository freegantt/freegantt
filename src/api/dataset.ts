// api/ is the only layer a consumer imports (plans/01 §1). This class is the author-facing Dataset:
// construction, `entries.add/update/remove`, `transaction()`, and `on`/`off`. The live store lives
// in `data/` (`DatasetState`). `model/`'s `Dataset` is the smaller bindable surface a Gantt holds.

import type {
  Aggregator,
  ChangeSet,
  DatasetEventMap,
  DateOnlyEndRule,
  Disposer,
  DurationMeasure,
  EntryId,
  ProposedEdits,
  FlatEntryInput,
  EntryStore as EntryStoreContract,
  Field,
  FieldEditable,
  FieldKey,
  FieldType,
  PluginStoreView,
  ReplayOptions,
} from '../model/index.js';
import { DatasetState } from '../data/index.js';
import type { FieldDeclarationSource } from '../data/index.js';
import { createEditRequest } from '../data/edit-request.js';
import { installDatasetPlugins } from '../extensions/install-dataset-plugins.js';
import { assertNoDuplicateIds, resolveSetupOrder } from '../extensions/plugin-order.js';
import { createErrorRaiser } from '../data/error-reporting.js';
import { DisposableStore } from '../extensions/disposables.js';
import { RegistrationGate } from '../extensions/plugin-runtime.js';
import type { DatasetPluginContextOf } from './dataset-plugin.js';
import type { PluginOf } from './plugin.js';
import type { HierarchySourceWrapper, PluginId } from '../model/index.js';
import { createZonedTime, resolveDefaultTimeZone } from '../time/index.js';
import type { ZonedTime } from '../time/index.js';

// I2-ok: keyed by Dataset instance (ADR 0007); one Dataset's state never reaches another's.
// Friend-only state for `extraEditsFor` below — `Dataset` genuinely has no such method, because it
// was never a method (#250 A2). Populated once, in the constructor, so a Dataset instance always
// has its state by the time `extraEditsFor` can see it. Keyed on `object`, not `Dataset<TProps>`: a
// `WeakMap` key type does not vary with a generic parameter, and every value this map ever holds a
// key for is a `Dataset` regardless.
const datasetState = new WeakMap<object, DatasetState>();

// The Dataset-bound alias behind `api/dataset-plugin.ts`'s generic shape (the `*Of` pairing
// `api/plugin-context.ts` and `api/command.ts` already use). A plugin author writing against the concrete
// `Dataset` names this one; code parameterizing over its own Dataset type names the `*Of` form.
// `TProps` defaults here for the same reason `Dataset`'s own does: it names the plugin's own keys,
// not the consumer's — a plugin that declares no Field of its own writes `DatasetPluginContext` and
// nothing more.
//
// ADR 0019: the three plugin aliases — `ChromePlugin`, `DataPlugin`, `Plugin` — bind on `api/gantt.ts`
// instead, because a `view` half names the `Gantt` class and this file may not import it (that
// direction is already taken, and `no-circular` reads a type-only edge as a real one).
export type DatasetPluginContext<TProps = unknown> = DatasetPluginContextOf<Dataset<TProps>>;

export interface DatasetOptions<TProps = unknown> {
  /** What the consumer writes. Ids are plain strings and dates are any `InstantInput` — an ISO string,
   * a `Date`, epoch milliseconds, or an already-branded `Instant`. Read into `Entry` once, here.
   *
   * A declared Field key sits flat, at the top level, the same shape `add()`/`update()` take (ADR
   * 0011, Q15); a nested `props` stays legal for passenger keys and for a bag already held. Typed as
   * `FlatEntryInput<TProps>` (#281) — see `model/dataset.ts`'s `EntryStore.add` for why plain
   * `EntryInput<TProps>` did not type-check the flat key, and why the `& Partial<TProps>`
   * intersection Q15's wording first suggested was uninhabitable. */
  entries: readonly FlatEntryInput<TProps>[];
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
  /** Consumer Field declarations. Core Fields are already in the registry (D-S4-4). */
  fields?: readonly Field[];
  /** Named Field type bundles. A Field's own keys win over the bundle (D-S4-3). */
  fieldTypes?: Readonly<Record<string, FieldType>>;
  /** Consumer Aggregators by name. Shipped names (`min`, `sum`, …) are already registered. */
  aggregators?: Readonly<Record<string, Aggregator>>;
  /** How core measures a duration (ADR 0017, Q6/J12). `'span'` is `end - start`, and it counts a gap
   *  between children; `'children'` sums the children's own durations and counts no gap. Defaults to
   *  `'span'`.
   *  `entry.duration()`, `ctx.duration()` and the core `duration` Field all read it. It sits on the
   *  Dataset and not on a Field: two Fields on one Dataset must not disagree about what a duration
   *  is. */
  measureDuration?: DurationMeasure;
  /** Undo/redo History. `{ capacity: 200 }` keeps 200 undoable transactions; defaults to 100
   * (`plans/s2-data-core/s2.5-undo-redo.md` §1). `entries.sync()` records no step of its own
   * (`docs/11-server-data.md`), so a frequent poll never eats into this headroom.
   *
   * `false` builds no History: the app owns undo and writes each step back with `replay()`.
   * `canUndo` and `canRedo` then always read `false`, `undo()` and `redo()` do nothing, and the
   * Gantt's own Undo and Redo commands turn off, so the app can bind Mod+Z to its own undo. */
  history?: false | { capacity?: number };
  /** The plugins this Dataset installs (D-S5-24, ADR 0019). An unordered set: installation resolves
   *  setup order from each plugin's `requires`, so `[scheduling(), entryDependencies()]` and the
   *  reverse install the same way (D-S5-31).
   *
   *  A plugin's `fields`/`fieldTypes`/`hierarchySource` declare this Dataset's shape; `data()` itself
   *  runs only once that whole Dataset — the construction Rollup included — is built (ADR 0031). This
   *  declared shape cannot change after construction, which is why `Dataset.plugins` is read-only. A
   *  plugin that also fills a `view` half has that half run once per `Gantt` bound to this Dataset, each
   *  with its own context (I2). A chrome-only plugin is legal here too, and then every Gantt on this
   *  Dataset gets it; install it on one `Gantt` instead to give it to that Gantt alone.
   *
   *  This Dataset holds each plugin with its own props erased (`PluginOf<unknown, unknown>`): a
   *  plugin's type argument names its own keys, not this Dataset's `TProps`, so a `Dataset<TaskProps>`
   *  installs a `DataPlugin<LockProps>` whatever `TaskProps` and `LockProps` are. The Dataset still
   *  hands itself to that plugin's `data(ctx)` typed as `Dataset<LockProps>` — `ctx.dataset` is the
   *  plugin's own view onto the same trust boundary the class note above describes. It sees the
   *  plugin's own key set, independent of this Dataset's own `TProps`. */
  plugins?: readonly PluginOf<unknown, unknown>[];
}

/** One `FieldRegistryOptions`-shaped entry per plugin, `fields`/`fieldTypes`/`aggregators` read off
 *  the plugin object itself (#496 grill round 3, R1) — `DatasetState`'s constructor merges these with
 *  the Dataset's own before `entries` is read. Both `PluginOf` arms declare the three keys now
 *  (`ChromePluginOf`'s own `never` guard, `api/plugin.ts`), so `'…' in plugin` here is a plain
 *  existence check, not a union narrow — a chrome-only plugin's three keys are always `undefined`. */
function pluginFieldDeclarationsOf(
  plugins: readonly PluginOf<unknown, unknown>[],
): readonly FieldDeclarationSource[] {
  return plugins.map((plugin) => ({
    fields: 'fields' in plugin ? plugin.fields : undefined,
    fieldTypes: 'fieldTypes' in plugin ? plugin.fieldTypes : undefined,
    aggregators: 'aggregators' in plugin ? plugin.aggregators : undefined,
  }));
}

/** Every installed plugin's declared `hierarchySource`, in setup order (`resolveSetupOrder`,
 *  ADR 0031) — `DatasetState`'s constructor folds these onto `storedParentSource` before
 *  `entries` is built. Setup order, not install order: `[b, a]` with `b.requires = ['a']` folds `a`
 *  first, the same order `data()` runs its own registrations in.
 *
 *  Trusted, unchecked `TProps` cast — the same trust boundary the class note above describes. Each
 *  plugin's own `P` erases to the one shape `data/` holds; `TProps` types the plugin author's own
 *  `entry.props` read and reaches no further. */
function hierarchySourceWrappersOf(
  plugins: readonly PluginOf<unknown, unknown>[],
): readonly HierarchySourceWrapper[] {
  const wrappers: HierarchySourceWrapper[] = [];
  for (const plugin of resolveSetupOrder(plugins)) {
    const hierarchySource = 'hierarchySource' in plugin ? plugin.hierarchySource : undefined;
    if (hierarchySource !== undefined) wrappers.push(hierarchySource);
  }
  return wrappers;
}

// Structurally satisfies model/'s `Dataset` (entries/timeZone/on/off) without an `implements` clause —
// that clause would pull the model type into the public API report as an unexported `Dataset_2`, since
// api-extractor inlines whatever an exported class's `implements`/`extends` names. Assignability where
// it actually matters (`GanttOptions.dataset`, `GanttShell`) is still checked structurally.
//
// TProps is the documented generic (`plans/02` §1.6, ADR 0011) — it types both `entry.props` and the
// declared-key map `entry.read` resolves against; TypeScript does not infer a later type
// parameter once an earlier one is written, so a plugin generic cannot join it without breaking
// inference on this one (#123).
// TProps trust boundary (plans/02): the internal store (`DatasetState`, `data/`'s `EntryStore`) is
// permanently monomorphic — it holds `Entry<unknown>` throughout, by design, because `data/` has no
// static dependency on any one consumer's `props` shape. `TProps` exists only at this façade; every
// cast below is where a caller's declared type meets that erased internal shape, and none of them are
// checked at runtime. A wrong `TProps` mis-types every entry `dataset.entries` reads back, with no
// error anywhere — this is the documented loose-input/typed-output trade-off (`plans/02`), not a gap
// to close with a runtime validator.
export class Dataset<TProps = unknown> {
  #state: DatasetState;
  /** Bound once, at construction — `timeZone` is fixed for this Dataset's lifetime either way. */
  #time: ZonedTime;
  readonly #plugins: readonly PluginOf<unknown, unknown>[];
  readonly #disposePlugins: () => void;

  constructor(options: DatasetOptions<TProps>) {
    this.#plugins = options.plugins ?? [];
    // Checked before a plugin's Field declarations are merged (#496 grill round 3, R1): that merge
    // throws `DuplicateFieldKeyError` on a repeated Field key, and two plugins sharing an id often
    // share their Field keys too (the same factory, called twice) — so a duplicate id has to be
    // caught here, first, to keep its own documented error (`docs/06-plugin-authoring.md`).
    // `installDatasetPlugins` below asserts this again at its own install site (D-S5-3); this earlier
    // check exists only to win that race.
    assertNoDuplicateIds(this.#plugins);
    // Declares this Dataset's whole shape — every Field, fieldType, Aggregator and hierarchy source
    // any plugin brings — so the Dataset below builds completely, Rollup included, before a single
    // plugin's `data()` runs (ADR 0031). `data/` never runs plugin code itself.
    this.#state = new DatasetState({
      ...options,
      timeZone: options.timeZone ?? resolveDefaultTimeZone(),
      pluginFieldDeclarations: pluginFieldDeclarationsOf(this.#plugins),
      hierarchySourceWrappers: hierarchySourceWrappersOf(this.#plugins),
    });
    this.#time = createZonedTime(this.#state.timeZone);
    datasetState.set(this, this.#state);
    // Every plugin's `data()` runs here, on the finished Dataset above — `ctx.dataset.*` all read
    // (ADR 0031). A setup write is an ordinary commit, so History records it like any other;
    // `clearHistory()` right after empties that stack, so `canUndo` still reads `false` once this
    // constructor returns (#137).
    this.#disposePlugins = this.#installPlugins();
    this.#state.clearHistory();
  }

  /** Runs after `this.#state` is assigned, so every context member below reads `this.#state`
   *  straight — no closed-over `state` parameter left from before the Dataset existed. */
  #installPlugins(): () => void {
    return installDatasetPlugins(this.#plugins, createErrorRaiser(this.#state.bus), (pluginId: PluginId) => {
      const disposables = new DisposableStore();
      const gate = new RegistrationGate(pluginId);
      const context: DatasetPluginContextOf<Dataset<TProps>> = {
        dataset: this,
        events: {
          on: (name, handler) => {
            const dispose = this.#state.on(name, handler);
            disposables.add(dispose);
            return dispose;
          },
          off: (name, handler) => this.#state.off(name, handler),
        },
        edits: {
          setExtender: (wrap) => {
            gate.assertOpen();
            this.#state.setExtender(wrap);
          },
          setLockRule: (wrap) => {
            gate.assertOpen();
            this.#state.setLockRule(wrap);
          },
        },
        store: {
          reserve: <T extends object>() => this.#state.pluginStores.reserve<T>(pluginId),
          read: <T extends object>(otherId: PluginId) => this.#state.pluginStores.read<T>(otherId),
        },
        disposables,
      };
      return { context, disposables, registrationGate: gate };
    });
  }

  /** The plugins this Dataset installed, in the order the caller wrote them. Read-only — see
   *  `DatasetOptions.plugins` for why a Dataset cannot take a new set after construction. Each
   *  plugin's own props stay erased here (`DatasetOptions.plugins`); the entry itself is unaffected. */
  get plugins(): readonly PluginOf<unknown, unknown>[] {
    return this.#plugins;
  }

  /** Releases every installed `data` half, in reverse setup order. A Dataset with no plugins needs no
   *  `destroy()` call — nothing holds a resource. */
  destroy(): void {
    this.#disposePlugins();
  }

  // Trusted, unchecked TProps cast — see the class-level note above.
  get entries(): EntryStoreContract<TProps> {
    return this.#state.entries as EntryStoreContract<TProps>;
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

  /** The resolved Field for this key, or `undefined` when the key is not declared. This is the
   *  declaration, not an Entry value; `entry.read(key)` reads the value. */
  field(key: FieldKey): Field | undefined {
    return this.#state.fields.get(key);
  }

  /** Resolved Field declarations this Dataset owns, core Fields included (D-S4-1), each after its
   *  named `type` bundle merges in. */
  get fields(): { readonly all: readonly Field[] } {
    return { all: this.#state.fields.all };
  }

  /** Call: `dataset.setFieldEditable('start', 'never')` — "set Field start editable to never."
   *
   *  The Field *set* is fixed after construction; this one attribute is not (ADR 0015). It changes a
   *  Field the Dataset already declares and adds none, so an unknown key throws `UnknownFieldError`.
   *  `true` and `false` still alias `'anywhere'` and `'never'`.
   *
   *  Which Entry a value is writable *on* is `gantt.capabilities.edit`, per row. This key states
   *  which values are writable at all. */
  setFieldEditable(key: FieldKey, editable: FieldEditable | boolean): void {
    this.#state.fields.setEditable(key, editable);
  }

  /** Call: `dataset.editableOf('van-1', 'cost')` — the effective lock on one cell (#473): a plugin's
   *  own per-entry lock rule's answer, or the Field's own `editable` when the rule has no opinion.
   *  The same resolver `entries.update()`, an `EditExtender` cascade, and the grid all read (I14). An
   *  undeclared key answers `'never'`: nothing is written to a key nothing declares. */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable {
    return this.#state.editableOf(id, field);
  }

  /** A counter that rises once per committed change. Call: `if (dataset.datasetRevision !== seen)`
   *  — read it to answer "has anything changed since I last looked?" without diffing entries.
   *
   *  A consumer reads this and never passes it anywhere. The library keeps its own caches fresh
   *  from it internally, so nothing an app author writes has to carry it. */
  get datasetRevision(): number {
    return this.#state.datasetRevision;
  }

  /** Batches `body`'s mutations into one changeset (D-S2-8). Nested calls join the open transaction.
   *  `'user'` is the only origin a call to `transaction()` can produce — `entries.load()` and
   *  `entries.sync()` refuse to run inside one, since each is always its own transaction. */
  transaction<T>(body: () => T): T {
    return this.#state.transaction(body);
  }

  /** Every plugin registration seam returns a `Disposer` that removes exactly its own registration
   *  (I2); `on` is that seam for a Dataset event. `off(name, handler)` still works too. */
  on<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): Disposer {
    return this.#state.on(name, handler);
  }

  off<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): void {
    this.#state.off(name, handler);
  }

  /** `true` while there is a committed changeset `undo()` can reverse. Always `false` under
   *  `history: false`. */
  get canUndo(): boolean {
    return this.#state.canUndo;
  }

  /** `true` while there is an undone changeset `redo()` can re-apply. Always `false` under
   *  `history: false`. */
  get canRedo(): boolean {
    return this.#state.canRedo;
  }

  /** Reverts the most recent undoable changeset (`plans/s2-data-core/s2.5-undo-redo.md` §1). A no-op
   *  when `canUndo` is `false`. A write arrives on `on('change')`, like every other commit — a
   *  refused undo throws `MutationCancelledError` and leaves the history exactly where it was.
   *
   *  Writes onto the store's current values, not blind. An entry a sync changed since this step was
   *  recorded keeps the sync's values, and a step left with nothing to write is skipped in favor of
   *  the one before it, in this same call (`docs/11-server-data.md`). A click that only forgets steps
   *  writes nothing, so it fires `historyChange` and not `change`. Undo chrome listens on
   *  `on('historyChange')`. */
  undo(): void {
    this.#state.undo();
  }

  /** Re-applies the most recently undone changeset. A no-op when `canRedo` is `false`. A write
   *  arrives on `on('change')`. A click that only forgets steps fires `historyChange` and not
   *  `change`, the same as `undo()`. Undoing this redo writes back exactly what this call wrote —
   *  undo then redo is neutral, even across a sync in between. */
  redo(): void {
    this.#state.redo();
  }

  /** Writes `changeSet` onto the store's current values, not blind
   *  (`plans/s2-data-core/s2b-undo-replay-seam.md`, amended for local-only undo across a sync). A row
   *  for an id or a Field a sync has already settled writes nothing for it; the rest of the changeset
   *  still lands. A row for a key no Field declares writes nothing. An entry a foreign write changed
   *  since the step recorded it keeps its current values, unless `options.overwriteForeignWrites` is `true` (#549). No extension hook. It
   *  re-rolls every parent it touches, construction shape; with no foreign write in between, the
   *  Rollup writes nothing. `changeSet.origin` must be `'undo'` or
   *  `'redo'`; `'user'` throws `InvalidReplayOriginError` — that door is `apply`, not open yet. When
   *  nothing is left to write, this is a no-op: no `beforeChange`, no `change`. Otherwise `beforeChange`
   *  then `change` fire, and a veto throws `MutationCancelledError` and writes nothing. This is the
   *  write path `undo()`/`redo()` use; a consumer History can now be written against this method alone,
   *  plus `invertChangeSet` and `on('change')`. */
  replay(changeSet: ChangeSet, options?: ReplayOptions): void {
    this.#state.replay(changeSet, options);
  }

  /** Call: `dataset.pluginStore('acme/locks')` — one plugin's rows, read-only, or `undefined` when
   *  that plugin never reserved a store. `dataset.pluginStore()` with no argument answers every store
   *  this Dataset holds, as a record keyed by plugin id: `Object.entries(dataset.pluginStore())`.
   *
   *  A plugin's own data is not on this Dataset until that plugin installs and reserves a store — no
   *  door takes rows in ahead of that (ADR 0016). An application that must keep a plugin's data saves
   *  it by reading this, and restores it through the plugin's own API after re-installing the plugin. */
  pluginStore<T extends object>(pluginId: PluginId): PluginStoreView<T> | undefined;
  pluginStore(): Readonly<Record<PluginId, PluginStoreView<object>>>;
  pluginStore<T extends object>(
    pluginId?: PluginId,
  ): PluginStoreView<T> | Readonly<Record<PluginId, PluginStoreView<object>>> | undefined {
    if (pluginId === undefined) return this.#state.pluginStores.readAll();
    return this.#state.pluginStores.read<T>(pluginId);
  }
}

/** Calls the extension hook's current occupant for this `dataset` — every installed plugin's
 *  wrapper, composed (D-S5-23), or the identity function when nothing claimed it — and hands back
 *  what it wrote. Not a `Dataset` method (#250 A2, ADR 0007): a Gantt calls this to ghost an
 *  extender's extra edits during a drag (D-S3-18) and never writes through it; a commit calls the
 *  same occupant again, for real, inside the transaction. `api/gantt.ts` is the one caller — an app
 *  author never proposes an `EditRequest`, so a method here would have no honest caller outside it.
 *  Exported from `api/` only, never from `api/index.ts`.
 *
 *  Takes the draft, and builds the `EditRequest` here (#466) — `view/`'s `GesturePipelineDeps` and
 *  `GanttShellOptions` both narrowed to this same shape, because `GanttShell` binds to `model/`'s
 *  narrow `Dataset`, which carries no `hierarchySource`/`committedChildIds`/`fields` to build one
 *  with. This function reaches the full `DatasetState` through the friend map above, so it is where
 *  the request gets built — the one place `data/edit-request.ts`'s `createEditRequest` is called for
 *  the preview path, mirroring `build-commit-change-set.ts`'s call on the commit path. */
export function extraEditsFor<TProps>(dataset: Dataset<TProps>, draft: ProposedEdits): ProposedEdits {
  const state = datasetState.get(dataset);
  if (!state) {
    throw new Error('extraEditsFor: dataset was not constructed through the Dataset constructor');
  }
  return state.extraEditsFor(
    createEditRequest({
      entries: state.entries.committedById(),
      proposed: draft,
      added: [],
      removed: [],
      hierarchySource: state.hierarchySource,
      committedChildIds: state.entries.committedChildIds(),
      fields: state.fields,
      lockRule: state.lockRule,
    }),
  );
}
