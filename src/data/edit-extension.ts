// data/ — the extension hook every transaction calls once (D4). An unoccupied hook is the identity
// function; an installed plugin (S7's scheduling engine) is what returns anything else (D-S2-6).

import type { EditExtender, EntryEdits } from '../model/index.js';

// `StoredEdit`/`EntryEdits` moved to `model/entry.ts` in S3.3 (D-S3-4) so `layout/gesture-draft.ts`
// can build one without reaching into `data/`; `EditRequest`/`EditExtender` followed in S5.10
// (D-S5-23), so `ExtenderWrapper` — the type a plugin author writes against — can name them.
// `StoredEdits` joined them at #209's C1: the storage-shaped map name every internal caller now
// uses, so `EntryEdits` is free to mean the loose write shape once C3 flips it. All five are
// re-exported here so every existing `data/` import site keeps working unchanged.
export type { StoredEdit, StoredEdits, EntryEdits, EditRequest, EditExtender } from '../model/index.js';

const EMPTY_EDITS: EntryEdits = Object.freeze(new Map());

/** No cascade, ever — the baseline the tests contrast an installed extender against. */
export const identityExtender: EditExtender = () => EMPTY_EDITS;
