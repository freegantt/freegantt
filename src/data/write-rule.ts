// data/ — the one write resolver three questions meet at (ADR 0011, "The write resolver moves into
// data/"): does this Field exist, is it editable, is it derived here. Three arms, three owners, all
// landed — ADR 0011 moved the function here, ADR 0013 filled the derived arm, ADR 0015 filled the
// editable arm and claimed I14.
//
// Two readers ask, and one file answers both, which is what I14 buys: `view/capability.ts` asks the
// grid threshold before it opens a cell or paints a handle, and `data/entry-store.ts`'s `update()`
// asks the API threshold before it stages a write. `entries.update()` keeps `UnknownFieldError` for
// the existence arm.

import type { Field, FieldKey, WriteRefusalReason, WriteTarget, WriteVerdict } from '../model/index.js';
import {
  ComputedFieldCannotBeWrittenError,
  FieldNotEditableError,
  UnknownFieldError,
} from '../model/index.js';
import { editableOf, rollsUp } from './fields/field-registry.js';

/** `model/write-verdict.ts` declares the verdict pair (and, since #466, `WriteTarget`) under its
 *  public names, so a consumer can import what `view/capability.ts` republishes and what
 *  `EditRequest.writeTarget` returns (F1, `ae-forgotten-export`). This file keeps its own
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
 *  a consumer set it in one call (Q7, ADR 0013's appendix — still open).
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

/** May a person change this value by hand — the cell editor, a bar handle, a bar move? The **grid
 *  threshold** (ADR 0015): `'anywhere'`, and nothing else. `'api'` keeps the cell dead on purpose,
 *  for a value the app owns and the user does not type. */
export function isUserEditable(field: Field): boolean {
  return editableOf(field) === 'anywhere';
}

/** May `entries.update()` change this value? The **API threshold** (ADR 0015): anything but
 *  `'never'`. One key answers both thresholds, which is what keeps the two doors from disagreeing
 *  (I14). A `'never'` Field is a lock, and `entries.update()` throws `FieldNotEditableError`.
 *
 *  It names what a *caller* may write, never what the library may: construction, `entries.add()`
 *  and History replay all still write a locked Field. */
export function isApiEditable(field: Field): boolean {
  return editableOf(field) !== 'never';
}

/** Does this Field, on this Entry, take a write from this door at all? The one check
 *  `entries.update()` and an `EditExtender` cascade both run, in the one order that leaves the caller
 *  somewhere to go (ADR 0015; folded from two copies, #473's ocr finding: the cascade door used to
 *  skip the `compute` check, so a cascade writing a `compute` Field passed in silence instead of
 *  throwing `ComputedFieldCannotBeWrittenError` the way `entries.update()` already does).
 *
 *  Existence first — an undeclared key names no Field to ask anything about. Then `compute`: a
 *  compute Field owns no stored home, and it may not carry `editable` either, so asking `editable`
 *  first would answer "declare an editable" about a key the register door refuses. Then the API
 *  threshold, which refuses the lock and nothing else.
 *
 *  It asks about the Field, never about the Entry. It returns the Field it resolved, so a caller that
 *  needs the declaration again — `entry-store.ts`'s `#assertNoDerivedWrite` — reads the same one
 *  instead of looking the key up a second time. */
export function assertFieldTakesWrite(
  field: FieldKey,
  declared: Field | undefined,
  operation: string,
): Field {
  if (declared === undefined) throw new UnknownFieldError(field, operation);
  if ('compute' in declared) throw new ComputedFieldCannotBeWrittenError(field, operation);
  if (!isApiEditable(declared)) throw new FieldNotEditableError(field, operation);
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
 *  Everything else is the Field's own `editable`, read at the grid threshold. A Field that declares
 *  nothing is editable: `'anywhere'` is the default (ADR 0015). */
export function libraryWriteRule(hasChildren: boolean, field: Field): FieldWriteVerdict {
  if (resolveWriteTarget(hasChildren, field) === 'refused') return DERIVED;
  return isUserEditable(field) ? WRITABLE : NOT_WRITABLE;
}
