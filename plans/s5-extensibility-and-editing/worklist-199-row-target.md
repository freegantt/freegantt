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

---

# Second half — #199 reopened: the Selection decides, and #205 with it

**Owner:** the `s5-rightclick` agent · **Branch:** `s5-rightclick` · **Base:** `s5-start`

The first half above stands. `DomTarget.entryIds` and `FrameLayout.entryIdsForRow` are what this
builds on; nothing from `4293277` or `3a11c6b` is reverted.

## The rule the repo owner restated

> A right-click acts on the Selection when the thing you clicked is part of it. It acts on the thing
> you clicked when it is not.

| You do this | The command acts on | Before |
| --- | --- | --- |
| Right-click a row in the Grid pane that is not selected | every Entry that row owns | correct |
| Right-click one bar on a row that owns several, not selected | that one bar's Entry | correct |
| Select several bars, then right-click one of them | every Entry in the Selection | **wrong** |

## Where the rule lives, and why there

`extensions/features/context-menu.ts`. `DomTarget` states a DOM fact — a bar names its Entry, a row
names its Entries — and it keeps doing exactly that. This is a command-layer rule, and `openAt` is
the one place that holds both the clicked target and `ctx.gantt.selectedIds`. The layer rules agree:
`extensions/` reaches the Selection through the public `Gantt` and imports nothing new (D-S5-5).

`commandTargetOf` no longer copies `entryIds` across. It takes the resolved set as its second
argument, so the one function that decides — `clickLandsInSelection` — has one call site.

## Inferred, not stated

**A right-click outside the Selection replaces the Selection with what you clicked**, before the menu
opens. Without it the command acts on Entries the user cannot see highlighted. It assigns
`gantt.selectedIds`, so it runs the same cancelable `beforeSelectionChange` an assignment runs. A
consumer that cancels keeps its Selection, and the command still acts on what the user clicked —
that is what the menu offered.

## The empty case

A header cell, the splitter and a grouping header row stand for no Entry. They are part of nothing,
so they never inherit the Selection and never replace it. `clickLandsInSelection` answers `false` for
an empty set, which is the whole of that rule.

## #205 needed no new seam

The keyboard path resolves the bar of `selectedIds[0]`, and that bar is part of the Selection. So the
same rule answers with the whole Selection, and `GanttDom` needs no `rowFor(id)`. The bar stays the
popup's **anchor**, because a popup needs a box on screen. That leaves #205's second, smaller point
open: on a multi-Entry row the popup opens over one bar, and `kind` reads `'bar'` where a right-click
on the grid row reads `'row'`.

## Boxes

- [x] `clickLandsInSelection` decides what a right-click acts on (`context-menu.ts`)
- [x] `commandTargetOf` takes the resolved set instead of copying `DomTarget.entryIds`
- [x] A right-click outside the Selection replaces the Selection first
- [x] The keyboard path (`Shift+F10`, the Menu key) runs the same rule — #205
- [x] A test per table row, plus the keyboard case, the Selection replacement, and the header cell
- [x] `api/command.ts` says what `CommandTarget.entryIds` now is
- [x] `plans/02-public-api.md` and `CONTEXT.md` say it too
- [x] The harness acts on `ctx.target.entryIds`, so the demo menu shows the rule it ships
- [x] `pnpm verify` green (104 guard / 595 node / 841 dom), `pnpm test:e2e` 70/70

## Mutation checks

Every new test was reddened by breaking its own subject, then restored.

| Break | Red |
| --- | --- |
| `clickLandsInSelection` returns `false` | the selected-bar case, and the `Shift+F10` case |
| `clickLandsInSelection` drops its empty guard | the header-cell case |
| the Selection replacement line removed | the Selection-replacement case |
| `clickLandsInSelection` returns `true` | the row case, the one-bar case, the "exactly one" case, and two more |

## Do not touch

`etc/freegantt.api.md` (generated; the coordinator regenerates it at merge — the shape did not change
here, only the doc comments). `plans/00-overview.md`. Every file in a sibling worktree.
