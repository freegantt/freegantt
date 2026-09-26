---
status: accepted — verdict pending (this build). Amended by [0036](0036-an-undo-keeps-a-foreign-write.md) —
  an undo or a redo now keeps a value a sync wrote since, instead of overwriting it. Amends [ADR 0015](0015-what-the-write-door-refuses.md),
  [ADR 0034](0034-sibling-order-is-a-field.md) (undo and redo renumber the sibling groups they touch)
  and the rule that replay never re-runs the Rollup (undo and redo now re-roll the parents they touch).
decided: `entries.sync(list)` writes through the same write door `entries.load()` uses, not through
  `entries.update()`. A `'never'` lock does not refuse it, a derived parent cell re-rolls instead of
  taking an authored value, and no `EditExtender` cascade runs. `beforeChange` can still veto the
  whole call. Unlike `load`, sync does not clear History: it records no undo step of its own, and it
  erases no Redo. Undo and redo write each row onto the store's current value, so undoing a user edit
  overwrites a value a sync wrote since, and redo gives the server's value back in turn.
open: none.
---

# Sync writes like load, and undo stays local

## Context

`entries.load(list)` (#496) replaces a Dataset's whole state from a list. It clears History instead
of recording it. `entries.sync(list)` (#517) also makes a live Dataset match a full list, but it
keeps per-entry state for a kept id.

Both doors must answer the three questions ADR 0015 answered for `entries.update()`: does a
`'never'` lock refuse the write, does a derived cell keep an authored value, and does a cascade run.
`load` already answers all three by writing straight through `commitChangeSet`, which runs no
extension hook and checks no per-field lock — it never passes through `entries.update()`'s own door.
Sync needs its own record because it writes through that same door, a second path outside
`entries.update()`, not a variation of ADR 0015's rule for it.

A second question sits beside the write-door one: what does a sync do to History? An earlier build
of this record had sync record one undo step, the same posture a user edit takes. Building it
exposed a cost that posture did not pay for: recording a sync as a step makes `undo()` reverse data
the server sent, not data the user wrote; it erases Redo on every poll, even one that changed
nothing the user touched; and a frequent poll fills the stack with server writes, pushing the user's
own edits off it. A server refresh is not a user's undoable act.

## Decision

Sync writes through the door `load` uses, not through `entries.update()`. So:

1. **A `'never'` lock does not refuse a sync.** The lock check lives in `entries.update()`'s door;
   sync and `load` do not pass through it.
2. **A derived parent cell re-rolls.** Sync's own Rollup pass recomputes it after the write, the same
   as `load` and construction. An authored value for a derived cell is dropped, the same way `load`
   drops one.
3. **No `EditExtender` cascade runs.** A cascade is an `entries.update()` behavior; sync writes its
   ChangeSet directly.
4. **`beforeChange` can still veto the whole call.** A veto leaves the store and History exactly as
   they were, the same as any other commit.
5. **History records no step for a `'sync'` commit, and erases no Redo.** A write the user did not
   make does not enter the undo stack. The user's own earlier steps stay undoable across any number
   of syncs, and Redo survives one.
6. **Undo and redo write each row onto the store's current value, not onto a frozen snapshot.**
   `dataset.replay(changeSet)` follows the same rule, since undo and redo are built on it. Concretely:
   - A Field row overwrites the current value: undoing an edit writes the value the edit replaced,
     even when a sync has since changed that Field. Redoing the step then writes back whatever undo
     just replaced — so undo followed by redo always ends on the server's newer value, the same
     result a fresh sync would give. A row for an id or a Field no longer present writes nothing,
     and raises no report.
   - An added row whose id already exists (the server re-sent it since) is skipped: the server's
     copy stays, and raises no report.
   - Undo of an add also removes the children the server put under that entry since, the same as
     `remove()` — so no entry is left with a parentId that names a removed id.
   - The tree stays sound: a replayed `parentId` that would close a loop, or that names an id
     absent after the replay, is dropped rather than stored; a re-added entry whose old parent is
     gone lands as a root instead.
   - The sibling groups an undo or a redo touches are renumbered once, in the same commit, so the
     group stays dense and one move stays one undo step (amends ADR 0034's "written exactly as
     given, with no renumbering of their own" for `undo`/`redo`/`replay`).
   - The Rollup runs once, over the store as this step leaves it, before the step commits, so a
     rolled-up parent is never left stale (amends the rule that replay never re-runs the Rollup).
     The extension hook still never runs: an engine whose cascade rule changed between library
     versions cannot rewrite History.
   - A step left with nothing to write is forgotten. `undo()`/`redo()` then move on to the step
     before or after it, within the same call, so a click always does something when the stack is
     not empty.

## Consequences

- Plain undo and redo, with no sync in between, write exactly the rows they always did — the rules
  above only add rows once a sync has changed the store since a step was recorded.
- A local edit the server has not seen is overwritten by a sync, last write wins. Undoing the edit
  writes the value the edit replaced, and redo gives the server's value back.
- `dataset.replay(changeSet)` carries the same rules as `undo()`/`redo()`, since a consumer's own
  History is built on it.
- A `beforeChange` veto can still refuse an `'undo'`/`'redo'` step. A lock a server sets through a
  sync can make that refusal permanent for that one step; a consumer's own lock plugin closes this
  by letting `'undo'` and `'redo'` through, the way the harness lock does. Core keeps the veto rule
  unchanged, and History still keeps a step a veto refuses.
- A consumer's exhaustive `switch` over `ChangeOrigin` breaks at compile time when a case is missed.
  This is pre-release, and the API report shows the change.

## Rejected alternatives

- **Record the sync as an undo step.** This build's earlier decision; reversed here because it
  reverses server data on undo, erases Redo on every poll, and fills the stack with writes the user
  never made.
- **Clear History on every sync**, the same as `load`. Rejected: the user's own edits made before a
  poll would become unrecoverable on the next poll, which is a worse surprise than an overwrite.
- **Skip a row that conflicts with a later sync (a partial undo).** Rejected: a step that applies
  only part of itself is a new, unrecorded kind of edit, and the consumer has no way to see which
  part landed.
- **Drop a step ahead of time once a sync would conflict with it.** Rejected: the same information
  loss as clearing History, aimed at one step instead of the whole stack.
- **Rebase the stack's recorded rows onto the server's new state**, the way a version-control rebase
  moves a change onto a new base. Rejected: a rebase rewrites every recorded step at each sync, even
  when the user never undoes anything. This record changes a step only when an undo or a redo
  actually runs it.

## Out of scope

- The diff that decides which rows a sync writes. That is `entries.sync`'s own contract (#517), not
  a write-door question.
- A partial update, a skip-undo rule, and conflict detection. Filed separately (#527, #419, and the
  withdrawn `apply` door).
- A lock-aware exception to the `beforeChange` veto risk above. Resolved in the harness lock
  plugin, not in core: see the "Consequences" note above.
