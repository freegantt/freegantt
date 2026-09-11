// data/ — the one write resolver three questions meet at (ADR 0011, "The write resolver moves into
// data/"): does this Field exist, is it editable, is it derived here. Three arms, three owners —
// ADR 0011 moved this arm with no policy change, ADR 0013 fills the derived arm, ADR 0015 fills the
// editable arm and claims I14. Fill only the arm your own change owns.
//
// This ADR moves `libraryWriteRule` here with no policy change: it already held the editable and
// derived arms in one function, and already read `rollsUp` from `data/`. `entries.update()` keeps
// `UnknownFieldError` for the existence arm and does not call this function — ADR 0013 wires the
// derived arm, ADR 0015 wires the editable arm and claims I14.

import type { Field, WriteRefusalReason, WriteVerdict } from '../model/index.js';
import { rollsUp } from './fields/field-registry.js';

/** `model/write-verdict.ts` hosts the verdict pair under its public names, so a consumer can import
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
 *  Everything else is the Field's own `editable`, which defaults to `false`. */
export function libraryWriteRule(hasChildren: boolean, field: Field): FieldWriteVerdict {
  if (resolveWriteTarget(hasChildren, field) === 'refused') return DERIVED;
  return field.editable === true ? WRITABLE : NOT_WRITABLE;
}
