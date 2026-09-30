// data/ — the core lock (ADR 0038, #611), written the way a plugin writes one: three rules composed
// over the public seams `ctx.edits.setLockRule`/`setRemoveRule`/`setBarMoveRule` expose. A
// dependency-cruiser rule holds this file to `model/` imports only, so that claim is checked by CI,
// not left as prose — a plugin author reaches nothing here that `import { ... } from 'freegantt'`
// could not also reach.
//
// `Dataset`'s constructor installs all three, first (`api/dataset.ts`), as the innermost occupant.
// A plugin wraps each one and can narrow or widen it, the way a lock rule wraps a Field's own
// `editable`. A locked Entry protects only itself: its cells, its bar and its own delete.

import type { EntryId } from '../model/ids.js';
import type { FieldLockRuleWrapper } from '../model/field-lock.js';
import type { BarMoveRuleWrapper } from '../model/bar-move-rule.js';
import type { RemoveRuleWrapper } from '../model/remove-rule.js';

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
 * Does the bar of a locked Entry move? No. This covers a summary bar, whose dates the Rollup derives,
 * so no lock on a cell can close it. The children of a locked parent keep their own bars, and the
 * Rollup still writes the parent's dates. A plugin that wraps this rule can answer `true`.
 */
export function lockedEntryBarMoveRule(isLocked: (id: EntryId) => boolean): BarMoveRuleWrapper {
  return (next) => (entry) => !isLocked(entry.id) && next(entry);
}

/**
 * What does a locked Entry refuse on removal (#611)? Every removal that would take it away, whether
 * it is the id the caller named or a descendant caught in the same subtree. Narrows only
 * `'anywhere'` to `'api'`, the same test the lock rule makes: `entries.remove`
 * still removes a locked row — the lock stops only the user, never the app.
 */
export function lockedEntryRemoveRule(isLocked: (id: EntryId) => boolean): RemoveRuleWrapper {
  return (next) => (removal) => {
    const answer = next(removal);
    if (!isLocked(removal.entry.id)) return answer;
    return answer === 'anywhere' ? 'api' : answer;
  };
}
