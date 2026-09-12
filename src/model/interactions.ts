// model/ — what a consumer, and a variant, may say about a gesture. `view/capability.ts` resolves
// these; this file only declares them. They live here for the reason `write-verdict.ts` does: the
// same vocabulary is read at two levels, and one of those levels is a `layout/` type.
//
// ADR 0018: a variant carries `can?: Interactions`, and `layout/variants.ts` declares that member.
// `layout/` may import `model/` and nothing above it (plans/01 §1), so the vocabulary moved down to
// the leaf both levels can name. Nothing else changed: `Interactions` is still the consumer's own
// `GanttOptions.interactions`, and `view/capability.ts` is still the one file that resolves it.

import type { Entry } from './entry.js';
import type { FieldKey } from './field-key.js';

/** A boolean pins every entry the same way; a predicate varies the answer per entry
 *  (`interactions: { resize: (entry) => entry.read('locked') !== true }`).
 *
 *  **`undefined` means "no opinion about this entry"** (ADR 0018, `J13`). The next answer down then
 *  decides — a variant's `can` falls to the library rule, and the consumer's own `interactions`
 *  falls to the variant's `can`. Without it, `can: { resize: (entry) => !entry.hasChildren }` would
 *  read "not on a parent" and also say **yes** to every other row, over the rule below it. That is
 *  the bug `WriteRule` already answers this way for (#256). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean | undefined);

/** #256: the write rule takes the cell, because a write names one. Call:
 *  `interactions: { edit: (entry, field) => (entry.id === 'fixed' && field === 'end' ? false : undefined) }`.
 *
 *  `undefined` means "no opinion about this cell". The rules in `view/capability.ts` then answer it,
 *  and a roll-up parent's derived cell stays refused. A predicate names one cell out of every
 *  (Entry × Field) pair on the page. So no opinion is the answer it gives most of the time.
 *
 *  A bare `boolean` over that whole space made a consumer restate every library rule to lock one
 *  cell. The harness's own first call site opened every derived cell by accident.
 *
 *  `undefined` reads the same way an `Aggregator`'s does (`model/field.ts`). A `before*` handler's
 *  reads that way too. A boolean pins every cell, with no fall-through. */
export type WriteRule = boolean | ((entry: Entry, field: FieldKey) => boolean | undefined);

/** The gestures that arm and paint. A write is not one of them. It is the thing a gesture, a cell
 *  editor, or a keyboard nudge sets out to do, and `canWrite` decides it. */
export type GestureCapability = 'move' | 'resize' | 'select';

/** Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 *  key).
 *
 *  **Two levels read one type** (ADR 0018). `GanttOptions.interactions` is the consumer's own
 *  answer; `EntryVariant.can` is the variant's, one level under it. */
export interface Interactions {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
  /** #256, S5.8, D-S5-19: the consumer's own answer to "may this cell's value change". It is the
   *  one override above `Field.editable`, and the only per-entry axis that key has.
   *
   *  It gates the inline cell editor, the bar's resize handles and the bar move alike. All three
   *  write a cell (I14). `Field.editable` states which Fields are writable at all. This states which
   *  of them are writable *here*. Answer `undefined` for a cell this rule says nothing about. */
  edit?: WriteRule;
}
