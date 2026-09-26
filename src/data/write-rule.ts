// data/ — the one write resolver three questions meet at (ADR 0011, "The write resolver moves into
// data/"): does this Field exist, is it editable, is it derived here. Three arms, three owners, all
// landed — ADR 0011 moved the function here, ADR 0013 filled the derived arm, ADR 0015 filled the
// editable arm and claimed I14.
//
// Two readers ask, and one file answers both, which is what I14 buys: `view/capability.ts` asks the
// grid threshold before it opens a cell or paints a handle, and `data/entry-store.ts`'s `update()`
// asks the API threshold before it stages a write. `entries.update()` keeps `UnknownFieldError` for
// the existence arm.

import type {
  EntryId,
  Field,
  FieldEditable,
  FieldKey,
  FieldLockQuery,
  FieldLockRule,
  WriteRefusalReason,
  WriteTarget,
  WriteVerdict,
} from '../model/index.js';
import {
  ComputedFieldCannotBeWrittenError,
  entryId,
  FieldNotEditableError,
  UnknownFieldError,
} from '../model/index.js';
import { editableOf, rollsUp } from './fields/field-registry.js';
import { isDescendantOf } from './hierarchy-source.js';
import type { UnplacedEntry } from './hierarchy-source.js';

/** `model/write-verdict.ts` declares the verdict pair (and, since #466, `WriteTarget`) under its
 *  public names, so a consumer can import what `view/capability.ts` republishes and what
 *  `EditRequest.writeTarget` returns (`ae-forgotten-export`). This file keeps its own
 *  `Field`-prefixed names as local aliases, because every call site here already reads by them. */
export type FieldWriteRefusalReason = WriteRefusalReason;
export type FieldWriteVerdict = WriteVerdict;
export type FieldWriteTarget = WriteTarget;

// One verdict object per answer, frozen and shared — `canWrite` sits behind hover affordance
// resolution, and a verdict built per hover would allocate where the hot path must not (I5).
export const WRITABLE: FieldWriteVerdict = Object.freeze({ ok: true });
export const NOT_WRITABLE: FieldWriteVerdict = Object.freeze({ ok: false });
export const DERIVED: FieldWriteVerdict = Object.freeze({ ok: false, reason: 'derived-value' as const });

/** Where does a write to this Field, on an Entry with or without children, land? (ADR 0013,
 *  amendment 2026-09-11.)
 *
 *  This reads the **Field declaration** and one structural fact, and nothing about the call that
 *  asked. A write refused here is refused standalone and refused inside `dataset.transaction()`
 *  alike: grouping decides when writes land together and what one undo step covers, never what is
 *  allowed. The signal it replaced was transaction depth, and `dataset.transaction()` is public, so
 *  a consumer set it in one call (ADR 0013's appendix — still open).
 *
 *  Three readers ask, and they must agree (I14): `entries.update()` decides a write with it,
 *  `view/capability.ts` decides whether the cell offers an editor at all, and `EditRequest.writeTarget`
 *  (#466) hands a plugin author this same answer unchanged — no fourth value, no reinterpretation. */
export function resolveWriteTarget(hasChildren: boolean, field: Field | undefined): FieldWriteTarget {
  // An undeclared key takes the same answer as a declared Field that does not roll up: it lands on
  // the entry. Declaring a key is a handling contract, so an undeclared one is carried and opaque
  // (ADR 0011) — it has no `rollUp` to own a parent's cell with. The rule lives here, once, because
  // three readers ask this question and a caller that answered `'entry'` on its own would be a
  // fourth rule nobody could see (I14, #466).
  if (!hasChildren || field === undefined || !rollsUp(field)) return 'entry';
  return 'refused';
}

/** Core's own lock rule (#473): silence, on every cell. The first occupant of `ctx.edits.setLockRule`
 *  — a plugin composes onto this the way it composes onto `identityExtender`/`storedParentSource`
 *  — so a Dataset with no plugin installed answers every cell with `Field.editable` alone. */
export const identityFieldLockRule: FieldLockRule = () => undefined;

/** One frozen `FieldLockQuery`, safe to share across every cell for as long as `identityFieldLockRule`
 *  is the occupant: that rule reads neither argument, so no caller of it ever needs a real query.
 *  `EntryStore.editableOf` reads this on the no-plugin-installed path, in place of building a fresh
 *  `fieldLockQueryFor(...)` (and its closures) per cell (#473's ocr finding, I5). It stays paired
 *  with `identityFieldLockRule` here, and must not be handed to any other rule. */
export const IGNORED_FIELD_LOCK_QUERY: FieldLockQuery = Object.freeze({
  id: entryId(''),
  isDescendantOf: () => false,
});

/** One cell's address, built from whichever lookup a caller holds — `EntryStore`'s own
 *  transaction-aware `parentIdOf`, or an `EditRequest`'s lazy `entryAfterEdits`. The walk itself is
 *  `hierarchy-source.ts`'s `isDescendantOf`; this just gives a `FieldLockRule` the shape it asks for. */
export function fieldLockQueryFor(
  id: EntryId,
  entryFor: (id: EntryId) => UnplacedEntry | undefined,
  parentIdOf: (entry: UnplacedEntry) => EntryId | undefined,
): FieldLockQuery {
  return {
    id,
    isDescendantOf: (ancestorId) => isDescendantOf(id, entryId(ancestorId), entryFor, parentIdOf),
  };
}

/** The effective lock on one cell (#473): a plugin's own answer, or `Field.editable` when the rule
 *  has no opinion (`undefined`). One function, so `entries.update()`, an `EditExtender` cascade, and
 *  the grid (`view/capability.ts`) read the same answer for the same cell (I14) — a plugin's per-entry
 *  unlock is not a second rule beside `Field.editable`, it is this rule's other input. */
export function resolveFieldEditable(
  query: FieldLockQuery,
  field: FieldKey,
  declared: Field,
  lockRule: FieldLockRule,
): FieldEditable {
  return lockRule(query, field) ?? editableOf(declared);
}

/** What `dataset.editableOf`/`EditRequest.editableOf` answer for one cell, in the one order
 *  `assertFieldTakesWrite` below throws in — existence, then `compute`, then the lock (#473's ocr
 *  finding). A query and a door built from two copies of that order can drift; built from one, they
 *  cannot: an undeclared or `compute` Field answers `'never'` here for the same reason
 *  `entries.update()` refuses it there, so a plugin that guards a write with `editableOf(...) !==
 *  'never'` never passes a guard `entries.update()` then throws on. */
export function editableAnswerFor(
  field: FieldKey,
  declared: Field | undefined,
  query: FieldLockQuery,
  lockRule: FieldLockRule,
): FieldEditable {
  if (declared === undefined || 'compute' in declared) return 'never';
  return resolveFieldEditable(query, field, declared, lockRule);
}

/** Does this Field, on this Entry, take a write from this door at all? The one check
 *  `entries.update()` and an `EditExtender` cascade both run, in the one order that leaves the caller
 *  somewhere to go (ADR 0015; folded from two copies, #473's ocr finding).
 *
 *  Existence first — an undeclared key names no Field to ask anything about. Then `compute`: a
 *  compute Field owns no stored home, and it may not carry `editable` either, so asking the lock
 *  first would answer "declare an editable" about a key the register door refuses. Then the lock
 *  itself, resolved per entry (#473) rather than off the Field declaration alone. `editableAnswerFor`
 *  encodes this same order, so the two cannot drift. */
export function assertFieldTakesWrite(
  field: FieldKey,
  declared: Field | undefined,
  query: FieldLockQuery,
  lockRule: FieldLockRule,
  operation: string,
): Field {
  if (declared === undefined) throw new UnknownFieldError(field, operation);
  if ('compute' in declared) throw new ComputedFieldCannotBeWrittenError(field, operation);
  if (editableAnswerFor(field, declared, query, lockRule) === 'never') {
    throw new FieldNotEditableError(field, operation);
  }
  return declared;
}

/** The library's own last word on a cell. It is read when neither the consumer nor a plugin speaks.
 *
 *  The Rollup pass writes a rolling-up parent's rolling-up Field off its children — a parent is any
 *  Entry with at least one child (ADR 0013: derivation is structure, not a stored classification). A
 *  user write there would commit, and the next Rollup would overwrite it. That refusal is worth
 *  words, and they are the words the cell editor has always shown. `rollsUp` is the Rollup pass's own
 *  test, so this refuses exactly the set that pass would overwrite. No Field can reopen that cell by
 *  declaring a distribution policy (#470 retired that seam) — a rolling-up cell on a row with
 *  children refuses from every direction, with no exception left to name.
 *
 *  Everything else is the **effective** editable at the grid threshold: the caller passes it, most
 *  often the Field's own `editable` (`editableOf`), or the answer a plugin's per-entry lock rule
 *  already resolved (#473) — `view/capability.ts`'s `canWrite` is the one caller that ever has a lock
 *  rule's answer to pass. `editable` is required, not defaulted (#473's ocr finding): a caller that
 *  forgets it would silently skip the per-entry lock instead of the Field's own default, and every
 *  caller already has one of the two answers in hand to pass. */
export function libraryWriteRule(
  hasChildren: boolean,
  field: Field,
  editable: FieldEditable,
): FieldWriteVerdict {
  if (resolveWriteTarget(hasChildren, field) === 'refused') return DERIVED;
  return editable === 'anywhere' ? WRITABLE : NOT_WRITABLE;
}
