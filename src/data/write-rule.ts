// data/ — the one write resolver three questions meet at (ADR 0011, "The write resolver moves into
// data/"): does this Field exist, is it editable, is it derived here. Three arms, three owners, all
// landed — ADR 0011 moved the function here, ADR 0013 filled the derived arm, ADR 0015 filled the
// editable arm and claimed I14.
//
// Two readers ask, and one file answers both, which is what I14 buys: `view/capability.ts` asks the
// grid threshold before it opens a cell or paints a handle, and `data/entry-store.ts`'s `update()`
// asks the API threshold before it stages a write. `entries.update()` keeps `UnknownFieldError` for
// the existence arm.

import type { Field, WriteRefusalReason, WriteVerdict } from '../model/index.js';
import { editableOf, rollsUp } from './fields/field-registry.js';

/** `model/write-verdict.ts` declares the verdict pair under its public names, so a consumer can import
 *  what `view/capability.ts` republishes (F1, `ae-forgotten-export`). This file keeps its own
 *  `Field`-prefixed names as local aliases, because every call site here already reads by them. */
export type FieldWriteRefusalReason = WriteRefusalReason;
export type FieldWriteVerdict = WriteVerdict;

// One verdict object per answer, frozen and shared — `canWrite` sits behind hover affordance
// resolution, and a verdict built per hover would allocate where the hot path must not (I5).
export const WRITABLE: FieldWriteVerdict = Object.freeze({ ok: true });
export const NOT_WRITABLE: FieldWriteVerdict = Object.freeze({ ok: false });
export const DERIVED: FieldWriteVerdict = Object.freeze({ ok: false, reason: 'derived-value' as const });

/** Where a write to one cell lands. `'children'` is a Field that declared `distribute`; `'refused'`
 *  is one that did not, on a cell the Rollup owns. */
export type WriteTarget = 'entry' | 'children' | 'refused';

/** Where does a write to this Field, on an Entry with or without children, land? (ADR 0013,
 *  amendment 2026-09-11.)
 *
 *  This reads the **Field declaration** and one structural fact, and nothing about the call that
 *  asked. A write refused here is refused standalone and refused inside `dataset.transaction()`
 *  alike: grouping decides when writes land together and what one undo step covers, never what is
 *  allowed. The signal it replaced was transaction depth, and `dataset.transaction()` is public, so
 *  a consumer set it in one call (Q7, `plans/field-redesign/BUILD-LOG.md`).
 *
 *  Two readers ask, and they must agree (I14): `entries.update()` decides a write with it, and
 *  `view/capability.ts` decides whether the cell offers an editor at all. */
export function resolveWriteTarget(hasChildren: boolean, field: Field): WriteTarget {
  if (!hasChildren || !rollsUp(field)) return 'entry';
  return field.distribute ? 'children' : 'refused';
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

/** The library's own last word on a cell. It is read when neither the consumer nor a plugin speaks.
 *
 *  The Rollup pass writes a rolling-up parent's rolling-up Field off its children — a parent is any
 *  Entry with at least one child (ADR 0013: derivation is structure, not a stored classification). A
 *  user write there would commit, and the next Rollup would overwrite it. That refusal is worth
 *  words, and they are the words the cell editor has always shown. `rollsUp` is the Rollup pass's own
 *  test, so this refuses exactly the set that pass would overwrite.
 *
 *  A Field that declares `distribute` says what a write to that cell means, so the cell opens again
 *  — the write lands on the children (ADR 0013 amendment). `editable` still has the last word:
 *  a policy for the write does not make the value editable.
 *
 *  Everything else is the Field's own `editable`, read at the grid threshold. A Field that declares
 *  nothing is editable: `'anywhere'` is the default (ADR 0015). */
export function libraryWriteRule(hasChildren: boolean, field: Field): FieldWriteVerdict {
  if (resolveWriteTarget(hasChildren, field) === 'refused') return DERIVED;
  return isUserEditable(field) ? WRITABLE : NOT_WRITABLE;
}
