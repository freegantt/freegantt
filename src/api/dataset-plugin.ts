// api/ — what a plugin's `data` half sees (S5.10, D-S5-23/24/30/31, ADR 0019).
// `DatasetPluginContextOf` stays generic over `TDataset` here, so this file never imports
// `./dataset.js` for the concrete `Dataset` class — `api/dataset.ts` already imports this file for the
// generic shape, and dependency-cruiser's `no-circular` rule treats a type-only edge the same as a
// runtime one. `api/dataset.ts` binds the type argument once — `export type DatasetPluginContext =
// DatasetPluginContextOf<Dataset>`. `api/plugin-context.ts` and `api/command.ts` use that pairing.
//
// The two halves see different worlds on purpose. A `view` half sees panes, the overlay and gestures;
// a `data` half sees only what the Dataset holds, so it stays DOM-free and runs wherever a Dataset
// runs. `api/plugin.ts` holds the plugin shapes that carry both halves.

import type {
  Aggregator,
  AggregatorName,
  DatasetEventMap,
  ExtenderWrapper,
  Field,
  FieldType,
  FieldTypeName,
  HierarchySourceWrapper,
  PluginId,
  PluginStore,
  PluginStoreView,
} from '../model/index.js';
import type { DisposableStore } from '../extensions/disposables.js';

// Re-exported so a plugin author names the store types from the same module as the contract that
// hands them over, rather than hunting for the module they are declared in.
export type { PluginStore, PluginStoreView, ExtenderWrapper };
// A plugin author writing a hierarchy source names both: the wrapper `setSource` takes, and the
// source it composes onto. Here for the same reason the store types are — beside the contract that
// hands them over.
export type { HierarchySource, HierarchySourceWrapper } from '../model/index.js';
// The one legal way to compose two extenders' writes (#197), here for that same reason: it belongs
// beside `DatasetEditHook`, the contract that hands a plugin the occupant it has to merge with. It
// takes and returns `EntryEdits` — one `EntryEdit` per Entry, the same object `entries.update()`
// takes (#209), so the only type a plugin author names to write a cascade is one they already know.
export { mergeEntryEdits } from '../data/edit-extension.js';
// The move a plugin's cascade is honest about (D-S5-44): every Segment of an Entry, translated
// rigidly to a new `start`, each keeping its own `SegmentId`. An envelope-only cascade against a
// several-Segment Entry is refused (`SegmentsOutOfSyncError`), so this is how a plugin author writes
// `segments` instead, rather than hand-rolling the same rigid translate `layout/gesture-draft.ts`'s
// own `moveEdit` computes for a drag — beside `mergeEntryEdits`, for the same reason: an app author
// never meets it, because it builds one value of the `EntryEdits` map only an extender returns. It
// names `segments` alone and lets core derive the envelope (D-S5-50, #239).
export { moveEntryTo } from '../data/entry-reader.js';

/** `beforeChange`/`change`, the two events a Dataset raises (D-S2-5, D-S2-25). Returning `false` from a
 *  `beforeChange` handler vetoes the whole changeset — the refusal path a lock plugin uses (D-S5-24). */
export interface DatasetEvents {
  on<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}

/** Field declarations a plugin adds to the Dataset it installs into (D-S5-21). Legal while `data()`
 *  runs and not after — a later call throws `RegistrationClosedError` (D-S5-4). */
export interface DatasetFieldRegistrations {
  register(field: Field): void;
  registerType(name: FieldTypeName, type: FieldType): void;
  registerAggregator(name: AggregatorName, fn: Aggregator): void;
}

/** The extension hook, as a plugin claims it (D-S5-23). Installing composes: the wrapper receives the
 *  current occupant, so a second plugin adds to the first's cascade instead of evicting it. Merge the
 *  two results with `mergeEntryEdits`, never with a spread (#197). */
export interface DatasetEditHook {
  setExtender(wrap: ExtenderWrapper): void;
}

/** The tree, as a plugin claims it (ADR 0020). Installing composes: the wrapper receives the current
 *  occupant, so a second plugin answers over the first's tree instead of evicting it. Core's own
 *  occupant is `(entry) => entry.parentId` and has no special claim on the seam (D-S5-23).
 *
 *  **This is an expert door.** An app author never meets it: they write `parentId` on the Entry, and
 *  core's own source answers it. */
export interface DatasetHierarchy {
  /** Call: `ctx.hierarchy.setSource((next) => (entry) => entry.props.phaseId ?? next(entry))` —
   *  "set the hierarchy source: the phase id when there is one, otherwise whatever the next source
   *  says."
   *
   *  Core owns everything downstream of the answer — the child index, `depth`, `descendants()` and
   *  the Rollup all follow it, so a plugin that changes the tree has changed the Rollup and the two
   *  can never disagree. Name the `props` shape to read a consumer key with no cast:
   *  `ctx.hierarchy.setSource<PlannerProps>(…)`.
   *
   *  Legal while `data()` runs and not after — a later call throws `RegistrationClosedError`, because
   *  the construction Rollup has already walked the tree by then (D-S5-4). */
  setSource<TProps = Record<string, unknown>>(wrap: HierarchySourceWrapper<TProps>): void;
}

/** This plugin's own store, plus a read-only view of anybody else's (D-S5-24, D-S5-30). */
export interface DatasetStoreAccess {
  /** This plugin's own reserved store, namespaced by its id. Idempotent: a second call returns the
   *  same handle. */
  reserve<T extends object>(): PluginStore<T>;
  /** Any other plugin's store, read-only. `undefined` if that plugin never reserved one. */
  read<T extends object>(pluginId: PluginId): PluginStoreView<T> | undefined;
}

/** What a plugin's `data()` half receives, once, while the Dataset constructs. */
export interface DatasetPluginContextOf<TDataset> {
  dataset: TDataset;
  events: DatasetEvents;
  fields: DatasetFieldRegistrations;
  edits: DatasetEditHook;
  hierarchy: DatasetHierarchy;
  store: DatasetStoreAccess;
  disposables: DisposableStore;
}
