// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// The changeset shape a transaction commits (plans/s2-data-core/README.md D-S2-7). Lives here, not in
// data/, so `MutationCancelledError` (model/errors.ts) can carry one — model/ is a leaf and may not
// import data/, so a type a public model/ export needs to name must itself live in model/.

import type { ChangeSetId, EntryId } from './ids.js';
import type { Entry } from './entry.js';

export type StoreName = 'entries'; // S5 adds `plugin:${string}/${string}`
export type ChangeOrigin = 'user' | 'undo' | 'redo'; // 'engine' and 'load' arrive with their producers (D-S2-11)

/** Open by construction (D-S2-26, ADR 0005). Core keys are named for autocomplete and for the
 * comparator table's exhaustiveness check; a key S5's field registry declares is equally legal and
 * is validated at runtime, not by the type. Closing this union would make `FieldUpdated` and the
 * undo record — both public — impossible to open without a breaking change. */
export type CoreFieldKey = keyof Omit<Entry, 'id'>;
export type FieldKey = CoreFieldKey | (string & {});

export interface EntityAdded {
  store: 'entries';
  entity: Entry;
}

export interface EntityRemoved {
  store: 'entries';
  entity: Entry;
}

export interface FieldUpdated {
  store: 'entries';
  id: EntryId;
  field: FieldKey;
  from: unknown;
  to: unknown;
}

export interface ChangeSet {
  id: ChangeSetId;
  origin: ChangeOrigin;
  added: readonly EntityAdded[];
  removed: readonly EntityRemoved[];
  updated: readonly FieldUpdated[];
}

/** `beforeChange`/`change` share one payload (D-S2-5, D-S2-25): a `false` return from a `beforeChange`
 *  handler vetoes the whole changeset; `change` handler return values are ignored. Public event
 *  vocabulary (plans/02 §3), so it lives in `model/` beside `ChangeSet` — the same reason `ChangeSet`
 *  itself moved here (§2.1's deviation note). */
export interface DatasetEventMap {
  beforeChange: { changeSet: ChangeSet };
  change: { changeSet: ChangeSet };
}
