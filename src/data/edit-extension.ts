// data/ — the extension hook every transaction calls once (D4). An unoccupied hook is the identity
// function; an installed plugin (S3's scheduling engine) is what returns anything else (D-S2-6).

import type { Entry, EntryId } from '../model/index.js';

/** Storage-shaped edit: every field already read through `time/` (an `Instant`, not a loose
 *  `InstantInput`) — what the write set holds and what `diffEdit` compares against `entries`. Distinct
 *  from the public, input-shaped `EntryEdit` a caller writes (`plans/02` one write shape): the two only
 *  coincide today because no mutator normalizes loose input into this shape yet (S2.3's job). */
export type StoredEdit<TMeta = unknown> = Partial<Omit<Entry<TMeta>, 'id'>>;

export type EntryEdits = ReadonlyMap<EntryId, StoredEdit>;

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
