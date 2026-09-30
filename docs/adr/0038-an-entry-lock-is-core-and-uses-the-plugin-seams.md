---
status: accepted — ruled 2026-09-28/29. Amends [ADR 0015](0015-what-the-write-door-refuses.md) — a
  lock rule always answers; `undefined` silence retires. Amends
  [ADR 0034](0034-sibling-order-is-a-field.md) — an explicit move also asks the place rule below; the
  renumber and the Rollup still write past a lock. Working material:
  `plan-612.md` (issue #612).
decided: `locked` is a core Field (§"The public API a consumer meets"). Core installs its own lock
  rule and a new place rule after every plugin, so no plugin widens a locked Entry. A plugin still
  locks a cell or a subtree, and a new place rule seam (`ctx.edits.setPlaceRule`) answers whether an
  Entry may land under a given parent, asked by a bar drag, a grid row drag, and `entries.update()`/
  `add()` alike, so one resolution gates preview and commit (I14). A lock rule always answers now — no
  opinion is `return next(query, field)`, never `undefined` — so a narrowing rule can only tighten the
  chain below it, never widen a Field the rest of the chain already refused. The lock stops only the
  user; `entries.update()`, `add()`, an `EditExtender` cascade, `load`, `sync`, undo, redo, the
  sibling renumber (ADR 0034) and the Rollup all still write past it.
open: none. The step-11 door shipped as `rulesChanged` (`src/api/dataset-plugin.ts`). Follow-up
  issue #611 (Delete on a locked row, or on its child, passes) is filed and out of this record's scope.
---

# An Entry lock is core, and it uses the plugin seams

## Context

Issue [#473](https://github.com/freegantt/freegantt/issues/473) gave a plugin author a per-entry lock
rule, and the harness demoed it with its own plugin, `harness/plugins/lock-entries.ts`. Two gaps
showed up once a real consumer tried to lock a row and keep it locked through every gesture:

- **A cross-parent drop had no seam to ask.** `canPlace` (`src/view/capability.ts:285-293`) answers
  only about the moved Entry's own cells. Nothing answered "may this Entry land under parent P", so a
  locked Entry's cells refused a move, but nothing stopped another Entry from being dropped **into**
  it or pulled **out** of it. The harness plugin's own workaround —
  `query.isDescendantOf(lockedId)` closing `parentId` on every descendant — over-reached: it also
  refused a grandchild moving between two children of the locked parent, which gives up nothing.
- **A lock rule could not narrow.** `FieldLockRule` returned `FieldEditable | undefined`, and
  `undefined` meant "no opinion", falling back to `Field.editable`. A rule that answers `'api'` on a
  Field the chain has already declared `'never'` **widens** it, because the rule never saw the
  Field's own answer to narrow instead — silence and "I agree with whatever's under me" were the same
  signal, and a plugin author who wanted the second one had no way to ask for it.

Locking is also not a plugin-only concern. Bryntum's `TaskModel.readOnly` and DHTMLX's `readonly` are
both first-party, core-shipped concepts, and a FreeGantt consumer reaching for the same behaviour
should not have to write a plugin to get it.

## Decision

**A lock is a core Field, built entirely on the plugin seams a plugin author already uses.**

### The public API a consumer meets

```ts
{ key: 'locked', type: 'boolean', equals: byReference, editable: 'api' }   // a core Field, no column

new Dataset({ entries: [{ id: 't2', name: 'Pour', locked: true }] });
dataset.entries.update('t2', { locked: true });       // lock — one commit, one undo step
dataset.entries.update('t2', { locked: undefined });  // unlock — toInput() then carries no key
entry.read('locked') === true;                         // is it locked
```

No method, no option: `locked` is a Field, the one door that already exports, loads, syncs, undoes,
and raises `change`. `editable: 'api'` means the app toggles it and no grid cell edits it.

### A new seam: the place rule

```ts
// src/model/place-rule.ts
export interface PlaceQuery {
  readonly entry: FieldLockQuery;          // the Entry that moves
  readonly parentId: EntryId | undefined;  // the parent it lands under; undefined is the root
  readonly currentParentId: EntryId | undefined; // the parent it sits under now
}
export type PlaceRule = (place: PlaceQuery) => FieldEditable;
export type PlaceRuleWrapper = (next: PlaceRule) => PlaceRule;
```

`ctx.edits.setPlaceRule(wrap)` installs it, legal only while `data()` runs, composing the same way
`setLockRule` does. It answers the three-door vocabulary I14 already uses (`'anywhere'`/`'api'`/
`'never'`), asked once by `EntryStore.#updateFrom` and `EntryStore.add` for an explicit move, and once
by `view/capability.ts`'s `canPlace` for a gesture preview — one resolver, `placeAnswerFor` in
`src/data/write-rule.ts`, so preview and commit never drift (I14). It is asked for a same-parent
place too, so the rule, not the seam, decides whether children may reorder under a locked parent. The
seam answers only about the parent side of a move; the moved Entry's own `parentId`/`siblingIndex`
cells stay the lock rule's job, so the two seams never overlap.

Reading `currentParentId` turns "give up a child" into one exact test — `isLocked(place
.currentParentId)` — rather than the descendant walk the old harness plugin used, which over-reached
onto a grandchild moving between two of the locked parent's own children.

### A lock rule always answers

`FieldLockRule` returns `FieldEditable`, never `undefined`. The bottom occupant,
`fieldEditableRule`, answers the Field's own `editable` — `'never'` for an undeclared or `compute`
key. "No opinion" is `return next(query, field)`. A narrowing rule reads `const answer =
next(query, field)` and returns `answer === 'anywhere' ? 'api' : answer` — it can only tighten what
is under it, never widen a Field the chain has already refused.

### What the core lock does, and where it sits

- Lock rule: every cell of a locked Entry except `locked` itself answers `'api'` when the rest of the
  chain answers `'anywhere'`. Effect: no grid editor, no resize handle, `can('move')` false,
  `can('reorder')` false — in the grid pane and the timeline pane alike.
- Place rule: a cross-parent place answers `'api'` when `parentId` or `currentParentId` names a
  locked Entry. A same-parent place answers whatever the rest of the chain answers.
- `src/data/entry-lock.ts` exports `lockedEntryLockRule(isLocked)` and `lockedEntryPlaceRule
  (isLocked)`, importing from `../model/index.js` only — a dependency-cruiser rule enforces it, so
  the core lock is built on the same public seams a plugin uses, checked by CI and not by prose.
- `src/api/dataset.ts`'s constructor installs both **after** every plugin installs, so the core lock
  is the outermost occupant: it answers last, and no plugin can widen a locked Entry.
- `entries.update()`, `add()`, an `EditExtender` cascade, `load`, `sync`, undo, redo, the sibling
  renumber (ADR 0034) and the Rollup all still write past the lock — the lock stops a user gesture,
  never the app.

### The grid row path takes the same seam the bar drag does

A grid row drag and a bar drag already share `ResolvedCapabilities.canPlace` (`view/row-drop.ts`'s
`resolveRowDrop`, wired at `gantt-shell.ts`). The place rule changes that one seam once, so a grid row
drop and a bar drop both refuse a locked target through the same resolution that gates preview and
commit alike.

### A plugin tells a bound Gantt its rule's answer changed

A plugin's own lock or place rule can start answering a cell differently behind a toggle it owns —
FreeGantt's own harness plugin flips one on a "today" boundary — with no `ChangeSet` for a mounted
Gantt to react to. `ctx.edits.rulesChanged()`
tells every Gantt bound to that Dataset to re-resolve its affordances on the next frame, with no
undo step of its own.

## Rejected alternatives

- **A value-aware lock rule** — `(query, field, value) => FieldEditable`, so a lock rule could refuse
  based on the value being written. Rejected: the grid asks a cell's lock with no value in hand (it
  is deciding whether to paint an editor at all, before any value exists), so a value-aware answer
  splits one question into two incompatible shapes.
- **A boolean place answer.** Rejected: it cannot say "the app may, the user may not", which the core
  lock needs. The three-door `FieldEditable` vocabulary already exists and I14 already resolves
  through it everywhere else.
- **The core lock as a `DataPlugin` in `extensions/`.** Rejected: `api/dataset.ts` → `extensions/` →
  `api/` types is a dependency cycle (`no-circular`, `tsPreCompilationDeps: true`).
- **Installing the core lock as the innermost occupant**, ahead of every plugin. Rejected: a plugin
  could then widen a locked Entry by answering `'anywhere'` on a cell the core lock already closed,
  which defeats the lock. The core lock must answer last.
- **A hard lock that refuses `entries.update()` too.** Rejected: the owner ruled the lock is a UI
  refusal only (the same posture Bryntum's `readOnly` and DHTMLX's `readonly` take) — app code, a
  cascade, a sync and an undo all still need to write a locked Entry's cells.

## Consequences

- `harness/plugins/lock-entries.ts` retires. A "past work is frozen" plugin replaces it: it closes
  `start`/`end` on an Entry that ends before today through `ctx.edits.setLockRule`, and refuses a
  drop into a parent whose work is all past through `ctx.edits.setPlaceRule` — a real job, still
  dogfooding both seams.
- `entries.update(lockedId, { parentId })` now commits (the lock is a UI refusal only); the test that
  expected a data-level refusal is replaced with one that checks the gesture refuses instead.
- Bundle growth: the seam, the Field, the core lock and one error class add under 1 kB brotli to
  core, tracked in `bundle-size-exceptions.md` if `check-bundle-growth` needs a row for it.

## Out of scope

- Delete on a locked row, or on its child, passing ([#611](https://github.com/freegantt/freegantt/issues/611)) —
  fixed by [ADR 0039](0039-a-remove-rule-refuses-a-user-delete.md).
- A bar drag of a parent with a locked dated child not arming at all — the grid row drag already
  carries this; the bar drag closes with [#615](https://github.com/freegantt/freegantt/issues/615)
  (a bar's vertical drag arms on the reorder capability alone).
- An extender demo with its own job, now that `lock-entries.ts` no longer occupies
  `ctx.edits.setExtender` — follow-up [#620](https://github.com/freegantt/freegantt/issues/620).
