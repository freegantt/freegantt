// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// The changeset shape a transaction commits (plans/s2-data-core/README.md D-S2-7). Lives here, not in
// data/, so `MutationCancelledError` (model/errors.ts) can carry one — model/ is a leaf and may not
// import data/, so a type a public model/ export needs to name must itself live in model/.

import type { ChangeSetId, EntryId } from './ids.js';
import type { StoredEntry } from './stored-entry.js';
import type { FieldKey } from './field.js';
import type { PluginId } from './plugin.js';
import type { ErrorReport, Refusable } from './error-report.js';

export type { CoreFieldKey, FieldKey } from './field.js';

/** One plugin's own store, namespaced by that plugin's id (D-S5-24). `reserve()` and `read()` both
 *  key off this, so a reader finds exactly the store its owner made. */
export type PluginStoreName = `plugin:${PluginId}`;
export type StoreName = 'entries' | PluginStoreName;
export type ChangeOrigin = 'user' | 'undo' | 'redo'; // 'engine' and 'load' arrive with their producers (D-S2-11)

export interface EntityAdded {
  store: 'entries';
  entity: StoredEntry;
}

export interface EntityRemoved {
  store: 'entries';
  entity: StoredEntry;
}

export interface FieldUpdated {
  store: 'entries';
  id: EntryId;
  field: FieldKey;
  from: unknown;
  to: unknown;
}

/** One plugin-store row's net change (D-S5-24). A store row is whole-value data the plugin owns, not
 *  a Field, so it carries no `field` key — `store` is what tells the two rows apart. `undefined` on
 *  the `from` side means the entry had no row; on the `to` side it means this transaction removed it. */
export interface StoreRowUpdated {
  store: PluginStoreName;
  id: EntryId;
  from: unknown;
  to: unknown;
}

/** What `ChangeSet.updated` holds. Read `row.store === 'entries'` to tell the two apart — a consumer
 *  that only wants Field rows filters on it, and TypeScript narrows to `FieldUpdated` from there. */
export type UpdatedRow = FieldUpdated | StoreRowUpdated;

export interface ChangeSet {
  id: ChangeSetId;
  origin: ChangeOrigin;
  added: readonly EntityAdded[];
  removed: readonly EntityRemoved[];
  updated: readonly UpdatedRow[];
}

/** `beforeChange`/`change` share one payload (D-S2-5, D-S2-25): a `false` return from a `beforeChange`
 *  handler vetoes the whole changeset; `change` handler return values are ignored. Only the
 *  `before*` half is `Refusable` — `refuse(reason)` puts the vetoing handler's own words on the
 *  report core raises for it (#210), and there is nothing to refuse once the change has landed. Public event
 *  vocabulary (plans/02 §3), so it lives in `model/` beside `ChangeSet` — the same reason `ChangeSet`
 *  itself moved here (§2.1's deviation note). */
export interface DatasetEventMap {
  beforeChange: Refusable & { changeSet: ChangeSet };
  change: { changeSet: ChangeSet };
  /** S5.12, D-S5-40: every refusal and every recovered fault a Dataset observes. Sync only, and no
   *  `before*` pair — a report states what already happened, so there is nothing to veto. The payload
   *  is the `ErrorReport` itself, not a wrapper: `dataset.on('error', (report) => …)` is the whole
   *  call. `api/watch-all-errors.ts` folds this feed and the Gantt's into one subscription. */
  error: ErrorReport;
}
