// model/ — the plugin primitives that name nothing outside `model/`, zero-dependency (CLAUDE.md:
// model/ is a zero-dependency leaf). The plugin shapes live in api/plugin.ts, `PluginContext` in
// api/plugin-context.ts, and `DatasetPluginContext` in api/dataset-plugin.ts — each names api/ and
// extensions/ types `model/` may never import (issue #137 F1, plans/s5-extensibility-and-editing/
// s5.1-plugin-runtime.md D-S5-1). What stays here is what both contracts share, plus the two store
// types a plugin author holds but never constructs.

import type { EntryId } from './ids.js';

/** A plugin's own identity, unique within the `plugins` list that installs it (D-S5-3). */
export type PluginId = string;

/** What `setup()` returns: releases whatever that plugin's own setup acquired. Called at most once. */
export type Disposer = () => void;

/** Another plugin's store, read-only (D-S5-30). Dropping `set`/`remove` is what makes ownership
 *  legible at the call site: a reviewer never has to check by hand which plugin a store call owns. */
export interface PluginStoreView<T extends object> {
  get(id: EntryId | string): T | undefined;
  readonly all: ReadonlyMap<EntryId, T>;
}

/**
 * A plugin's own per-entry data, namespaced by that plugin's id (D-S5-24). It is a real store, not a
 * side map: a write joins the open transaction, lands in the same `ChangeSet` as the entry edit, and
 * one undo step covers both (I7). A write with no transaction open wraps itself in one, the rule
 * `entries.add` already follows.
 */
export interface PluginStore<T extends object> extends PluginStoreView<T> {
  set(id: EntryId | string, value: T): void;
  remove(id: EntryId | string): void;
}
