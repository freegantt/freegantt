// model/ — the bar move rule. A summary bar shows dates that the Rollup derives. A user cannot
// write those dates, so no lock rule on a cell can stop a drag of that bar. This seam answers
// one question about the bar itself: does the bar of this Entry move?
//
// Types only, like `place-rule.ts`. `data/write-rule.ts` holds the open bottom occupant.

import type { FieldLockQuery } from './field-lock.js';

/**
 * Does the bar of this Entry move when a user drags it or nudges it with the keyboard?
 *
 * `true` means the bar moves, if the cells it writes also allow the write. `false` means the bar
 * does not move. The rule always answers. No opinion is `next(entry)`, the same contract a
 * `FieldLockRule` keeps.
 */
export type BarMoveRule = (entry: FieldLockQuery) => boolean;

/**
 * How a plugin claims the seam, composing onto the current occupant the way `PlaceRuleWrapper` does:
 *
 * ```ts
 * ctx.edits.setBarMoveRule((next) => (entry) => entry.id === 'phase-1' ? false : next(entry));
 * ```
 *
 * That reads: set the bar move rule. The bar of `phase-1` does not move. For any other Entry, ask
 * the next rule.
 */
export type BarMoveRuleWrapper = (next: BarMoveRule) => BarMoveRule;
