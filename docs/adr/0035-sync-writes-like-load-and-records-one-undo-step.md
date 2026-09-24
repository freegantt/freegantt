---
status: accepted — verdict pending (this build). Amends [ADR 0015](0015-what-the-write-door-refuses.md).
decided: `entries.sync(list)` writes through the same write door `entries.load()` uses, not through
  `entries.update()`. A `'never'` lock does not refuse it, a derived parent cell re-rolls instead of
  taking an authored value, and no `EditExtender` cascade runs. `beforeChange` can still veto the
  whole call. Unlike `load`, sync records one undo step covering the rows that changed, and erases
  Redo — the same posture a user edit takes.
open: none.
---

# Sync writes like load, and records one undo step

## Context

`entries.load(list)` (#496) replaces a Dataset's whole state from a list. It clears History instead
of recording it. `entries.sync(list)` (#517) also makes a live Dataset match a full list, but it
keeps per-entry state for a kept id and records the change as one undo step.

Both doors must answer the three questions ADR 0015 answered for `entries.update()`: does a
`'never'` lock refuse the write, does a derived cell keep an authored value, and does a cascade run.
`load` already answers all three by writing straight through `commitChangeSet`, which runs no
extension hook and checks no per-field lock — it never passes through `entries.update()`'s own door.
Sync needs its own record because it writes through that same door, a second path outside
`entries.update()`, not a variation of ADR 0015's rule for it.

## Decision

Sync writes through the door `load` uses, not through `entries.update()`. So:

- **A `'never'` lock does not refuse a sync.** The lock check lives in `entries.update()`'s door;
  sync and `load` do not pass through it.
- **A derived parent cell re-rolls.** Sync's own Rollup pass recomputes it after the write, the same
  as `load` and construction. An authored value for a derived cell is dropped, the same way `load`
  drops one.
- **No `EditExtender` cascade runs.** A cascade is an `entries.update()` behavior; sync writes its
  ChangeSet directly.
- **`beforeChange` can still veto the whole call.** A veto leaves the store and History exactly as
  they were, the same as any other commit.

Unlike `load`, sync does not clear History. It records one undo step covering only the rows that
changed, and it erases Redo — the same posture a user edit takes. A sync with no changes commits
nothing: no step is recorded, and `change` does not fire.

## Consequences

- A consumer who wants a server write with no undo step still calls `load`.
- A lock plugin that refuses a `'never'` write at `entries.update()`'s door does not see a sync. A
  consumer who must block a server write on a locked row needs its own `beforeChange` check.
- Frequent syncs push older undo steps off the history stack, the same way frequent user edits do.

## Out of scope

- The diff that decides which rows a sync writes. That is `entries.sync`'s own contract (#517), not
  a write-door question.
- A partial update, a skip-undo rule, and conflict detection. Filed separately (#527, #419, and the
  withdrawn `apply` door).
