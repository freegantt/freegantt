// data/ — the extension hook every transaction calls once (D4). An unoccupied hook is the identity
// function; an installed plugin (S7's scheduling engine) is what returns anything else (D-S2-6).

import type { Entry, EntryEdits, EntryId } from '../model/index.js';

// `StoredEdit`/`EntryEdits` moved to `model/entry.ts` in S3.3 (D-S3-4) so `layout/gesture-draft.ts`
// can build one without reaching into `data/`. Re-exported here so every existing `data/` import
// site keeps working unchanged.
export type { StoredEdit, EntryEdits } from '../model/index.js';

export interface EditRequest {
  /** Current store snapshot, before this transaction's edits. */
  entries: ReadonlyMap<EntryId, Entry>;
  /** What the caller asked to change. */
  proposed: EntryEdits;
}

/** Extra writes only; an empty map means no cascade. */
export type EditExtender = (request: EditRequest) => EntryEdits;

const EMPTY_EDITS: EntryEdits = Object.freeze(new Map());

/** No cascade, ever — the baseline the tests contrast an installed extender against. */
export const identityExtender: EditExtender = () => EMPTY_EDITS;
