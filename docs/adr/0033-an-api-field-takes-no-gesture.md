---
status: accepted — verdict pending (this build). Amends [ADR 0015](0015-what-the-write-door-refuses.md).
decided: `canWrite` refuses a cell before it asks the consumer or the variant rule, whenever the
  effective `editable` is not `'anywhere'`. A derived cell refuses the same way, before those rules
  too. Neither `capabilities.edit` nor a variant's own `edit` can reopen an `'api'` or a `'never'`
  cell; only a per-entry lock rule can.
open: none.
---

# An `'api'` Field takes no gesture

## Context

`Field.editable: 'api'` says one thing: the app writes this value, and the grid does not. But
`canWrite` (`src/view/capability.ts:183`) refuses only `'never'` before it asks the consumer's rule
and the variant's rule (`capability.ts:184-187`). Either rule can answer `WRITABLE`. So
`capabilities: { edit: true }`, or a variant's `edit: true`, reopens an `'api'` cell for the grid
editor, a bar move and a resize. The library's own last word, `libraryWriteRule`
(`src/data/write-rule.ts:166-173`), runs last and would refuse the same write — the consumer rule
just never reaches it.

A rolling-up cell has the same shape of gap. `libraryWriteRule` refuses a derived `start`/`end` on a
parent, but `capabilities.edit: true` opens the resize handle first. The drag paints, and the commit
throws `DerivedFieldNotWritableError`.

ADR 0015 left this derived case out of scope on purpose: its own `capabilities.edit` ruling "touches
only the editable-lock (`'never'`) case", and names the derived trade-off as a different question for
[#470](https://github.com/freegantt/freegantt/issues/470) to answer. This record closes it, alongside
`'api'`, because both are the same question — does the data layer's refusal outrank the consumer's
rule — and #470 already answered the part that could have made a rolling-up parent's cell writable at
all: it deleted `writeToChildren` from the Field surface, so no Field can turn a derived cell into one
a consumer's write splits onto the children. What survives #470 is the summary-bar move, and it never
asked the parent's own `canWrite` — `entriesMovedBy` moves the dated descendants below a rolling-up
parent directly (ADR 0013), gated by `ownsField`'s structural answer, not by the parent cell's own
verdict. So this decision closes the resize handle and the parent's own cell, and the summary-bar move
keeps moving the descendants exactly as before.

## Decision

**The data layer's answer comes first. The consumer's rule and the variant's rule only narrow an
`'anywhere'` cell. They never widen `'api'` or `'never'`.** A per-entry lock rule
(`ctx.edits.setLockRule`, ADR 0015) still may reopen a cell — every view sees its answer, so it is
not a narrowing exception, it is the effective `editable` itself.

`canWrite` reads five questions, in this order:

1. Is there a stored home for this value?
2. What is the effective `editable`? A per-entry lock rule answers first; `Field.editable` answers
   when the rule is silent.
3. Does the library refuse this cell? A derived cell refuses. Any effective `editable` other than
   `'anywhere'` refuses.
4. What does the consumer's own rule say?
5. What does the variant's own rule say?

Step 3 answers before step 4 and step 5 now. Today it answers last, so a `'never'` refusal short-
circuits at step 2 and never reaches the derived question, while an `'api'` cell and a derived cell
both fall through to the consumer and the variant.

A gesture is any interaction write: a grid cell, a drag, a resize, a keyboard nudge, or Delete on a
bar. Every one of them asks `canWrite` through the one resolver `src/view/capability.ts` owns, and no
gesture has a write path around it, so this decision closes the gap at every gesture, not only the
grid cell.

**`'never'`: no write, from any door. `'api'`: `entries.update()` only, never a gesture. `'anywhere'`:
code and gestures both.**

## Consequences

- **`edit: true` keeps one meaning.** In `WriteRule`, `edit: true` still beats a variant's
  `edit: false` — the consumer wins over the variant (`capability.test.ts:344-350`). Its own docs
  already say "no narrowing from this Gantt", never "turn editing on". Nothing about that meaning
  changes here.
- **An `EditExtender` cascade still writes an `'api'` Field**, including one a drag starts. A cascade
  is plugin code, so ADR 0015's cascade ruling already counts it as code, not a gesture. This ADR
  does not touch that door.
- **A refusal names its reason.** `canWrite` now returns `libraryWriteRule`'s verdict for an `'api'`
  or a `'never'` cell, not a bare unexplained refusal. For an `'api'` cell with no consumer rule, the
  verdict does not change — a derived parent cell already said `'derived-value'`. One cell's answer
  does change: a `'never'` rolling-up cell on a parent now carries the `'derived-value'` reason,
  where it used to refuse with no reason at all. No shipped behavior depended on the silent refusal.
- **Delete on a bar passes over an `'api'` date the same way a drag does.** It clears `start`/`end`
  through the same `canWrite` gate a move or a resize uses, so the fix reaches it without a separate
  rule.
- **A derived cell refuses before the consumer or the variant gets a say**, the same as an `'api'` or
  a `'never'` cell. `edit: true` paints no resize handle on a rolling-up parent, and the commit that
  used to throw `DerivedFieldNotWritableError` no longer has a handle to reach it from.

## Out of scope

- **`parentId` ships `'api'`.** After this decision, no gesture may write it. A future drag-to-
  reparent gesture is refused unless a Field ships `parentId` as `'anywhere'`. That choice is not
  made here.
- `entries.update()`'s own thresholds. `data/write-rule.ts` does not change; only the order
  `view/capability.ts` reads it in changes.
- Delete on a row, undo/redo, and column gestures. `Field.editable` never governed them, and still
  does not.
