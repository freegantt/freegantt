---
status: accepted — ruled and built 2026-09-13, out of [#331](https://github.com/Pawel-IT/FreeGantt/issues/331) (successor to the pinning half, [#299](https://github.com/Pawel-IT/FreeGantt/issues/299)). Working material: `src/data/cyclic-hierarchy.test.ts`, `src/api/hierarchy-source.test.ts`, `src/data/fields/field-access.test.ts`.
decided: `entry.read('parentId')` answers the stored value, uniformly, on every door — the special case [0017](0017-the-entry-answers-questions-about-itself.md) gave it is reversed. The tree keeps its own by-key door instead: `hierarchyParentId`, a new core Field, computed from the same checked hierarchy the Rollup already reads, never stored.
open: nothing. [#336](https://github.com/Pawel-IT/FreeGantt/issues/336) tracks reconsidering the name `hierarchyParentId` later; it is not a blocker.
---

# `parentId` answers the stored value, on every door

**Reverses one ruling inside [0017](0017-the-entry-answers-questions-about-itself.md).** That ADR is not rewritten — see the notice at its top. Everything else in it stands, `read()` as the one by-key value door included.

## Context

0017 ruled that `entry.read('parentId')` answers `parent()?.id` — the tree's answer, checked against cycles and dangling ids ([0020](0020-a-plugin-may-own-the-hierarchy.md)) — rather than the raw stored field. The reasoning at the time: `parentId` is a core Field, so `read` must answer it like any other key, and a live row that answered the stored field there would disagree with its own `parent()` the moment a plugin owns the hierarchy.

[#299](https://github.com/Pawel-IT/FreeGantt/issues/299) found the cost of that ruling. `entry.read('parentId')` and `ctx.read('parentId')` — the by-key door a `compute` Field reaches through `ComputeContext` — answered two different things for the same row: `entry.read` walked the checked hierarchy, while `ctx.read` (through `readField`/`field-access.ts`) answered the raw stored value, because nothing had wired the checked answer into that path. **One key, two doors, two answers.** That is exactly the split [0017](0017-the-entry-answers-questions-about-itself.md)'s own closing line forbade: *"one row, one tree, whichever door you ask through."*

A second cost sat beside it. `data/rollup.ts`'s `collectTouchedIds` reads a **pre-transaction** `StoredEntry`, never a live `Entry`, to find a moved row's former parent — [0020](0020-a-plugin-may-own-the-hierarchy.md) requires this, because a live `parent()` would answer the *new* parent and a move would leave a stale aggregate behind. That site was always going to read the stored field, or something equivalent to it, on a row that cannot build a live `Entry` at all. The special case on `read('parentId')` was never something every reader of the tree could actually get to.

## Decision

**`read('parentId')` answers the stored value, like every other key, on every door.** `src/data/live-entry.ts`'s `read()` drops its `if (field === 'parentId')` branch; the mirror in `src/layout/entry-double.ts` (a test double) drops with it. The write side does not move: `update(id, { parentId })` still writes the stored field, exactly as it always did.

**The tree gets its own by-key door: `hierarchyParentId`.** A new core Field, modeled on `duration` — computed, never stored, with its own grid column:

```ts
{
  key: 'hierarchyParentId',
  compute: (_entry, ctx) => ctx.hierarchyParentId(),
  column: { header: 'Parent', width: 120 },
},
```

`ComputeContext` gains a matching member, `hierarchyParentId(): EntryId | undefined`, implemented in `createComputeContext` (`src/data/fields/field-access.ts`) against the same source `entry.parent()` reads — the store's checked, committed index when the row is committed, and the raw hierarchy source's answer for a row inside an open transaction, guarded the same way `LiveEntry.parent()` already is. The Rollup's own pass reads it through a parallel wiring, `readingParentFrom`, so a rolling-up parent's `hierarchyParentId` never lags behind an edit the pass itself is computing — the same reason `readingChildrenFrom` exists for `ctx.children()`.

**`entry.read('parentId')` and `entry.read('hierarchyParentId')` now answer two different, and sometimes disagreeing, questions on purpose.** `parentId` is what was authored. `hierarchyParentId` is what the tree, checked, currently says — the same answer `entry.parent()?.id` gives. Under no plugin and no dangling or cyclic link, the two agree. A plugin-owned hierarchy ([0020](0020-a-plugin-may-own-the-hierarchy.md)), a dangling `parentId`, or a `parentId` cycle are exactly the three cases where they diverge, and now every door agrees about which case it is looking at.

## Why not keep `parent()` as the only tree door and leave `read` alone

That was 0017's own position, and reversing it costs a second core Field and a second grid column. It is worth the cost because `parent()` cannot serve every caller. A generic reader that holds a `FieldKey` and not a member name — a Grid column, a serializer, a `values()` fold, a `compute` Field's own `ctx.read` — has no way to ask `parent()`. [0017](0017-the-entry-answers-questions-about-itself.md) already made this argument once, for exactly this reason: *"`read('parentId')` exists for the generic caller — a column, a serializer, a `values()` fold — that holds a key and not a member name."* `hierarchyParentId` is that argument, applied to the tree's own answer instead of the stored one.

## Why `ComputeContext` still does not get a live-`Entry`-shaped view

0017 refused this once already, for the Rollup and the ChangeSet: *"two things implement `Entry`, a reader cannot tell which one they hold, and `entry.parent()` walks out of the pass into the store and mixes two states with no warning."* That reasoning does not weaken here. A `compute` Field's `ctx` still binds to a row the store may not hold — an effective child mid-rollup, a post-edit row mid-diff — and a live `Entry`'s `parent()` would walk out of that row into the committed store, silently mixing two states. `ctx.hierarchyParentId()` stays a plain method that answers from the pass's own effective hierarchy, never a live-row member.

## Cross-door invariant

**For every declared Field, every reading door agrees on a committed row: `entry.read`, `ctx.read`, `toInput()`, the stored value, and the `ChangeSet`.** This is now `plans/01-domain-architecture.md` §11's I15, and `src/data/fields/field-access.test.ts` is where it is tested. A `compute` Field — `hierarchyParentId` included — is not one of these doors: it never stores, so it never appears in `toInput()` or in a `ChangeSet` row.

## Documentation, concretely

Mid-transaction, `dataset.entries.update('task', { parentId: 'ghost' })` followed by `entry.parent()` and `entry.read('hierarchyParentId')` both refuse the dangling id and answer `undefined`, while `entry.read('parentId')` answers `'ghost'` — what was authored. `data/rollup.ts`'s `collectTouchedIds`, reading the same pre-transaction `StoredEntry.parentId` [0020](0020-a-plugin-may-own-the-hierarchy.md) already requires, was doing the equivalent of this all along: reading the raw field, on a row that cannot build a live `Entry`. `#299`'s bug was the same class, showing up quietly on `entry.read('parentId')` before this fix, rather than on a site everyone already knew reads the stored value on purpose.

## Consequences

**`src/data/cyclic-hierarchy.test.ts` and `src/api/hierarchy-source.test.ts`** carried tests pinned to the pre-fix divergence ([#310](https://github.com/Pawel-IT/FreeGantt/issues/310)), by design, so they would go red the moment this reversal landed. Both are rewritten to assert the new, agreeing behavior on `parentId`, and the new, still-diverging behavior on `hierarchyParentId` versus `parent()`.

**`plans/02-public-api.md`** gains one sentence each in the `read()` section and the hierarchy-source section, naming the split. **`CONTEXT.md`** updates its *Hierarchy* and *Hierarchy source* entries and gains a `hierarchyParentId` glossary entry — required before the name ships (naming skill, five checks passed against those two terms; [#336](https://github.com/Pawel-IT/FreeGantt/issues/336) tracks reconsidering it later, not a blocker). **`plans/row-redesign/BUILD-LOG.md`**'s `J9` entry notes the reversal: it already predicted this exact fix.
