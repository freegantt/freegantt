# Worklist — #199, a row target names one Entry and must name all of them

**Owner:** the `s5-row-target` agent · **Branch:** `s5-row-target` · **Base:** `s5-start`

Tick each box **in the commit that earns it**, not at the end. A box and its code land together, so
`git log` and this file never disagree. The background is in
[`handoff-post-163-review.md`](./handoff-post-163-review.md) §2 — read it before the first box.

## The decision, already made (2026-09-05, on the issue)

> A right-click on a row acts on **every** Entry the row owns.

Verified against the command set: no first-party command is per-Entry. Row commands act on the row;
the rest are viewport, selection or history. A third-party command may still want exactly one, so the
API must leave that expressible.

## The defect

#185 made a grid-row click select every Entry a row owns. The DOM-target seam still resolves a row to
one Entry. So left-click and right-click on the same row now mean different things: the menu runs on
the first Entry while the visible selection holds three.

## Keep this

`data-entry-id` on a row is **correct**. It names the row's *subject* — the Entry whose Fields the
cells format, which `GanttDom.cellFor` and the inline editor anchor on. Do not repurpose it. The gap
is that the target type cannot carry the others.

## Boxes

- [x] `DomTarget.entry` grows to carry every Entry the row owns (`src/view/gantt-dom.ts:52`) — the
      seam that has to grow first
- [x] `ContainerDom.#resolve` and `#entryOfRow` answer with all of them (`gantt-dom.ts:213`, `:226`)
- [x] `CommandTarget` renamed and re-shaped (`src/api/command.ts:20`) — see **Naming** below
- [x] `commandTargetOf` maps the new shape (`src/extensions/features/context-menu.ts:32`)
- [x] A test pins that a right-click on a row owning three Entries reaches three
- [x] A test pins that a command wanting exactly one can still say so
- [x] `plans/02-public-api.md` records the new `CommandTarget` (and `CONTEXT.md`'s **DOM target**
      entry, which quoted the old shape too)
- [x] `pnpm verify` green, `pnpm test:e2e` green — 104 guard / 586 node / 817 dom, 69/69 e2e.
      `pnpm api-report` is the one exception, by instruction: `CommandTarget` and `DomTarget` both
      changed shape, so `etc/freegantt.api.md` is stale until the coordinator regenerates it.

## Naming, which is half the work

`CommandTarget.rowId?: EntryId` is wrong twice: it names a **row** while carrying an **Entry** id, and
it is singular where a row owns several. This repo has a distinct `RowId` brand, so the confusion is
not hypothetical.

Use the `naming` skill. Write the `when` clause a command author types, read it in English, and only
then settle. Two constraints from the decision:

1. A command acting on everything reaches every Entry **without re-deriving the row's contents**.
2. A command wanting one can still say so.

`CommandTarget.columnKey` is already `field` (#194, `229c1c1`), so the interface quoted in the issue
is stale. Breaking it again is fine — nothing has shipped and CLAUDE.md permits it.

**Settled: `entryIds: readonly EntryId[]`, on both `DomTarget` and `CommandTarget`.** The call site
that decided it is the one a command author types:

```ts
when: (ctx) => ctx.target?.entryIds.length === 1,
run:  (ctx) => ctx.target?.entryIds.forEach((id) => locks.lock(id)),
```

Read aloud: *"when the target names exactly one entry id"*, and *"lock every entry id the target
names."* Both are true sentences, and the second constraint needs no second member.

Why not the other candidates:

- `entries` fails the search test and the one-meaning test. `Dataset.entries` is the Store,
  `CustomRowInput.entries` is an array, and `context-menu.ts` already holds a local `entries` of
  `MenuEntry`.
- `ownedEntries` reuses `owns`, which `GanttDom.owns(node)` spends on a different question in the
  same file.
- `rowEntries` is false on a bar target, which owns no row.

`entryIds` is the word the row plan already uses — `PlannedRow.entryIds`, `CustomRow.entryIds`,
`FrameRow.entryIds` — and the word #185 chose for the same set on the interaction side
(`selectedEntryIds`). One word, one concept, five surfaces.

`entry` stays, and its doc now says what it is: the **subject**, the one Entry whose Fields the
node's content shows. Two members, because a row target answers two different questions.

## What this cost outside the worklist's own files

Two files on the `s5-errors` agent's list had to change, because `ContainerDom` reads its Entries
from the layout and only `GanttShell` holds both. The whole collision is three lines, all in
`src/view/gantt-shell.ts`:

1. `new ContainerDom(...)` gains a fifth argument — `(id) => this.#layout.entryIdsForRow(id)`.
2. `GanttShellWiring.buildCommandContext`'s `target` parameter gains `entryIds: readonly EntryId[]`.
3. The one literal that fills it, for a focused header cell, gains `entryIds: []`.

Nothing else in that file moved. The coordinator merges `s5-row-target` before `s5-errors`, so a
conflict here shows up in the second merge.

## Do not touch

`etc/freegantt.api.md` (generated; the coordinator regenerates it at merge), `plans/00-overview.md`
(unowned and unresolved), and every file on the `s5-errors` agent's list — `model/errors.ts`,
`data/transaction.ts`, `view/gesture-pipeline.ts`, `view/entry-gesture-context.ts`, `view/styles.ts`,
`extensions/plugin-runtime.ts`, `extensions/features/inline-editing.ts`, `harness/editing.ts`.
