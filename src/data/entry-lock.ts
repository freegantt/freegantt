// data/ — the core lock (ADR 0038), written the way a plugin writes one: two rules composed over
// the public seams `ctx.edits.setLockRule`/`setPlaceRule` expose. A dependency-cruiser rule holds
// this file to `model/` imports only, so that claim is checked by CI, not left as prose — a plugin
// author reaches nothing here that `import { ... } from 'freegantt'` could not also reach.
//
// `Dataset`'s constructor installs both, last (`api/dataset.ts`), so no plugin already installed can
// widen a cell or a border a locked Entry closes (ADR 0038).

import type { EntryId } from '../model/ids.js';
import type { FieldLockRuleWrapper } from '../model/field-lock.js';
import type { PlaceRuleWrapper } from '../model/place-rule.js';

/**
 * What does a locked Entry refuse? Every gesture onto its own cells but `locked` itself — the grid
 * closes, `can('move')` and `can('reorder')` both read false, in the timeline pane and the grid pane
 * alike. `entries.update()`, `add()`, an `EditExtender` cascade, `load`, `sync`, undo and redo all
 * still write — the lock stops only the user, never app code (ADR 0038).
 *
 * Asks `next` first, and narrows only `'anywhere'` down to `'api'`: a Field a plugin or the
 * Field's own declaration already closed to `'never'` stays closed, so this rule never widens a
 * refusal another rule already made.
 */
export function lockedEntryLockRule(isLocked: (id: EntryId) => boolean): FieldLockRuleWrapper {
  return (next) => (query, field) => {
    const answer = next(query, field);
    if (field === 'locked' || !isLocked(query.id)) return answer;
    return answer === 'anywhere' ? 'api' : answer;
  };
}

/**
 * What does a locked Entry refuse at its border? Landing a new child under it, and giving one of its
 * own children up — both narrow to `'api'`. A same-parent place is the next rule's alone to answer,
 * unconditionally: this rule defers before it ever asks whether that parent is locked, which is what
 * lets children reorder under a locked parent (ADR 0038).
 */
export function lockedEntryPlaceRule(isLocked: (id: EntryId) => boolean): PlaceRuleWrapper {
  return (next) => (place) => {
    const answer = next(place);
    if (place.parentId === place.currentParentId) return answer;
    const crossesLockedBorder =
      (place.parentId !== undefined && isLocked(place.parentId)) ||
      (place.currentParentId !== undefined && isLocked(place.currentParentId));
    if (!crossesLockedBorder) return answer;
    return answer === 'anywhere' ? 'api' : answer;
  };
}
