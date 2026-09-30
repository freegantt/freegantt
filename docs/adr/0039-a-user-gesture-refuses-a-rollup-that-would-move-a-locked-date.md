---
status: accepted — ruled 2026-09-29. Amends [ADR 0038](0038-an-entry-lock-is-core-and-uses-the-plugin-seams.md)
  — the core lock now also closes an ancestor's date against the Rollup, on the user-gesture side
  only. Working material: `plan-610.md` (issue
  [#610](https://github.com/Pawel-IT/FreeGantt/issues/610)).
decided: a user gesture refuses outright when the Rollup it would trigger changes `start` or `end` on
  an Entry a lock holds — moving the value later, earlier, or to any date other than the one it holds
  now. App code (`entries.update()`, `add()`), an `EditExtender` cascade, load, sync, undo and redo
  all still write a locked Entry's rolled-up dates; the lock stops only the user, as ADR 0038 already
  settled for every other cell. Every other rolling-up Field (progress, cost, and any a plugin adds)
  keeps ADR 0038's position — the lock does not reach them.
---

# A user gesture refuses a Rollup that would move a locked date

## Context

ADR 0038 closed a locked Entry's own cells and the place question — nothing may drop into or out of
a locked Entry, and nothing may edit a locked Entry's `start`/`end` directly. It did not look at the
Rollup: a parent's `start`/`end` are not the parent's own write, they are `data/rollup.ts` recomputing
them from the parent's children on every commit. A child's time drag, or a drop that reparents an
Entry, can move a locked parent's dates this way with no gesture ever naming the parent at all.

Two gaps followed, both filed as follow-ups to #612 and left out of ADR 0038's own scope:

- A child dragged past a locked parent's `start`/`end` moved it anyway — the drag only ever asked
  the child's own capability, never the parent's.
- A locked parent's own summary bar still armed a move. `canRollUpInto` answers false for a Field a
  lock holds, but `entriesMovedBy` read only `ownsField`, so a parent whose dates roll up (and so
  never "owns" them) reported `can('move')` true — a bug against ADR 0038's own rule, not a new one.

Two existing seams almost answer the question, and neither is right:

- **The place rule** (ADR 0038) answers only "may this Entry land under this parent" — a time-only
  drag never asks it, and a drop that stays under the same parent never reaches it either.
- **`canWrite`** answers "derived, refused" for every parent whose dates roll up, full stop. A common
  capability rule like `edit: (e) => !e.hasChildren` would then freeze every child's own drag too,
  which is not what a lock asks for.

## Decision

**A user gesture asks whether its own Rollup would change a date a lock holds, and refuses the whole
gesture, not just the parent's write, when it would.**

- `ResolvedCapabilities.canRollUpInto(entry, field)` answers whether a gesture, writing at
  `dataset.editableOf`'s `'anywhere'` door, may change `entry`'s `field` through the Rollup. It skips
  `canWrite`'s "derived" verdict and a common `capabilities.edit` rule on purpose — the question is
  the lock chain alone, narrowed to `'start'`/`'end'` (I14, `plans/01` §5).
- `entriesMovedBy` returns no Entry for a parent whose held date the move would touch, closing that
  parent's own summary bar (the ADR 0038 bug above).
- The gesture pipeline resolves every proposal — a move, a resize, a nudge, a reorder, and a `place`
  drop's own preview ghost — through one gate before either the preview frame or `#commit` reads it.
  The gate asks `rolledUpEditsFor` for the proposal's own draft, and refuses (`writes` empty, drop
  `{ kind: 'refused', reason: 'ancestorLocked' }`) the first time that answer touches a `start`/`end`
  `canRollUpInto` refuses. One verdict, shared by preview and commit, the same way ADR 0038's lock and
  place rules already are.
- "Hold" means the value stays — a drag that would shrink a locked ancestor's span refuses exactly
  like one that would widen it. The lock does not distinguish the two directions.
- Only `start`/`end` are in scope. `progress`, `cost`, and any rolling-up Field a plugin adds keep
  ADR 0038's existing position: the lock does not reach them, because nothing yet asks it to.
- The check runs on the rAF frame and at commit, never on every pointer-move: `session()` computes
  once, per armed gesture, whether any drafted Entry's ancestor holds a date the gesture could ever
  touch. A gesture with no such ancestor never asks the Rollup a second time for this (I5) — the same
  cost a `place` drop's own ghost already pays.

## Rejected alternatives

- **Ask the place rule.** Rejected: it answers only which parent an Entry may land under, never
  whether a date changes — a time-only drag never reaches it, and a same-parent drop never reaches it
  either.
- **Ask `canWrite`.** Rejected: it reports every rolled-up Field "derived, refused" unconditionally,
  and reads a common `capabilities.edit` rule that has nothing to do with a lock — an app's own
  `edit: (e) => !e.hasChildren` would then freeze every child's own drag, not just a locked ancestor's.
- **Re-run the Rollup on every pointer-move.** Rejected: the Rollup already runs once per rAF frame
  for a `place` drop's own ghost; asking it again on every raw pointer event would make an ordinary
  drag pay a cost only a locked ancestor needs (I5).
- **Refuse at the data layer (`entries.update()`).** Rejected: ADR 0038 already settled that the lock
  is a UI refusal, not a data one — app code, a cascade, `load`, `sync`, undo and redo must still be
  able to write a locked Entry's cells, dates included.

## Consequences

- A new `RowDropRefusal` value, `'ancestorLocked'` — the same paint (`data-drop="refused"` on the
  row and the container) as every other refusal in `view/row-drop.ts`.
- `GesturePipelineDeps` gains `canRollUpInto`; `GestureProposal` gains `asksRollup`. Neither is part
  of the public surface (`etc/freegantt.api.md` unchanged) — the change is behaviour only.
- Bundle growth: the capability check, the pipeline gate and the new refusal reason add under 1 kB
  brotli to core, tracked in `bundle-size-exceptions.md` if `check-bundle-growth` needs a row for it.

## Out of scope

- `rollUpWalkFrom` — a per-frame copy the pipeline's Rollup call still pays under a locked ancestor,
  accepted for this slice; a follow-up issue tightens it.
