// data/ — the extension hook every transaction calls once (D4). An unoccupied hook is the identity
// function; an installed plugin (S3's scheduling engine) is what returns anything else (D-S2-6).

import type { Entry, EntryEdit, EntryId } from '../model/index.js';

export type EntryEdits = ReadonlyMap<EntryId, EntryEdit>;

export interface EditRequest {
  /** Current store snapshot, before this transaction's edits. */
  entries: ReadonlyMap<EntryId, Entry>;
  /** What the caller asked to change. */
  proposed: EntryEdits;
}

/** Extra writes only; an empty map means no cascade. */
export type EditExtender = (request: EditRequest) => EntryEdits;

const EMPTY_EDITS: EntryEdits = new Map();

/** No cascade, ever — the baseline the tests contrast an installed extender against. */
export const identityExtender: EditExtender = () => EMPTY_EDITS;
