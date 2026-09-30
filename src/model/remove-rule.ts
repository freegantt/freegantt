// model/ — the remove rule (#611). `entries.remove(id)` takes an Entry's whole subtree with it, and
// nothing answered "may this Entry, or one under it, be removed". The place rule (ADR 0038) is the
// precedent: a `FieldEditable` answer, composed with `next`, read once per Entry the write touches.
//
// Types only, like `place-rule.ts`; `data/write-rule.ts` holds the resolver that reads one and
// core's own rule (every removal answers `'anywhere'`, until the core lock composes onto it).

import type { EntryId } from './ids.js';
import type { FieldEditable } from './field.js';
import type { FieldLockQuery } from './field-lock.js';

/**
 * One Entry a removal takes with it: the top id `entries.remove()` was called with, or one member
 * of its subtree. `currentParentId` is the Entry's own parent as the hierarchy source answers it
 * now — `undefined` for a root Entry, the same meaning `PlaceQuery.currentParentId` carries.
 *
 * `entry` is the same `FieldLockQuery` shape a lock rule and a place rule both read — a rule that
 * already knows how to answer "is this Entry, or one of its descendants, locked" reads the identical
 * shape here.
 */
export interface RemoveQuery {
  readonly entry: FieldLockQuery;
  readonly currentParentId: EntryId | undefined;
}

/**
 * Does a plugin's own rule let this Entry be removed? A rule always answers — no opinion on this
 * removal calls `next(removal)` rather than falling through in silence, the same contract a
 * `PlaceRule` keeps.
 *
 * `entries.remove(id)` asks this once for `id` and once for every member of its subtree — the
 * narrowest of every answer is the removal's own (`'never'` < `'api'` < `'anywhere'`), so removing
 * an unlocked parent that holds one locked descendant refuses too: that removal would still destroy
 * a locked row.
 */
export type RemoveRule = (removal: RemoveQuery) => FieldEditable;

/**
 * How a plugin claims the seam, composing onto the current occupant the way `PlaceRuleWrapper` does:
 *
 * ```ts
 * ctx.edits.setRemoveRule((next) => (removal) =>
 *   isLocked(removal.entry.id) ? 'api' : next(removal));
 * ```
 *
 * That reads: set the remove rule — removal of a locked Entry opens to the API only, else ask the
 * next rule.
 */
export type RemoveRuleWrapper = (next: RemoveRule) => RemoveRule;
