// model/ — the plugin primitives that name nothing outside `model/`, zero-dependency (CLAUDE.md:
// model/ is a zero-dependency leaf). `GanttPlugin`/`PluginContext` live in api/plugin.ts, and
// `DatasetPlugin`/`DatasetPluginContext` live in api/dataset-plugin.ts — each names api/ and
// extensions/ types `model/` may never import (issue #137 F1, plans/s5-extensibility-and-editing/
// s5.1-plugin-runtime.md D-S5-1). What stays here is what both contracts share, plus the two store
// types a plugin author holds but never constructs.

import type { EntryId } from './ids.js';
import type { EditExtender } from './entry.js';

/** A plugin's own identity, unique within the `plugins` list that installs it (D-S5-3). */
export type PluginId = string;

/** What `setup()` returns: releases whatever that plugin's own setup acquired. Called at most once. */
export type Disposer = () => void;

/**
 * How installing an extender composes (D-S5-23). `next` is the hook's current occupant — the identity
 * function when nothing has claimed it yet.
 *
 * ```ts
 * ctx.edits.setExtender(() => myExtender);                                  // replace
 * ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)));  // tap in
 * ```
 *
 * `mergeEntryEdits` is exported from the package (#197). A spread merges the two maps wrongly: two
 * extenders that write the same Entry lose the earlier write.
 *
 * `data/` still holds one field and calls it at one site (D-S2-6). Wrapping order is the order
 * `requires` resolves, never the `plugins` array's own order (D-S5-31).
 */
export type ExtenderWrapper = (next: EditExtender) => EditExtender;

/** Another plugin's store, read-only (D-S5-30). Dropping `set`/`remove` is what makes ownership
 *  legible at the call site: a reviewer never has to check by hand which plugin a store call owns. */
export interface PluginStoreView<T extends object> {
  get(id: EntryId): T | undefined;
  readonly all: ReadonlyMap<EntryId, T>;
}

/**
 * A plugin's own per-entry data, namespaced by that plugin's id (D-S5-24). It is a real store, not a
 * side map: a write joins the open transaction, lands in the same `ChangeSet` as the entry edit, and
 * one undo step covers both (I7). A write with no transaction open wraps itself in one, the rule
 * `entries.add` already follows.
 */
export interface PluginStore<T extends object> extends PluginStoreView<T> {
  set(id: EntryId, value: T): void;
  remove(id: EntryId): void;
}
