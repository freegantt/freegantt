// model/ — the per-entry lock rule (#473). `Field.editable` (`field.ts`, ADR 0015) locks a Field for
// every Entry alike. A plugin that must open one locked Field on one Entry, or on a whole subtree,
// needs an answer sharper than the Field — this is that seam, read at every write door beside it
// (I14): the grid (`view/capability.ts`), `entries.update()`, and an `EditExtender` cascade.
//
// Types only, like every other seam here; `data/write-rule.ts` holds the resolver that reads one and
// core's own rule (silence — every cell defers to `Field.editable`).

import type { EntryId } from './ids.js';
import type { FieldEditable, FieldKey } from './field.js';

/**
 * One cell's address, for a lock rule to answer about: which Entry, and whether it sits under
 * another. `isDescendantOf` walks the live hierarchy (ADR 0020), so a plugin that unlocks a whole
 * subtree writes one rule against it, not a hand-rolled walk of its own.
 */
export interface FieldLockQuery {
  readonly id: EntryId;
  isDescendantOf(ancestorId: EntryId | string): boolean;
}

/**
 * Does a plugin's own rule say this cell is locked, open to `entries.update()` only, or open to the
 * grid too? `undefined` is silence — no opinion on this cell, so the resolver falls to
 * `Field.editable` (`data/write-rule.ts`'s `resolveFieldEditable`).
 */
export type FieldLockRule = (query: FieldLockQuery, field: FieldKey) => FieldEditable | undefined;

/**
 * How a plugin claims the seam, composing onto the current occupant the way `ExtenderWrapper` and
 * `HierarchySourceWrapper` do (D-S5-23):
 *
 * ```ts
 * ctx.edits.setLockRule((next) => (entry, field) =>
 *   field === 'cost' && entry.isDescendantOf(unlockedSubtreeRootId) ? 'anywhere' : next(entry, field));
 * ```
 *
 * That reads: open `cost` under one subtree root, otherwise whatever the next rule says.
 */
export type FieldLockRuleWrapper = (next: FieldLockRule) => FieldLockRule;
