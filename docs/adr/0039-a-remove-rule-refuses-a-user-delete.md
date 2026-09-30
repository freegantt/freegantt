---
status: accepted — ruled 2026-09-29. Follows the seam pattern [ADR 0038](0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md)
  fixed for the place rule. Issue [#611](https://github.com/freegantt/freegantt/issues/611).
decided: a new plugin seam, the remove rule (`ctx.edits.setRemoveRule`), answers whether
  `entries.remove()` may take an Entry — asked once for the id a caller named and once for every
  member of its subtree, narrowest answer wins. Core installs `lockedEntryRemoveRule` last, alongside
  the lock rule and the place rule, so a locked row, or a locked descendant of an unlocked row,
  refuses a user's Delete the same way a locked cell or a locked border already does. The remove rule
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
  readonly currentParentId: EntryId | undefined;
}
export type RemoveRule = (removal: RemoveQuery) => FieldEditable;
export type RemoveRuleWrapper = (next: RemoveRule) => RemoveRule;
```

`ctx.edits.setRemoveRule(wrap)` installs it, legal only while `data()` runs, composing the same way
`setLockRule`/`setPlaceRule` do. `entries.remove(id)` asks it once for `id` and once for every member
of `id`'s subtree, each with its own `currentParentId` — the same field name, and the same meaning,
`PlaceQuery.currentParentId` already carries. The narrowest of every answer wins
(`'never'` < `'api'` < `'anywhere'`), so removing an unlocked parent that holds one locked
grandchild also refuses: that removal would still destroy a locked row. `entries.remove()` throws
`RemoveRefusedError` when the narrowest answer is `'never'`, before anything stages.

A `DataPlugin` cannot set a view capability directly, so a remove rule — not a `remove` capability —
is the only place a plugin, or core, can refuse a delete: the lock lives entirely in `data/` on the
public seams, the same posture ADR 0038 set for the place rule.

### The core lock's fourth refusal

`src/data/entry-lock.ts` exports `lockedEntryRemoveRule(isLocked)` beside
`lockedEntryLockRule`/`lockedEntryPlaceRule`, importing from `../model/index.js` only — the same
dependency-cruiser rule that already holds the file to public seams checks this one too. It asks
`next` first, then narrows only `'anywhere'` down to `'api'` when the Entry is locked — never
`'never'`, so `entries.remove()` still removes a locked row; only the user-facing Delete refuses.
`src/api/dataset.ts`'s constructor installs it last, alongside the other two, so no plugin already
installed can widen a locked Entry's removal.

### What the user sees

Left to a later step: the view layer asks `removableOf` through `view/capability.ts`'s `canRemove`,
and the Delete command reports a refusal rather than throwing. This record fixes the data-and-api
seam the view step reads; it makes no view-facing decision.

## Rejected alternatives

- **A `remove` capability instead of a data-seam rule.** Rejected for the same reason ADR 0038
  rejected a value-aware lock rule: a `DataPlugin` has no view capability to set, and the core lock
  must refuse regardless of which plugins, if any, are installed.
- **Asking the rule once, for the top id only.** Rejected: an unlocked parent's subtree can hold a
  locked descendant the top-id-only ask would never see, so that removal would destroy a locked row
  with no refusal at all.

## Consequences

- Bundle growth: the seam, the core lock's fourth rule, and one error class add a small amount to
  core, tracked in `bundle-size-exceptions.md` if `check-bundle-growth` needs a row for it.
- `docs/adr/0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md`'s "Out of scope" line for #611
  is superseded by this record.
