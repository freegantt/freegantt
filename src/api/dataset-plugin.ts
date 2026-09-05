// api/ — the public Dataset-plugin contract (S5.10, D-S5-23/24/30/31). `DatasetPluginOf`/
// `DatasetPluginContextOf` stay generic over `TDataset` here, so this file never imports `./dataset.js`
// for the concrete `Dataset` class — `api/dataset.ts` already imports this file for the generic shape,
// and dependency-cruiser's `no-circular` rule treats a type-only edge the same as a runtime one.
// `api/dataset.ts` binds the type argument once — `export type DatasetPlugin = DatasetPluginOf<Dataset>`
// — and `api/index.ts` re-exports both. `api/plugin.ts` and `api/command.ts` use the same pairing.
//
// A Gantt plugin and a Dataset plugin are different contracts on purpose. A Gantt plugin sees panes,
// the overlay and gestures; a Dataset plugin sees only what a document holds, so it stays DOM-free and
// runs wherever a Dataset runs.

import type {
  Aggregator,
  AggregatorName,
  DatasetEventMap,
  Disposer,
  ExtenderWrapper,
  Field,
  FieldType,
  FieldTypeName,
  PluginId,
  PluginStore,
  PluginStoreView,
} from '../model/index.js';
import type { DisposableStore } from '../extensions/disposables.js';

// Re-exported so a plugin author names the store types from the same module as the contract that
// hands them over, rather than hunting for the module they are declared in.
export type { PluginStore, PluginStoreView, ExtenderWrapper };

/** `beforeChange`/`change`, the two events a Dataset raises (D-S2-5, D-S2-25). Returning `false` from a
 *  `beforeChange` handler vetoes the whole changeset — the refusal path a lock plugin uses (D-S5-24). */
export interface DatasetEvents {
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}

/** Field declarations a plugin adds to the Dataset it installs into (D-S5-21). Legal while `setup()`
 *  runs and not after — a later call throws `RegistrationClosedError` (D-S5-4). */
export interface DatasetFieldRegistrations {
  register(field: Field): void;
  registerType(name: FieldTypeName, type: FieldType): void;
  registerAggregator(name: AggregatorName, fn: Aggregator): void;
}

/** The extension hook, as a plugin claims it (D-S5-23). Installing composes: the wrapper receives the
 *  current occupant, so a second plugin adds to the first's cascade instead of evicting it. */
export interface DatasetEditHook {
  setExtender(wrap: ExtenderWrapper): void;
}

/** This plugin's own store, plus a read-only view of anybody else's (D-S5-24, D-S5-30). */
export interface DatasetStoreAccess {
  /** This plugin's own reserved store, namespaced by its id. Idempotent: a second call returns the
   *  same handle. */
  reserve<T extends object>(): PluginStore<T>;
  /** Any other plugin's store, read-only. `undefined` if that plugin never reserved one. */
  read<T extends object>(pluginId: PluginId): PluginStoreView<T> | undefined;
}

/** What a Dataset plugin's `setup()` receives, once, while the Dataset constructs. */
export interface DatasetPluginContextOf<TDataset> {
  dataset: TDataset;
  events: DatasetEvents;
  fields: DatasetFieldRegistrations;
  edits: DatasetEditHook;
  store: DatasetStoreAccess;
  disposables: DisposableStore;
}

/**
 * A plugin installed through `DatasetOptions.plugins`.
 *
 * ```ts
 * const dataset = new Dataset({ entries, plugins: [lockEntries(['t2'])] });
 * ```
 *
 * `Dataset.plugins` is read-only, unlike `Gantt.plugins`: a plugin may declare a Field, and a Field
 * must exist before the first Rollup (D-S5-4), so adding one later would mean re-rolling the whole
 * dataset under a Field the Document never had. A consumer that wants a different plugin set builds a
 * Dataset with it.
 */
export interface DatasetPluginOf<TDataset> {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array: installation resolves
   *  setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically (D-S5-31). A
   *  required id nobody installs throws `MissingPluginError`. */
  requires?: readonly PluginId[];
  setup(ctx: DatasetPluginContextOf<TDataset>): Disposer | void;
}
