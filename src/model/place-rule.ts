// model/ — the place rule (ADR 0038). A lock rule (`field-lock.ts`) answers one cell of the Entry
// that moves; nothing answered "may this Entry land under parent P". This seam does, so a cross-parent
// drop — an Entry carried into or out of a parent — has somewhere to refuse, the same way a locked
// cell already does.
//
// Types only, like `field-lock.ts`; `data/write-rule.ts` holds the resolver that reads one and core's
// own rule (every place answers `'anywhere'`, until the core lock composes onto it).

import type { EntryId } from './ids.js';
import type { FieldEditable } from './field.js';
import type { FieldLockQuery } from './field-lock.js';

/**
 * One place to answer about: an Entry, the parent it would land under, and the parent it sits under
 * now. `parentId` is `undefined` for a place at the root; `currentParentId` is `undefined` for a
 * root Entry, and for one `entries.add()` has not placed yet.
 *
 * `entry` is the same `FieldLockQuery` shape a lock rule reads — a rule that already knows how to
 * answer "is this Entry, or one of its descendants, locked" reads the identical shape here.
 */
export interface PlaceQuery {
  readonly entry: FieldLockQuery;
  readonly parentId: EntryId | undefined;
  readonly currentParentId: EntryId | undefined;
}

/**
 * Does a plugin's own rule let this Entry land here? A rule always answers — no opinion on this
 * place calls `next(place)` rather than falling through in silence, the same contract a
 * `FieldLockRule` keeps (§1.3, #473's ocr finding).
 *
 * Asked once for a cross-parent move and once for a same-parent one (`entries.update()`'s
 * `siblingIndex` alone, or `add()`'s own group) — a same-parent answer is the rule's to give, not the
 * seam's, so a plugin decides whether children may reorder under a locked parent.
 */
export type PlaceRule = (place: PlaceQuery) => FieldEditable;

/**
 * How a plugin claims the seam, composing onto the current occupant the way `FieldLockRuleWrapper`
 * does:
 *
 * ```ts
 * ctx.edits.setPlaceRule((next) => (place) =>
 *   isLocked(place.parentId) ? 'api' : next(place));
 * ```
 *
 * That reads: set the place rule — a place under a locked parent opens to the API only, else ask the
 * next rule. Answering `'api'` on `currentParentId` refuses giving up a child the same way answering
 * it on `parentId` refuses taking one in.
 */
export type PlaceRuleWrapper = (next: PlaceRule) => PlaceRule;
