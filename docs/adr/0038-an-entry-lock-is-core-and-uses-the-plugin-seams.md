---
status: accepted — ruled 2026-09-28/29. Amends [ADR 0015](0015-what-the-write-door-refuses.md) — a
  lock rule always answers; `undefined` silence retires. Amends
  [ADR 0034](0034-sibling-order-is-a-field.md) — an explicit move also asks the place rule below; the
  renumber and the Rollup still write past a lock. Working material:
  `plan-612.md` (issue #612). Amended 2026-09-30
  ([#638](https://github.com/freegantt/freegantt/issues/638)) — a lock protects only its own row.
  The core place rule retires. A new bar move rule answers whether the bar of an Entry moves. Core
  installs its rules before every plugin, so a plugin can change the core lock.
decided: `locked` is a core Field (§"The public API a consumer meets"). Core installs its own lock
  rule, remove rule and bar move rule before every plugin, as the innermost occupant. A plugin wraps
  each one and can narrow or widen it, the same way a lock rule wraps a Field's own `editable`. A
  locked Entry protects only itself: its cells, its bar and its own delete. Its children stay free.
  A plugin still locks a cell or a subtree. A place rule seam (`ctx.edits.setPlaceRule`) answers
  whether an Entry may land under a given parent. A bar drag, a grid row drag, and `entries.update()`/
  `add()` all ask it, so one resolution gates preview and commit (I14). A lock rule always answers now — no
  opinion is `return next(query, field)`, never `undefined` — so a narrowing rule can only tighten the
  chain below it, never widen a Field the rest of the chain already refused. The lock stops only the
  user; `entries.update()`, `add()`, an `EditExtender` cascade, `load`, `sync`, undo, redo, the
  sibling renumber (ADR 0034) and the Rollup all still write past it.
open: none. The step-11 door shipped as `rulesChanged` (`src/api/dataset-plugin.ts`). Issue #611
  (Delete on a locked row, or on its child, passes) is out of this record's scope. ADR 0039 fixes it.
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
{ key: 'locked', type: 'boolean', equals: byReference, inputType: 'checkbox', editable: 'anywhere', column: { header: 'Locked', align: 'center', width: 80 } }   // a core Field

new Dataset({ entries: [{ id: 't2', name: 'Pour', locked: true }] });
dataset.entries.update('t2', { locked: true });       // lock — one commit, one undo step
dataset.entries.update('t2', { locked: undefined });  // unlock — toInput() then carries no key
entry.read('locked') === true;                         // is it locked
```

No method, no option: `locked` is a Field, the one door that already exports, loads, syncs, undoes,
and raises `change`. `editable: 'anywhere'` and a checkbox editor mean a lock toggle is a normal app
need. The Field has a default column, but the default grid does not list it. An app that lists
`'locked'` in `gridColumns` gives the user a toggle. The core lock leaves that cell open, so the user
can unlock a row. An app that wants a read-only lock column closes it with `capabilities.edit` or a
lock rule.

### A new seam: the place rule

```ts
// src/model/place-rule.ts
export interface PlaceQuery {
  readonly entry: FieldLockQuery;          // the Entry that moves
  readonly parent: FieldLockQuery | undefined;        // the parent it lands under; undefined is the root
  readonly currentParent: FieldLockQuery | undefined; // the parent it sits under now
}
export type PlaceRule = (place: PlaceQuery) => FieldEditable;
export type PlaceRuleWrapper = (next: PlaceRule) => PlaceRule;
```

`ctx.edits.setPlaceRule(wrap)` installs it, legal only while `data()` runs, composing the same way
`setLockRule` does. It answers the three-door vocabulary I14 already uses (`'anywhere'`/`'api'`/
`'never'`), asked once by `EntryStore.#updateFrom` and `EntryStore.add` for an explicit move, and once
by `view/capability.ts`'s `canPlace` for a gesture preview — one resolver, `placeAnswerFor` in
`src/data/write-rule.ts`, so preview and commit never drift (I14). It is asked for a same-parent
place too, so the rule, not the seam, decides whether children may reorder under a frozen parent. The
seam answers only about the parent side of a move; the moved Entry's own `parentId`/`siblingIndex`
cells stay the lock rule's job, so the two seams never overlap.

Each parent is a `FieldLockQuery`, the same cached query a lock rule reads. A rule reads the id as
`place.parent?.id`. A rule for a subtree writes `place.parent?.isDescendantOf(root)`, with no
`ctx.dataset` lookup. `currentParent` lets a plugin write "give up a child" as one exact test. The core
lock does not use this seam. A plugin that locks a parent's children list does (§"Other locks are
plugins").

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
- Remove rule: a locked Entry answers `'api'` to a user delete (ADR 0039). A removal asks the rule for
  every member of the subtree, so a parent that holds a locked descendant refuses too.
- Bar move rule: a locked Entry answers `false`. Its own bar does not move. This covers a summary bar,
  whose dates the Rollup derives, and no cell lock can close it (§"A new seam: the bar move rule").
- Place rule: none. Core installs no place rule. A drop into a locked parent, and a drop out of it, both
  answer whatever the plugins answer. The children of a locked parent move, resize, reorder, leave and join.
- `src/data/entry-lock.ts` exports `lockedEntryLockRule(isLocked)`, `lockedEntryRemoveRule(isLocked)` and
  `lockedEntryBarMoveRule(isLocked)`. It imports from `../model/index.js` only. A dependency-cruiser rule
  enforces this. The core lock uses the same public seams a plugin uses. CI checks it, not prose.
- `src/api/dataset.ts`'s constructor installs all three rules **before** every plugin installs. The core
  lock is the innermost occupant. A plugin wraps each rule and can narrow or widen it. A plugin that
  calls `next()` leaves the core lock in force.
- `entries.update()`, `add()`, an `EditExtender` cascade, `load`, `sync`, undo, redo, the sibling
  renumber (ADR 0034) and the Rollup all still write past the lock — the lock stops a user gesture,
  never the app.

### The grid row path takes the same seam the bar drag does

A grid row drag and a bar drag already share `ResolvedCapabilities.canPlace` (`view/row-drop.ts`'s
`resolveRowDrop`, wired at `gantt-shell.ts`). A plugin's place rule changes that one seam once. A grid row
drop and a bar drop both meet the same resolution, which gates preview and commit alike.

### A plugin tells a bound Gantt its rule's answer changed

A plugin's own lock or place rule can start answering a cell differently behind a toggle it owns —
FreeGantt's own harness plugin flips one on a "today" boundary — with no `ChangeSet` for a mounted
Gantt to react to. `ctx.edits.rulesChanged()`
tells every Gantt bound to that Dataset to re-resolve its affordances on the next frame, with no
undo step of its own.

### A lock protects only its own row

A locked Entry protects three things: its cells, its bar, and its own delete. Its children stay free.
They move, resize, reorder, leave and join. A child of a locked parent may also be dropped elsewhere,
and another Entry may be dropped under the locked parent.

The old core place rule refused a drop into a locked parent and a drop out of it. That rule disagreed
with the remove rule: a user could delete an unlocked child of a locked parent, but could not drag the
same child out. One lock now has one scope. The core place rule retires, and core installs none.

The Rollup still writes a locked parent's dates when a child moves. A locked parent's summary bar still
does not move. The lock stops a user gesture on the locked row. It never stops a derived write.

### A new seam: the bar move rule

A summary bar shows dates that the Rollup derives. The user cannot write those dates, so no lock rule
on a cell can stop a drag of the bar. The old check read the core `locked` Field in `view/`. A plugin
lock could not stop the summary bar, and a plugin could not release a core-locked one. The core lock
did something that no plugin could do or undo. This seam closes that gap.

```ts
// src/model/bar-move-rule.ts
export type BarMoveRule = (entry: FieldLockQuery) => boolean;
export type BarMoveRuleWrapper = (next: BarMoveRule) => BarMoveRule;
```

`ctx.edits.setBarMoveRule(wrap)` installs it. It is legal only while `data()` runs. It composes the same
way `setLockRule` does. It answers one question: does this Entry's own bar move when a user drags it or
nudges it with the keyboard?

`true` means the bar moves, so long as the cells it writes also allow the write. `false` means the bar
does not move. The rule always answers. No opinion is `return next(entry)`. A boolean is enough here:
no app door asks this question, so the three-door vocabulary of `FieldEditable` has nothing to add.

`view/capability.ts` asks the rule through the friend function `barMovesOf`, before it builds the list
of Entries a move writes. The same answer gates the hover affordance, the drag preview and the commit
(I14). `resolveCapabilities` no longer reads the `locked` Field. The rule asks the grabbed Entry. It
also asks each descendant that the move translates, so a frozen dated child refuses the whole gesture,
the same way a locked dated child does.

The rule takes the cached `FieldLockQuery` that `editableOf` already uses and returns a boolean. It
allocates nothing on the hover path.

### The core lock is the innermost occupant

Core installs its lock rule, remove rule and bar move rule before every plugin. A plugin wraps each
one. It can answer `'anywhere'` (or `true`) to release a locked Entry, or `'never'` (or `false`) to
close it harder. The core lock is a default a plugin can change, the same as a Field's `editable`.
A plugin that calls `next()` leaves the core lock in force.

We chose the innermost place over the outermost for three reasons:

- An app that needs a different lock must be able to change the core lock. It cannot, if the core lock
  has the last word.
- A rule that nobody can override is a hidden behaviour. The bar check in `view/` was one.
- Every occupant of a seam now follows one rule: it asks `next`, then narrows or widens.

### Other locks are plugins

An app that needs a different lock composes the public seams. Core does not add an option for it.
Two lanes show this. A test builds each one from a plugin, through the public seams alone.

- Lock the whole subtree. The plugin closes every cell of the root and its descendants in `setLockRule`.
  It refuses a drop into the subtree and a drop out of it in `setPlaceRule`. It refuses a removal of any
  member in `setRemoveRule`. It freezes the root's summary bar in `setBarMoveRule`.
- Lock the children list. The plugin refuses any place whose `parent` or `currentParent` is the
  parent in `setPlaceRule`, a same-parent reorder included. It refuses a removal whose `currentParent`
  is the parent in `setRemoveRule`. The parent's own cells stay open.

To freeze one summary bar, a plugin answers `false` in `setBarMoveRule`. To release a core-locked one,
it answers `true`. `rulesChanged()` tells a bound Gantt when an answer moves with no dataset write.

## Rejected alternatives

- **A value-aware lock rule** — `(query, field, value) => FieldEditable`, so a lock rule could refuse
  based on the value being written. Rejected: the grid asks a cell's lock with no value in hand (it
  is deciding whether to paint an editor at all, before any value exists), so a value-aware answer
  splits one question into two incompatible shapes.
- **A boolean place answer.** Rejected: it cannot say "the app may, the user may not", which a plugin
  lock needs. The three-door `FieldEditable` vocabulary already exists and I14 already resolves
  through it everywhere else.
- **The core lock as a `DataPlugin` in `extensions/`.** Rejected: `api/dataset.ts` → `extensions/` →
  `api/` types is a dependency cycle (`no-circular`, `tsPreCompilationDeps: true`).
- **Installing the core lock as the outermost occupant**, after every plugin. Rejected: a plugin could
  then never widen a locked Entry, and the core lock would do something that no plugin can undo. The
  core lock is a default, so it installs first (§"The core lock is the innermost occupant").
- **Ask the lock rule about the summary bar's own dates.** Rejected: it mixes two questions. "May this
  cell change" and "does this bar move" would share one answer. A plugin that closes a derived `start`
  for a cell reason would freeze the bar by side effect.
- **A `move` capability rule.** Rejected: a capability belongs to one Gantt, and a `DataPlugin` has no
  capability to set. The lock lives in `data/`. A core `summary` variant would have to read the `locked`
  Field in `layout/`, which moves the direct read and does not remove it.
- **Keep the core place rule and add an option to switch it off.** Rejected: an option is a second door.
  The plugin seams already give an app the lane it needs.
- **A hard lock that refuses `entries.update()` too.** Rejected: the owner ruled the lock is a UI
  refusal only (the same posture Bryntum's `readOnly` and DHTMLX's `readonly` take) — app code, a
  cascade, a sync and an undo all still need to write a locked Entry's cells.

## Consequences

- `harness/plugins/lock-entries.ts` retires. A "past work is frozen" plugin replaces it: it closes
  `start`/`end` on an Entry that ends before today through `ctx.edits.setLockRule`, and refuses a
  drop into a parent whose work is all past through `ctx.edits.setPlaceRule` — a real job, still
  dogfooding both seams.
- A drop into a locked parent and a drop out of it now commit. Tests that expected a refusal change.
- `lockedEntryPlaceRule` retires from `src/data/entry-lock.ts`. `Dataset` installs no place rule.
- `PlaceQuery.parent`, `PlaceQuery.currentParent` and `RemoveQuery.currentParent` replace the id fields.
  The change is breaking, and the project has not shipped.
- `DatasetEditHook` gains `setBarMoveRule`. The bundle grows by the seam, one rule and one friend function.
- A plugin can now widen a locked Entry's cells, its delete and its bar. A plugin that needs the lock
  to hold calls `next()` and narrows only.
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
