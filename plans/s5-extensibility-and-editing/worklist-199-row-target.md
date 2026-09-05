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

- [ ] `DomTarget.entry` grows to carry every Entry the row owns (`src/view/gantt-dom.ts:52`) — the
      seam that has to grow first
- [ ] `ContainerDom.#resolve` and `#entryOfRow` answer with all of them (`gantt-dom.ts:213`, `:226`)
- [ ] `CommandTarget` renamed and re-shaped (`src/api/command.ts:20`) — see **Naming** below
- [ ] `commandTargetOf` maps the new shape (`src/extensions/features/context-menu.ts:32`)
- [ ] A test pins that a right-click on a row owning three Entries reaches three
- [ ] A test pins that a command wanting exactly one can still say so
- [ ] `plans/02-public-api.md` records the new `CommandTarget`
- [ ] `pnpm verify` green, `pnpm test:e2e` green

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

## Do not touch

`etc/freegantt.api.md` (generated; the coordinator regenerates it at merge), `plans/00-overview.md`
(unowned and unresolved), and every file on the `s5-errors` agent's list — `model/errors.ts`,
`data/transaction.ts`, `view/gesture-pipeline.ts`, `view/entry-gesture-context.ts`, `view/styles.ts`,
`extensions/plugin-runtime.ts`, `extensions/features/inline-editing.ts`, `harness/editing.ts`.
