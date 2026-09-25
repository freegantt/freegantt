---
status: accepted — verdict: `verify:full PASS — all 17 checks green, test:e2e included (98s).` (2026-09-25). Amends [ADR 0035](0035-sync-writes-like-load-and-undo-stays-local.md):
  an undo or a redo no longer overwrites a value a sync wrote since. It reverses 0035's rejection of
  "skip a row that conflicts with a later sync".
decided: A replay keeps a foreign write. A Field is a foreign write when its current value is neither
  the value the step recorded nor the value the replay would write. When one Field of an entry is a
  foreign write, the replay writes no Field row of that entry. `dataset.replay(changeSet,
  { overwriteForeignWrites: true })` restores last write wins for an app's own History.
  `new Dataset({ history: false })` builds no History, so an app can own undo alone.
open: none.
---

# An undo keeps a foreign write

## Context

ADR 0035 made undo and redo write onto the store's current values. Undo of a local edit then
overwrote a value a sync brought in since, and redo gave the server's value back.

Issue #549 showed the cost in a shared plan. A colleague moves a task, and the next poll brings the
move in. The user presses Ctrl+Z to undo their own earlier edit on that task. The undo writes the
old dates over the colleague's move, and the next save sends them to the server. The user did not
see the colleague's move, so they do not know they reverted it.

Other libraries that sync shared data take the other side. A collaborative undo reverts only the
user's own changes, and it leaves a value a peer wrote in place.

ADR 0035 rejected a partial undo for two reasons:

- "A step that applies only part of itself is a new, unrecorded kind of edit."
- "The consumer has no way to see which part landed."

Neither reason holds now. A replay already writes a ChangeSet that differs from the recorded step:
it drops settled rows and gone ids, reverts loops, and adds renumber and Rollup rows. The `change`
event carries exactly the rows that landed, and History stores that ChangeSet, not the recorded one.

## Decision

1. **A replay keeps a foreign write by default.** The judgment reads values, not origins. A sync, a
   commit from another History, or any other write can make one.
2. **The unit is the entry, not the Field.** When one Field of an entry is a foreign write, the
   replay drops every Field row of that entry. So a step never lands half of a `start`/`end` pair.
   The step's other entries still land.
3. **Only the first row per entry and Field is judged.** A later row for the same key chains off the
   step's own earlier value, not off the store.
4. **`siblingIndex` is never judged.** Any sibling's move shifts that rank. The renumber pass settles
   it.
5. **Plugin store rows are never judged.** A sync never writes one.
6. **An id the step adds is never judged.** Its rows land on the entity the step brings back.
7. **A step with nothing left to write is forgotten**, as in ADR 0035. The same click moves on to the
   step before it.
8. **`dataset.replay(changeSet, { overwriteForeignWrites: true })` keeps the old rule.** It writes
   the step over a foreign write, last write wins. The built-in History never passes it.
9. **`new Dataset({ history: false })` builds no History.** `canUndo` and `canRedo` read `false`,
   and `undo()` and `redo()` do nothing. The Gantt's Undo and Redo commands turn off through their
   `when` check, so the app can bind Mod+Z to its own undo.

## Consequences

- Plain undo and redo, with no foreign write in between, write exactly the rows they wrote before.
- A local edit the server has not seen is overwritten by a sync, last write wins. An undo of that
  edit then keeps the server's value. Undo followed by redo no longer "gives the server's value
  back", because the undo wrote nothing to that entry.
- An app that wants a different rule (overwrite, or ask the user) constructs with `history: false`
  and writes its own History on `dataset.replay()`. Core grows no policy knob for each rule.
- `dataset.replay()` takes a second, optional parameter. The API report shows the change.
- The foreign-write judgment and the commit path each compare values with their own code. Issue
  #550 tracks one shared equality check.

## Rejected alternatives

- **A callback that replaces `undo()`.** The callback gets no data, because the stack is private,
  and it cannot wait on a confirm dialog.
- **Judge each Field alone.** A step that moved `start` and `end` together could land one of them
  only, and the entry's span would change shape.
- **Judge by origin (skip every value a `'sync'` commit wrote).** A later sync can write the same
  value the user wrote. Then nothing is foreign, and a value check sees that.
- **History as a plugin that is not imported when not used.** It saves about 3.6 KB gzipped, and it
  needs Rollup and renumber internals on the plugin context. `history: false` gives the app the same
  control for a one-line change.

## Out of scope

- The full move of replay onto the commit path. A research pass found it costs 6–9 days, and most of
  the replay rules have no commit-path equivalent.
- An event when `canUndo` or `canRedo` changes (#544).
