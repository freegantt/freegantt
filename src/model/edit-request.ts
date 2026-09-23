// model/ — the extension hook's own vocabulary (D4, D-S2-6). A leaf on purpose (#466):
// `EditRequest.writeTarget` names both `FieldKey` (`field-key.ts`) and `WriteTarget`
// (`write-verdict.ts`), and `write-verdict.ts` already reaches `field-key.ts` through
// `error-report.ts` → `field.ts`. Declaring `EditRequest` in either of those files, or in
// `stored-entry.ts` (which `field-key.ts` derives from), would cycle back through that chain. This
// file sits below all three and nothing in `model/` depends on it, so it can import from every one
// of them.

import type { EntryId } from './ids.js';
import type { EntryEdits, ProposedEdits, StoredEntry } from './stored-entry.js';
import type { FieldKey } from './field-key.js';
import type { FieldEditable } from './field.js';
import type { WriteTarget } from './write-verdict.js';

/** What the extension hook reads (D4, D-S2-6). It carries the same three members on a preview call
 *  and on the real commit call, which is why an extender can never refuse a write — see D-S5-24's
 *  refusal note: a lock plugin vetoes in `beforeChange`, never here. */
export interface EditRequest {
  /** Current store snapshot, before this transaction's edits — what a cascade reads to compute a
   *  delta (what moved, and by how much). Unlike `entryAfterEdits` below, this never reflects this
   *  transaction's own body edits (D-S5-45). */
  entries: ReadonlyMap<EntryId, StoredEntry>;
  /** What the caller asked to change — storage-shaped and complete, the same as `entries` above
   *  (`plans/02`, "core fills zone math"): a cascade compares it against `entries` with no
   *  normalizing step of its own. */
  proposed: ProposedEdits;
  /** `id` as this transaction's own body edits leave it: committed state overlaid with `proposed`
   *  (and, at commit, this transaction's own adds). `undefined` when `id` names no entry there either.
   *  `entries.get(id)` is the wrong read for judging an in-flight edit against current shape — it
   *  still shows an Entry's dates as they were before this transaction rewrote them, so a cascade
   *  reasoning from it can propose a write core then refuses against the shape it actually has
   *  (D-S5-45). A per-id lookup, not a second map on this object: the drag preview calls this every
   *  rAF frame and must not copy the dataset to answer it (I5). */
  entryAfterEdits(id: EntryId | string): StoredEntry | undefined;
  /** The Entries this transaction adds, by id — empty on a drag preview, and empty whenever the
   *  transaction adds none. Read one with `entryAfterEdits(id)`: an added Entry is not in `entries`
   *  above, which stays the pre-transaction snapshot (D-S5-45). Net effect, not a call log: an Entry
   *  added and removed in the same transaction is in neither set (#235). */
  readonly addedEntryIds: ReadonlySet<EntryId>;
  /** The Entries this transaction removes, by id — descendants included, because `entries.remove`
   *  removes the whole subtree and core fills the descendant walk. Read one off `entries` above,
   *  which still holds it: `entryAfterEdits(id)` answers `undefined` for every id in here (#235). */
  readonly removedEntryIds: ReadonlySet<EntryId>;
  /** Has this row a child, as this transaction's own body and adds leave it? Same tree
   *  `entryAfterEdits(id)` reads (D-S5-45). */
  hasChildren(id: EntryId | string): boolean;
  /** Where does a write to this cell land — on the row, split across its children, or nowhere?
   *  A cascade that writes a cell it does not own is dropped in silence (ADR 0013, decision 5).
   *  Reads `write-rule.ts`, the resolver the grid and `update()` read (I14). */
  writeTarget(id: EntryId | string, field: FieldKey): WriteTarget;
  /** The effective lock on this cell (#473): a plugin's per-entry lock rule's own answer, or the
   *  Field's own `editable` when the rule has no opinion. An undeclared key or a `compute` Field
   *  answers `'never'`, same as `Dataset.editableOf`. Reads `write-rule.ts`'s `editableAnswerFor`,
   *  the same resolver every write door reads (I14) — a cascade checks the same lock
   *  `entries.update()` and the grid check before it writes. */
  editableOf(id: EntryId | string, field: FieldKey): FieldEditable;
}

/** Extra writes only; an empty map means no cascade. Lives in `model/` (not `data/`) so
 *  `ExtenderWrapper` — the type a plugin author writes against — can name it (D-S5-23).
 *
 *  What it returns is read by the same rules `dataset.entries.update(id, edit)` obeys (#209): a Field
 *  no Dataset declares is refused (`UnknownFieldError`). `moveEntryTo` is the door a cascade uses to
 *  slide an Entry's whole span. An id nothing in the transaction knows is skipped. */
export type EditExtender = (request: EditRequest) => EntryEdits;

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
 *
 * Lives beside `EditExtender`, not in `plugin.ts` (#466): `EditExtender` now names `WriteTarget`
 * (`write-verdict.ts`), which reaches `plugin.ts` through `error-report.ts`'s `PluginId` import —
 * `plugin.ts` importing back from here would cycle. */
export type ExtenderWrapper = (next: EditExtender) => EditExtender;
