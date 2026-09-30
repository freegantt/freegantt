---
status: accepted — ruled 2026-09-29. Follows the seam pattern [ADR 0038](0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md)
  fixed for the place rule. Issue [#611](https://github.com/freegantt/freegantt/issues/611).
  Amended 2026-09-30 ([#638](https://github.com/freegantt/freegantt/issues/638)) — core installs its
  remove rule first, as the innermost occupant, so a plugin can widen it. `RemoveQuery` carries the
  current parent as a query.
  Amended 2026-09-30 ([#648](https://github.com/freegantt/freegantt/issues/648)) — a bar Delete asks
  the remove rule too, the same as a row Delete.
decided: a new plugin seam, the remove rule (`ctx.edits.setRemoveRule`), answers whether
  `entries.remove()` may take an Entry — asked once for the id a caller named and once for every
  member of its subtree, narrowest answer wins. Core installs `lockedEntryRemoveRule` before every
  plugin, alongside its lock rule and bar move rule, so a locked row, or a locked descendant of an
  unlocked row, refuses a user's Delete the same way a locked cell does. A plugin wraps it and can
  narrow or widen it (ADR 0038, "The core lock is the innermost occupant"). The remove rule
  stops only the user; `entries.remove()` itself, `load`, `syncAll`, `syncChanges({ remove })` and
  undo all still remove past it.
open: none.
---

# A remove rule refuses a user delete

## Context

[ADR 0038](0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md) gave a locked Entry three
refusals: every gesture onto its own cells, and a drop that would carry another Entry into or out of
it. It named a fourth gap and filed it out of scope: `entries.remove()` had no seam to ask at all.
A scratch probe on `main` confirmed the gap — Row Delete on a locked parent removed it and its whole
subtree, and Row Delete on a locked child removed the child, with no refusal either way. Only the
API door (`dataset.entries.remove(id)` called directly, not through a user gesture) is meant to
reach a locked row; the gesture doors — the `Delete` key and the context menu's Delete item — must
not.

## Decision

**A remove rule on the data seams, the same shape the place rule already took.**

### A new seam: the remove rule

```ts
// src/model/remove-rule.ts
export interface RemoveQuery {
  readonly entry: FieldLockQuery;
  readonly currentParent: FieldLockQuery | undefined; // the parent it sits under now
}
export type RemoveRule = (removal: RemoveQuery) => FieldEditable;
export type RemoveRuleWrapper = (next: RemoveRule) => RemoveRule;
```

`ctx.edits.setRemoveRule(wrap)` installs it, legal only while `data()` runs, composing the same way
`setLockRule`/`setPlaceRule` do. `entries.remove(id)` asks it once for `id` and once for every member
of `id`'s subtree, each with its own `currentParent` — the same field name, and the same meaning,
`PlaceQuery.currentParent` already carries. It is the cached `FieldLockQuery` a lock rule reads, so
a rule asks `removal.currentParent?.isDescendantOf(root)` with no `ctx.dataset` lookup. The narrowest of every answer wins
(`'never'` < `'api'` < `'anywhere'`), so removing an unlocked parent that holds one locked
grandchild also refuses: that removal would still destroy a locked row. `entries.remove()` throws
`RemoveRefusedError` when the narrowest answer is `'never'`, before anything stages.

A `DataPlugin` cannot set a view capability directly, so a remove rule — not a `remove` capability —
is the only place a plugin, or core, can refuse a delete: the lock lives entirely in `data/` on the
public seams, the same posture ADR 0038 set for the place rule.

### The core lock's fourth refusal

`src/data/entry-lock.ts` exports `lockedEntryRemoveRule(isLocked)` beside
`lockedEntryLockRule`/`lockedEntryBarMoveRule`, importing from `../model/index.js` only — the same
dependency-cruiser rule that already holds the file to public seams checks this one too. It asks
`next` first, then narrows only `'anywhere'` down to `'api'` when the Entry is locked — never
`'never'`, so `entries.remove()` still removes a locked row; only the user-facing Delete refuses.
`src/api/dataset.ts`'s constructor installs it before every plugin, alongside the other two. A
plugin wraps it: a plugin that calls `next()` leaves the refusal in force, and a plugin that answers
`'anywhere'` releases it.

### What the user sees

A row or bar Delete asks the remove rule for every named row first. One refused row stops the whole
Delete, so nothing is removed. The Gantt raises one `info` report, code `entry-remove-refused`, that
names the refused rows, and the harness shows it as a toast. The removals share one transaction, so
one Delete is one undo step.

## Rejected alternatives

- **A `remove` capability instead of a data-seam rule.** Rejected for the same reason ADR 0038
  rejected a value-aware lock rule: a `DataPlugin` has no view capability to set, and the core lock
  lives in `data/`, where a capability cannot reach it.
- **Asking the rule once, for the top id only.** Rejected: an unlocked parent's subtree can hold a
  locked descendant the top-id-only ask would never see, so that removal would destroy a locked row
  with no refusal at all.

## Consequences

- Bundle growth: the seam, the core lock's fourth rule, and one error class add a small amount to
  core, tracked in `bundle-size-exceptions.md` if `check-bundle-growth` needs a row for it.
- `docs/adr/0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md`'s "Out of scope" line for #611
  is superseded by this record.
