// model/ — what a consumer, and a variant, may say about a gesture. `view/capability.ts` resolves
// these; this file only declares them. They live here for the reason `write-verdict.ts` does: the
// same vocabulary is read at two levels, and one of those levels is a `layout/` type.
//
// ADR 0018: a variant carries `capabilities?: Capabilities`, and `layout/variants.ts` declares that member.
// `layout/` may import `model/` and nothing above it (plans/01 §1), so the vocabulary moved down to
// the leaf both levels can name. Nothing else changed: `Capabilities` is still the consumer's own
// `GanttOptions.capabilities`, and `view/capability.ts` is still the one file that resolves it.

import type { Entry } from './entry.js';
import type { FieldKey } from './field-key.js';

/** A boolean pins every entry the same way; a predicate varies the answer per entry
 *  (`capabilities: { resize: (entry) => entry.read('locked') !== true }`).
 *
 *  **`undefined` means "no opinion about this entry"** (ADR 0018, `J13`). The next answer down then
 *  decides — a variant's own `capabilities` falls to the library rule, and the consumer's own `capabilities`
 *  falls to the variant's `can`. Without it, `can: { resize: (entry) => !entry.hasChildren }` would
 *  read "not on a parent" and also say **yes** to every other row, over the rule below it. That is
 *  the bug `WriteRule` already answers this way for (#256). */
export type CapabilityRule = boolean | ((entry: Entry) => boolean | undefined);

/** #256: the write rule takes the cell, because a write names one. Call:
 *  `capabilities: { edit: (entry, field) => (entry.id === 'fixed' && field === 'end' ? false : undefined) }`.
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

/** The gestures that arm and paint, plus `activate` (#434) — a click, a key, or a double-click
 *  "opening" the Entry. A write is not one of them. It is the thing a gesture, a cell editor, or a
 *  keyboard nudge sets out to do, and `canWrite` decides it. `activate` writes nothing either, so it
 *  reads the same one-resolution ladder (I14) with no `canWrite` question to ask. */
export type GestureCapability = 'move' | 'resize' | 'select' | 'activate';

/** Live (S3/S5, D-S3-9). `linkCreate` stays off this type until S7 (I11: no unimplemented public
 *  key).
 *
 *  **Two levels read one type** (ADR 0018). `GanttOptions.capabilities` is the consumer's own
 *  answer; `EntryVariant.can` is the variant's, one level under it. */
export interface Capabilities {
  move?: CapabilityRule;
  resize?: CapabilityRule;
  select?: CapabilityRule;
  /** #434: may this Entry fire `entryActivate` — a click, `Enter`, or a double-click (opt-in)
   *  "opening" it. Default `true`, and resolved independently of `select` (I14): a rollup row with
   *  `{ select: false, activate: true }` still activates though it never selects. */
  activate?: CapabilityRule;
  /** #256: the consumer's own answer to "may this cell's value change" — for a cell
   *  `Field.editable` already leaves open. It narrows an `'anywhere'` Field per entry; it never
   *  reopens an `'api'` or a `'never'` Field, no matter what it answers.
   *
   *  It gates the inline cell editor, the bar's resize handles and the bar move alike, all three
   *  through one write check (I14). Answer `undefined` for a cell this rule says nothing about. */
  edit?: WriteRule;
}
