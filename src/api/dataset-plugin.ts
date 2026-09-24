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
  DatasetEventMap,
  Disposer,
  ExtenderWrapper,
  FieldLockRuleWrapper,
  PluginId,
  PluginStore,
  PluginStoreView,
} from '../model/index.js';
import type { DisposableStore } from '../extensions/disposables.js';

// Re-exported so a plugin author names the store types from the same module as the contract that
// hands them over, rather than hunting for the module they are declared in.
export type { PluginStore, PluginStoreView, ExtenderWrapper };
// A plugin author writing a hierarchy source names both: the wrapper its plugin's own
// `hierarchySource` member takes, and the source it composes onto (`api/plugin.ts`). Here for the
// same reason the store types are — beside the contract that hands them over.
export type { HierarchySource, HierarchySourceWrapper } from '../model/index.js';
// A plugin author writing a lock rule names both: the wrapper `setLockRule` takes, and the query the
// rule reads. Here for the same reason the hierarchy source types are.
export type { FieldLockQuery, FieldLockRule } from '../model/index.js';
export type { FieldLockRuleWrapper };
// The one legal way to compose two extenders' writes (#197), here for that same reason: it belongs
// beside `DatasetEditHook`, the contract that hands a plugin the occupant it has to merge with. It
// takes and returns `EntryEdits` — one `EntryEdit` per Entry, the same object `entries.update()`
// takes (#209), so the only type a plugin author names to write a cascade is one they already know.
export { mergeEntryEdits } from '../data/edit-extension.js';
// The move a plugin's cascade is honest about (D-S5-44): a spanning Entry translated rigidly to a
// new `start`, `end` shifted by the same delta so the Entry's own duration never changes. This is
// how a plugin author writes a cascade move, rather than hand-rolling the same rigid translate
// `layout/gesture-draft.ts`'s own `moveEdit` computes for a drag — beside `mergeEntryEdits`, for the
// same reason: an app author never meets it, because it builds one value of the `EntryEdits` map
// only an extender returns (D-S5-50, #239).
export { moveEntryTo } from '../data/entry-reader.js';

/** `beforeChange`/`change`, the two events a Dataset raises (D-S2-5, D-S2-25). Returning `false` from a
 *  `beforeChange` handler vetoes the whole changeset — the refusal path a lock plugin uses (D-S5-24). */
export interface DatasetEvents {
  /** Every plugin registration seam returns a `Disposer` that removes exactly its own registration
   *  (I2); `on` is that seam for a Dataset event. Not gated — a plugin may call this after its own
   *  `data()` returns — but still tracked: the handler is removed when the plugin is uninstalled or
   *  the Dataset is destroyed, the same as every other seam. */
  on<K extends keyof DatasetEventMap>(
    name: K,
    handler: (payload: DatasetEventMap[K]) => void | false,
  ): Disposer;
  off<K extends keyof DatasetEventMap>(name: K, handler: (payload: DatasetEventMap[K]) => void | false): void;
}

/** The extension hook, as a plugin claims it (D-S5-23). Installing composes: the wrapper receives the
 *  current occupant, so a second plugin adds to the first's cascade instead of evicting it. Merge the
 *  two results with `mergeEntryEdits`, never with a spread (#197).
 *
 *  `setLockRule` is the sibling seam a plugin uses to open one locked Field on one Entry, or on a
 *  whole subtree (#473). Installing composes the same way: the wrapper receives the current occupant,
 *  and falls through to it with `undefined` for "no opinion." Every write door — `entries.update()`,
 *  the grid, and an `EditExtender` cascade — reads the composed rule before `Field.editable` (I14). */
export interface DatasetEditHook {
  setExtender(wrap: ExtenderWrapper): void;
  setLockRule(wrap: FieldLockRuleWrapper): void;
}

/** This plugin's own store, plus a read-only view of anybody else's (D-S5-24, D-S5-30). */
export interface DatasetStoreAccess {
  /** This plugin's own reserved store, namespaced by its id. Idempotent: a second call returns the
   *  same handle. */
  reserve<T extends object>(): PluginStore<T>;
  /** Any other plugin's store, read-only. `undefined` if that plugin never reserved one. */
  read<T extends object>(pluginId: PluginId): PluginStoreView<T> | undefined;
}

/** What a plugin's `data()` half receives, once, while the Dataset constructs. A Field declares on
 *  the plugin object itself — `fields`/`fieldTypes`/`aggregators` (#496 grill round 3, R1) — so there
 *  is no `ctx.fields` door here: one way to declare, so the pre-#496-R2 gap (a flat value dropped
 *  because the plugin declared its Field too late for ingest to see) cannot come back. */
export interface DatasetPluginContextOf<TDataset> {
  dataset: TDataset;
  events: DatasetEvents;
  edits: DatasetEditHook;
  store: DatasetStoreAccess;
  disposables: DisposableStore;
}
