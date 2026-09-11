// data/ — the extension hook every transaction calls once (D4). An unoccupied hook is the identity
// function; an installed plugin (S7's scheduling engine) is what returns anything else (D-S2-6).

import type { EditExtender, EntryEdit, EntryEdits, EntryId } from '../model/index.js';

// `ProposedEdit`/`EntryEdits` moved to `model/entry.ts` in S3.3 (D-S3-4) so `layout/gesture-draft.ts`
// can build one without reaching into `data/`; `EditRequest`/`EditExtender` followed in S5.10
// (D-S5-23), so `ExtenderWrapper` — the type a plugin author writes against — can name them.
// `ProposedEdits` joined them at #209's C1: the storage-shaped map name every internal caller now
// uses, and `EntryEdits` now means the loose write shape a plugin author returns (#209 C3). All five
// are re-exported here so every existing `data/` import site keeps working unchanged.
export type {
  ProposedEdit,
  ProposedEdits,
  EntryEdit,
  EntryEdits,
  EditRequest,
  EditExtender,
} from '../model/index.js';

const EMPTY_EDITS: EntryEdits = Object.freeze(new Map());

/** No cascade, ever — the baseline the tests contrast an installed extender against. */
export const identityExtender: EditExtender = () => EMPTY_EDITS;

/**
 * Merges two sets of extra writes, keyed by Entry — the composition an `ExtenderWrapper` needs
 * (D-S5-23).
 *
 * ```ts
 * ctx.edits.setExtender((next) => (request) => mergeEntryEdits(next(request), mine(request)));
 * ```
 *
 * Object spread and `new Map([...a, ...b])` are not legal merges: two extenders that write the same
 * Entry lose the earlier edit outright (#197). `extra` wins per Field key, and every other key of
 * both edits survives, at any composition depth (#238).
 *
 * It lives beside the hook, not beside the Field code: a loose edit states the Fields it writes by
 * the keys it holds, so merging two of them needs no Field knowledge at all. Core derives the
 * proposed keys later, once, when it reads the composed result (`toEditsReading`).
 */
export function mergeEntryEdits(base: EntryEdits, extra: EntryEdits): EntryEdits {
  if (extra.size === 0) return base;
  const merged = new Map<EntryId, EntryEdit>(base);
  for (const [id, edit] of extra) merged.set(id, { ...merged.get(id), ...edit });
  return merged;
}
