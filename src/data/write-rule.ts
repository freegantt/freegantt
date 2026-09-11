// data/ — the one write resolver three questions meet at (ADR 0011, "The write resolver moves into
// data/"): does this Field exist, is it editable, is it derived here. Three arms, three owners —
// ADR 0011 moved this arm with no policy change, ADR 0013 fills the derived arm, ADR 0015 fills the
// editable arm and claims I14. Fill only the arm your own change owns.
//
// This ADR moves `libraryWriteRule` here with no policy change: it already held the editable and
// derived arms in one function, and already read `rollsUp` from `data/`. `entries.update()` keeps
// `UnknownFieldError` for the existence arm and does not call this function — ADR 0013 wires the
// derived arm, ADR 0015 wires the editable arm and claims I14.

import type { BuiltInErrorCode, Field } from '../model/index.js';
import { rollsUp } from './fields/field-registry.js';

/** Why a write is refused, when the refusal is worth words. Shared with `model/error-report.ts`'s
 *  `BuiltInErrorCode` and the cell editor's own `REFUSAL_TEXT` — one spelling. */
export type FieldWriteRefusalReason = Extract<BuiltInErrorCode, 'derived-value'>;

/** May this cell's value change, and if not, is the refusal worth explaining? `view/capability.ts`'s
 *  `WriteVerdict` is this type, named for its own callers — a plugin author reads it off
 *  `ctx.interaction.canWrite`. */
export type FieldWriteVerdict =
  { readonly ok: true } | { readonly ok: false; readonly reason?: FieldWriteRefusalReason };

// One verdict object per answer, frozen and shared — `canWrite` sits behind hover affordance
// resolution, and a verdict built per hover would allocate where the hot path must not (I5).
export const WRITABLE: FieldWriteVerdict = Object.freeze({ ok: true });
export const NOT_WRITABLE: FieldWriteVerdict = Object.freeze({ ok: false });
export const DERIVED: FieldWriteVerdict = Object.freeze({ ok: false, reason: 'derived-value' as const });

/** The library's own last word on a cell. It is read when neither the consumer nor a plugin speaks.
 *
 *  The Rollup pass writes a rolling-up parent's rolling-up Field off its children — a parent is any
 *  Entry with at least one child (ADR 0013: derivation is structure, not a stored classification). A
 *  user write there would commit, and the next Rollup would overwrite it. That refusal is worth
 *  words, and they are the words the cell editor has always shown. `rollsUp` is the Rollup pass's own
 *  test, so this refuses exactly the set that pass would overwrite.
 *
 *  Everything else is the Field's own `editable`, which defaults to `false`. */
export function libraryWriteRule(hasChildren: boolean, field: Field): FieldWriteVerdict {
  if (hasChildren && rollsUp(field)) return DERIVED;
  return field.editable === true ? WRITABLE : NOT_WRITABLE;
}
